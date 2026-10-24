import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import type { CreateBookingResult, PublicSession } from "@/lib/types";

import { BookingForm } from "./booking-form";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  apiFetch: vi.fn(),
}));

const sessions: PublicSession[] = [
  { id: "session-1", startsAt: "2026-10-19T16:00:00Z", capacity: 6, remaining: 4 },
  { id: "session-2", startsAt: "2026-10-21T05:00:00Z", capacity: 4, remaining: 2 },
  { id: "session-full", startsAt: "2026-10-22T05:00:00Z", capacity: 4, remaining: 0 },
];
const clients: QueryClient[] = [];
const apiMock = vi.mocked(apiFetch);

function renderForm(initialSessions = sessions) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(client);
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<BookingForm classId="class-1" sessions={initialSessions} />, { wrapper: Wrapper });
}

function headcountGroup() {
  return screen.getByRole("group", { name: "인원" });
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, headcount = "2") {
  await user.click(screen.getAllByRole("radio")[0]);
  for (let count = 1; count < Number(headcount); count += 1) {
    await user.click(screen.getByRole("button", { name: "인원 늘리기" }));
  }
  await user.type(screen.getByLabelText("예약자 이름"), " 홍길동 ");
  await user.type(screen.getByLabelText("전화번호"), "010-1234-5678");
}

function expectInputsPreserved(headcount = "2") {
  expect(screen.getByLabelText("예약자 이름")).toHaveValue(" 홍길동 ");
  expect(screen.getByLabelText("전화번호")).toHaveValue("010-1234-5678");
  expect(within(headcountGroup()).getByText(`${headcount}명`)).toBeVisible();
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockReset();
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("BookingForm", () => {
  it("R-54: 라디오 그룹에 한국 시각·정원·남은 자리와 마감을 표시한다", () => {
    renderForm();

    const group = screen.getByRole("radiogroup", { name: "회차" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByText("10월 20일 (화)")).toBeVisible();
    expect(within(group).getByText("오전 1:00")).toBeVisible();
    expect(within(group).queryByText(/정원/)).not.toBeInTheDocument();
    expect(within(group).getByText("4자리 남음")).toBeVisible();
    expect(within(group).getByText("2자리 남음")).toBeVisible();
    expect(within(group).getByText("마감")).toBeVisible();
    expect(screen.queryByText(/한국 시각 기준/)).not.toBeInTheDocument();
  });

  it("R-54: 마감 회차를 선택할 수 없다", async () => {
    const user = userEvent.setup();
    renderForm();

    const full = screen.getByRole("radio", { name: /마감/ });
    expect(full).toBeDisabled();
    await user.click(full);
    expect(full).not.toBeChecked();
  });

  it("R-12: 인원은 1~4명만 고르고 이름·전화번호에 라벨과 자동완성을 제공한다", async () => {
    const user = userEvent.setup();
    renderForm();

    expect(within(headcountGroup()).getByText("1명")).toBeVisible();
    expect(screen.getByText("최대 4명까지 신청 가능")).toBeVisible();
    expect(screen.getByRole("button", { name: "인원 줄이기" })).toBeDisabled();
    for (let count = 1; count < 4; count += 1) await user.click(screen.getByRole("button", { name: "인원 늘리기" }));
    expect(within(headcountGroup()).getByText("4명")).toBeVisible();
    expect(screen.getByRole("button", { name: "인원 늘리기" })).toBeDisabled();
    expect(screen.getByLabelText("예약자 이름")).toHaveAttribute("autocomplete", "name");
    expect(screen.getByLabelText("전화번호")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("전화번호")).toHaveAttribute("inputmode", "tel");
    expect(screen.getByLabelText("전화번호")).toHaveAccessibleDescription("하이픈 없이 입력해도 됩니다. 결과 조회 때 뒷자리 4자리를 사용합니다.");
  });

  it("R-12: 빈 이름·짧은 전화번호는 공유 검증의 필드 오류를 표시하고 요청하지 않는다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getAllByRole("radio")[0]);
    await user.type(screen.getByLabelText("전화번호"), "010");
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(screen.getByLabelText("예약자 이름")).toHaveAccessibleDescription("예약자 이름을 입력해 주세요.");
    expect(screen.getByLabelText("전화번호")).toHaveAccessibleDescription("전화번호는 숫자 10~11자리로 입력해 주세요.");
    expect(screen.getByLabelText("전화번호")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("예약자 이름")).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-12: 전화번호는 칸을 벗어날 때 형식을 확인하고, 고치면 오류를 지운다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("전화번호"), "010-123");
    await user.tab();

    expect(screen.getByLabelText("전화번호")).toHaveAccessibleDescription("전화번호는 숫자 10~11자리로 입력해 주세요.");
    await user.type(screen.getByLabelText("전화번호"), "4-5678");
    expect(screen.getByLabelText("전화번호")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("예약자 이름")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("R-54: 회차를 고르지 않으면 필드 오류를 표시하고 요청하지 않는다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription("회차를 선택해 주세요.");
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-11: 남은 자리보다 많은 인원은 고르는 즉시 안내하고 제출하면 인원으로 포커스를 옮긴다", async () => {
    const user = userEvent.setup();
    renderForm();
    await fillForm(user, "3");
    await user.click(screen.getAllByRole("radio")[1]);

    expect(headcountGroup()).toHaveAccessibleDescription("남은 자리보다 많은 인원은 신청할 수 없습니다.");
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));
    expect(screen.getByRole("button", { name: "인원 줄이기" })).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
    expectInputsPreserved("3");
  });

  it("R-10, R-31: 수동 승인 방식과 상태별 취소 기한을 신청 버튼 바로 위 안내 상자에 줄을 나눠 안내한다", () => {
    renderForm();

    const lines = [
      "운영자가 확인 후 승인합니다.",
      "신청 후에는 승인 대기 상태이며 참여 확정이 아닙니다.",
      "결과는 예약 조회에서 직접 확인해 주세요.",
      "취소 기한: 승인 대기는 시작 전까지, 참여 확정은 시작 24시간 전까지(정각 포함) 예약 조회에서 직접 취소할 수 있습니다.",
    ].map((text) => screen.getByText(text));
    const notice = lines[0].parentElement!;
    for (const line of lines) {
      expect(line).toBeVisible();
      expect(line.parentElement).toBe(notice);
    }
    expect(screen.getByLabelText("전화번호").compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(screen.getByRole("button", { name: "예약 신청하기" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("신청 중에는 버튼을 비활성화하고 중복 제출을 막는다", async () => {
    const user = userEvent.setup();
    let finish!: (result: CreateBookingResult) => void;
    apiMock.mockReturnValue(new Promise<CreateBookingResult>((resolve) => { finish = resolve; }));
    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    const button = await screen.findByRole("button", { name: "신청 중…" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(apiMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ code: "BK-TEST01", status: "pending" }); });
  });

  it.each(["BK-TEST01", "BK-번호 &?"])("R-10, R-16: 정규화한 입력으로 신청하고 성공한 예약번호 %s로 이동한다", async (code) => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ code, status: "pending" });
    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/bookings/complete?code=${encodeURIComponent(code)}`));
    expect(apiMock).toHaveBeenCalledExactlyOnceWith("/api/bookings", {
      method: "POST",
      json: { sessionId: "session-1", headcount: 2, customerName: "홍길동", phone: "01012345678" },
    });
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("R-11: SESSION_FULL이면 상세를 갱신하고 입력 유지·자리 변경 안내를 제공한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(new ApiError("SESSION_FULL", "남은 자리가 부족합니다.", 409));
    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("남은 자리가 부족합니다.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    const changed = screen.getByText("남은 자리가 바뀌었습니다. 회차와 인원을 다시 확인해 주세요.");
    expect(changed).toBeVisible();
    expect(changed.compareDocumentPosition(screen.getByRole("radiogroup")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expectInputsPreserved();
    expect(screen.getAllByRole("radio")[0]).toBeChecked();
    expect(screen.getByRole("button", { name: "예약 신청하기" })).toBeEnabled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("R-16: 중복 신청은 서버 메시지를 표시하고 입력을 유지하며 갱신하지 않는다", async () => {
    const user = userEvent.setup();
    const message = "이미 같은 전화번호로 신청한 예약이 있습니다.";
    apiMock.mockRejectedValue(new ApiError("DUPLICATE_BOOKING", message, 409));
    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: "예약 조회로 이동" })).toHaveAttribute("href", "/bookings/lookup");
    expectInputsPreserved();
    expect(screen.getAllByRole("radio")[0]).toBeChecked();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it.each(["SESSION_STARTED", "SESSION_CANCELLED", "NOT_FOUND"] as const)(
    "R-13, R-14, R-52: %s 실패 시 서버 사유를 표시하고 상세를 갱신한다",
    async (code) => {
      const user = userEvent.setup();
      apiMock.mockRejectedValue(new ApiError(code, "선택한 회차에 신청할 수 없습니다.", 409));
      renderForm();
      await fillForm(user);
      await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("선택한 회차에 신청할 수 없습니다.");
      expect(router.refresh).toHaveBeenCalledTimes(1);
      expectInputsPreserved();
    },
  );

  it("서버 fields를 해당 필드에 표시하고 수정 후 다시 신청할 수 있다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(Object.assign(new ApiError("VALIDATION_ERROR", "입력 내용을 확인해 주세요.", 400), {
      fields: { phone: "전화번호를 다시 확인해 주세요." },
    })).mockResolvedValueOnce({ code: "BK-RETRY", status: "pending" });
    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("입력 내용을 확인해 주세요.");
    expect(screen.getByLabelText("전화번호")).toHaveAccessibleDescription("전화번호를 다시 확인해 주세요.");
    expect(screen.getByLabelText("전화번호")).toHaveFocus();
    expectInputsPreserved();
    await user.clear(screen.getByLabelText("전화번호"));
    await user.type(screen.getByLabelText("전화번호"), "01098765432");
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/bookings/complete?code=BK-RETRY"));
    expect(screen.queryByText("전화번호를 다시 확인해 주세요.")).not.toBeInTheDocument();
  });

  it.each(["사라짐", "마감"])("R-54: 갱신 후 선택 회차가 %s 상태이면 선택만 해제하고 다시 고르도록 안내한다", async (change) => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await fillForm(user);

    const next = change === "사라짐"
      ? sessions.slice(1)
      : sessions.map((session) => session.id === "session-1" ? { ...session, remaining: 0 } : session);
    rerender(<BookingForm classId="class-1" sessions={next} />);

    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription(/다시 선택해 주세요/);
    expectInputsPreserved();
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-11: 갱신 후 남은 자리가 줄면 기존 선택·입력을 유지하고 최신 자리로 검증한다", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await fillForm(user, "3");
    rerender(<BookingForm classId="class-1" sessions={sessions.map((session) => ({ ...session, remaining: 1 }))} />);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(screen.getAllByRole("radio")[0]).toBeChecked();
    expectInputsPreserved("3");
    expect(headcountGroup()).toHaveAccessibleDescription(/남은 자리/);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("네트워크 실패 시 메시지와 입력을 유지하고 재시도할 수 있다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0));
    renderForm();
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "예약 신청하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("네트워크 연결을 확인해 주세요.");
    expectInputsPreserved();
    expect(screen.getByRole("button", { name: "예약 신청하기" })).toBeEnabled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
