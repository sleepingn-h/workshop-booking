import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import { BOOKING_STATUS_LABEL, type BookingLookupResult, type BookingStatus } from "@/lib/types";

import { BookingLookup } from "./booking-lookup";

const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  apiFetch: vi.fn(),
}));

const booking: BookingLookupResult = {
  code: "BK-TEST01",
  status: "pending",
  headcount: 2,
  class: {
    title: "도자기 만들기",
    description: "물레로 컵을 만들어요.",
    place: "서울 공방",
    durationMinutes: 120,
    price: 45000,
    paymentMethod: "현장 결제",
    materials: "없음",
    contact: "02-123-4567",
  },
  session: { startsAt: "2026-10-19T16:00:00Z", status: "scheduled" },
  canCancel: true,
  cancelDeadline: "2026-10-19T16:00:00Z",
};
const apiMock = vi.mocked(apiFetch);
const clients: QueryClient[] = [];

function renderLookup(initialCode?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}><BookingLookup initialCode={initialCode} /></QueryClientProvider>);
  return client;
}

async function submitLookup(user: ReturnType<typeof userEvent.setup>, code = booking.code, phoneLast4 = "0007") {
  const codeInput = screen.getByLabelText("예약번호");
  await user.clear(codeInput);
  if (code) await user.type(codeInput, code);
  const phoneInput = screen.getByLabelText("전화번호 뒷자리 4자리");
  await user.clear(phoneInput);
  if (phoneLast4) await user.type(phoneInput, phoneLast4);
  await user.click(screen.getByRole("button", { name: "조회하기" }));
}

async function openCancel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "예약 취소" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockReset();
  apiMock.mockResolvedValue(booking);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("BookingLookup", () => {
  it("R-30: initialCode를 미리 채우고 네 자리 숫자 입력을 제공하되 제출 전에는 조회하지 않는다", () => {
    renderLookup(booking.code);

    expect(screen.getByLabelText("예약번호")).toHaveValue(booking.code);
    const phone = screen.getByLabelText("전화번호 뒷자리 4자리");
    expect(phone).toHaveAttribute("inputmode", "numeric");
    expect(phone).toHaveAttribute("maxlength", "4");
    expect(phone).toHaveAttribute("type", "text");
    expect(apiMock).not.toHaveBeenCalled();
  });

  it.each(["123", "abcd", ""])("R-30: 뒷자리 %s 형식 오류는 필드 가까이 표시하고 API를 호출하지 않는다", async (phone) => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user, booking.code, phone);

    expect(screen.getByLabelText("전화번호 뒷자리 4자리"))
      .toHaveAccessibleDescription("전화번호 뒷자리 숫자 4자리를 입력해 주세요.");
    expect(screen.getByLabelText("전화번호 뒷자리 4자리")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("전화번호 뒷자리 4자리")).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-30: 빈 예약번호는 필드 오류를 표시하고 조회하지 않는다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user, "");

    expect(screen.getByLabelText("예약번호")).toHaveAccessibleDescription("예약번호를 입력해 주세요.");
    expect(screen.getByLabelText("예약번호")).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-30: 예약번호를 정규화하고 뒷자리의 앞자리 0을 보존해 POST body로 조회한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user, " bk-test01 ");

    await screen.findByText(booking.class.title);
    expect(apiMock).toHaveBeenCalledExactlyOnceWith("/api/bookings/lookup", {
      method: "POST", json: { code: booking.code, phoneLast4: "0007" },
    });
  });

  it("조회 중에는 로딩을 알리고 버튼을 비활성화해 중복 제출을 막는다", async () => {
    const user = userEvent.setup();
    let finish!: (value: BookingLookupResult) => void;
    apiMock.mockReturnValue(new Promise<BookingLookupResult>((resolve) => { finish = resolve; }));
    renderLookup();
    await submitLookup(user);

    expect(screen.getByRole("status")).toHaveTextContent("예약을 조회하고 있습니다");
    const button = screen.getByRole("button", { name: "조회 중…" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(apiMock).toHaveBeenCalledTimes(1);
    await act(async () => { finish(booking); });
  });

  it("R-30: BOOKING_NOT_FOUND는 잘못된 인증값을 구분하지 않고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(new ApiError("BOOKING_NOT_FOUND", "전화번호가 틀렸습니다", 404));
    renderLookup();
    await submitLookup(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("예약번호 또는 전화번호 뒷자리를 다시 확인해 주세요");
    expect(alert.nextElementSibling).toHaveTextContent("예약번호를 분실하셨나요? 공방에 예약자 이름과 전체 전화번호로 문의해 주세요.");
    expect(screen.queryByText("전화번호가 틀렸습니다")).not.toBeInTheDocument();
    expect(screen.queryByText(booking.class.title)).not.toBeInTheDocument();
    expect(screen.getByLabelText("예약번호")).toHaveValue(booking.code);
    expect(screen.getByLabelText("전화번호 뒷자리 4자리")).toHaveValue("0007");
  });

  it("조회 실패는 서버 사유와 재시도 버튼을 표시하고 다시 요청할 수 있다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0));
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("예약을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByText(booking.class.title)).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it.each<BookingStatus>(["pending", "confirmed", "rejected", "cancelled"])("R-33: %s 상태를 고객용 텍스트 배지로 표시한다", async (status) => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status, canCancel: false, cancelDeadline: null });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText(BOOKING_STATUS_LABEL[status])).toBeVisible();
  });

  it("R-31, R-33, R-53: 클래스 소개·안내 항목·인원·회차와 확정 예약의 취소 기한을 한국 시각으로 표시한다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status: "confirmed", cancelDeadline: "2026-10-18T16:00:00Z" });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText(booking.class.title)).toBeVisible();
    expect(screen.getByText("10월 20일 (화) 오전 1:00")).toBeVisible();
    expect(screen.getByText(/10월 19일 \(월\) 오전 1:00/)).toBeVisible();
    expect(screen.getByText("2명")).toBeVisible();
    expect(screen.getByText("서울 공방")).toBeVisible();
    expect(screen.getByText("₩45,000")).toBeVisible();
    expect(screen.getByText("현장 결제")).toBeVisible();
    expect(screen.getByText("물레로 컵을 만들어요.")).toBeVisible();
    expect(screen.getByRole("link", { name: "02-123-4567" })).toHaveAttribute("href", "tel:021234567");
    expect(screen.getByText(/한국 시각 기준/)).toBeVisible();
    expect(screen.getByText(/직접 취소 기한/)).toBeVisible();
    expect(screen.getByText(/정확히 24시간 전도 포함/)).toBeVisible();
  });

  it("R-33: 승인 대기는 참여 확정이 아니라는 안내를 표시한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText("승인 대기는 참여 확정이 아닙니다")).toBeVisible();
    expect(screen.queryByText(/참여 미확정 — 공방에 문의/)).not.toBeInTheDocument();
    expect(screen.getByText(/시작 시각 전까지/)).toBeVisible();
  });

  it("R-31, R-33: 시작 후 pending은 서버의 취소 불가 판정에 따라 참여 미확정과 문의를 안내한다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, canCancel: false });
    renderLookup();
    await submitLookup(user);

    const unconfirmed = await screen.findByText("참여 미확정 — 공방에 문의해 주세요");
    expect(unconfirmed).toBeVisible();
    expect(unconfirmed.compareDocumentPosition(screen.getByText("승인 대기")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/직접 취소할 수 있는 기한이 지났습니다/)).toBeVisible();
    expect(screen.getByRole("button", { name: "예약 취소" })).toBeDisabled();
  });

  it("R-31, R-32: 취소 불가인 확정 예약에는 취소 버튼 없이 기한 경과·공방 문의를 안내한다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status: "confirmed", canCancel: false });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText(/직접 취소할 수 있는 기한이 지났습니다.*공방에 문의해 주세요.*문의만으로 취소가 완료되지는 않습니다/)).toBeVisible();
    expect(screen.getByRole("button", { name: "예약 취소" })).toBeDisabled();
    expect(screen.getAllByRole("link", { name: "02-123-4567" }).length).toBeGreaterThan(0);
  });

  it("R-21, R-42: 취소된 회차와 최종 상태 예약을 조회하되 취소 버튼이나 기한 경과 안내를 표시하지 않는다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({
      ...booking, status: "cancelled", canCancel: false, cancelDeadline: null,
      session: { ...booking.session, status: "cancelled" },
    });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText("취소된 회차")).toBeVisible();
    expect(screen.getByText("취소됨")).toBeVisible();
    expect(screen.queryByRole("button", { name: "예약 취소" })).not.toBeInTheDocument();
    expect(screen.queryByText(/기한이 지났습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다른 회차 신청하기" })).toHaveAttribute("href", "/");
  });

  it("R-33: 다시 조회는 상태 가까이, 예약 취소는 상세 아래에 떨어뜨려 둔다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    const refresh = await screen.findByRole("button", { name: "다시 조회" });
    const details = screen.getByText("회차 시작");
    const cancel = screen.getByRole("button", { name: "예약 취소" });
    expect(refresh.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R-33, R-58: 다시 조회로 최신 상태와 클래스 안내 항목을 갱신한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await screen.findByText("승인 대기");
    apiMock.mockResolvedValue({ ...booking, status: "confirmed", class: { ...booking.class, contact: "02-987-6543", materials: "앞치마" } });
    await user.click(screen.getByRole("button", { name: "다시 조회" }));

    expect(await screen.findByText("참여 확정")).toBeVisible();
    expect(screen.getByRole("link", { name: "02-987-6543" })).toBeVisible();
    expect(screen.getByText("앞치마")).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("R-30: 같은 인증값으로 폼을 다시 제출해도 다시 조회한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await screen.findByText(booking.class.title);
    await user.click(screen.getByRole("button", { name: "조회하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  it("R-30: 다른 인증값으로 조회하면 이전 예약 정보를 숨기고 새 인증값만 사용한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await screen.findByText(booking.class.title);
    apiMock.mockRejectedValue(new ApiError("BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.", 404));
    await submitLookup(user, "BK-OTHER1", "1234");

    await screen.findByRole("alert");
    expect(screen.queryByText(booking.class.title)).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenLastCalledWith("/api/bookings/lookup", {
      method: "POST", json: { code: "BK-OTHER1", phoneLast4: "1234" },
    });
  });

  it("R-31: 취소 확인에서 돌아가면 cancel API를 호출하지 않고 포커스를 돌려준다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    const dialog = await openCancel(user);
    expect(dialog).toHaveAccessibleName("예약을 취소할까요?");
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "예약 취소" })).toHaveFocus();
  });

  it("R-31: 취소 확정은 조회에 사용한 인증값으로 요청하고 쿼리를 무효화해 재조회한다", async () => {
    const user = userEvent.setup();
    const client = renderLookup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await submitLookup(user);
    const dialog = await openCancel(user);
    // 폼 입력을 편집해도 화면에 표시된 예약의 제출 당시 인증값으로 취소한다.
    fireEvent.change(screen.getByLabelText("전화번호 뒷자리 4자리"), { target: { value: "9999" } });
    const cancelled = { ...booking, status: "cancelled", canCancel: false, cancelDeadline: null };
    apiMock.mockResolvedValue(cancelled);
    await user.click(within(dialog).getByRole("button", { name: "예약 취소" }));

    expect(await screen.findByText("취소됨")).toBeVisible();
    expect(apiMock).toHaveBeenNthCalledWith(2, "/api/bookings/BK-TEST01/cancel", {
      method: "POST", json: { phoneLast4: "0007" },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["booking", booking.code, "0007"] });
    expect(apiMock).toHaveBeenNthCalledWith(3, "/api/bookings/lookup", {
      method: "POST", json: { code: booking.code, phoneLast4: "0007" },
    });
    expect(toast.success).toHaveBeenCalledWith("예약이 취소되었습니다");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("취소 요청 중에는 확인·돌아가기 버튼을 비활성화하고 중복 요청을 막는다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    const dialog = await openCancel(user);
    let finish!: (value: BookingLookupResult) => void;
    apiMock.mockReturnValueOnce(new Promise<BookingLookupResult>((resolve) => { finish = resolve; }));
    await user.click(within(dialog).getByRole("button", { name: "예약 취소" }));

    const button = await within(dialog).findByRole("button", { name: "취소 중…" });
    expect(button).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeDisabled();
    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(2);
    apiMock.mockResolvedValue({ ...booking, status: "cancelled", canCancel: false, cancelDeadline: null });
    await act(async () => { finish({ ...booking, status: "cancelled", canCancel: false, cancelDeadline: null }); });
    await screen.findByText("취소됨");
  });

  it("R-31: 취소 실패는 다이얼로그에 서버 메시지를 표시하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    const dialog = await openCancel(user);
    const message = "직접 취소할 수 있는 기한이 지났습니다. 공방에 문의해 주세요.";
    apiMock.mockRejectedValueOnce(new ApiError("CANCEL_DEADLINE_PASSED", message, 409));
    await user.click(within(dialog).getByRole("button", { name: "예약 취소" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(within(dialog).getByRole("button", { name: "예약 취소" })).toBeEnabled();
    expect(screen.getByLabelText("전화번호 뒷자리 4자리")).toHaveValue("0007");
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("R-30, R-31: 키보드로 입력·조회하고 확인 다이얼로그에서 취소할 수 있다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await user.tab();
    expect(screen.getByLabelText("예약번호")).toHaveFocus();
    await user.keyboard(booking.code);
    await user.tab();
    await user.keyboard("0007{Enter}");
    await screen.findByText(booking.class.title);
    screen.getByRole("button", { name: "예약 취소" }).focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "돌아가기" })).toHaveFocus());
    await user.tab();
    expect(within(dialog).getByRole("button", { name: "예약 취소" })).toHaveFocus();
    apiMock.mockResolvedValue({ ...booking, status: "cancelled", canCancel: false, cancelDeadline: null });
    await user.keyboard("{Enter}");
    expect(await screen.findByText("취소됨")).toBeVisible();
  });
});
