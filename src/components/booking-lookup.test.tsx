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

// Next.js 라우터처럼 history.pushState·replaceState와 뒤로·앞으로 가기를 useSearchParams에 반영한다.
const navigation = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      window.addEventListener("popstate", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("popstate", listener);
      };
    },
    notify() { listeners.forEach((listener) => listener()); },
  };
});
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(navigation.subscribe, () => window.location.search)),
  };
});
for (const method of ["pushState", "replaceState"] as const) {
  const original = window.history[method].bind(window.history);
  vi.spyOn(window.history, method).mockImplementation((...args) => {
    original(...args);
    navigation.notify();
  });
}
vi.spyOn(window, "scrollTo").mockImplementation(() => {});

const booking: BookingLookupResult = {
  code: "BK-TEST01",
  status: "pending",
  headcount: 2,
  customer: { name: "이*윤", phone: "010-****-0007" },
  class: {
    id: "10000000-0000-4000-8000-000000000001",
    title: "도자기 만들기",
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

function findResultTitle() {
  return screen.findByRole("heading", { level: 1, name: booking.class.title });
}

function findLookupForm() {
  return screen.findByRole("form", { name: "예약 조회" });
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockReset();
  apiMock.mockResolvedValue(booking);
  window.history.replaceState(null, "", "/bookings/lookup");
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

  it("R-30: 조회에 성공하면 입력 폼 대신 결과 화면으로 바꾸고 주소에 뒷자리를 남기지 않는다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    const title = await findResultTitle();
    expect(title).toHaveFocus();
    expect(screen.queryByRole("form", { name: "예약 조회" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "예약 조회" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("?code=BK-TEST01&view=result");
    expect(window.history.pushState).toHaveBeenCalledOnce();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("R-30: 뒤로 가기는 입력을 유지한 폼으로, 앞으로 가기는 다시 요청하지 않고 결과 화면으로 돌아간다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await findResultTitle();

    window.history.back();
    expect(await findLookupForm()).toBeVisible();
    expect(screen.getByLabelText("예약번호")).toHaveValue(booking.code);
    expect(screen.getByLabelText("전화번호 뒷자리 4자리")).toHaveValue("0007");
    expect(screen.queryByText(booking.class.title)).not.toBeInTheDocument();

    window.history.forward();
    expect(await findResultTitle()).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it("R-30: 결과 화면 맨 위에는 다른 예약 조회 대신 클래스 목록 링크를 둔다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    const list = await screen.findByRole("link", { name: "클래스 목록" });
    expect(list).toHaveAttribute("href", "/");
    expect(list.compareDocumentPosition(await findResultTitle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다른 예약 조회" })).not.toBeInTheDocument();
  });

  it("R-30, R-52: 공개 클래스는 결과 제목 옆에 신청한 클래스 상세 링크를 둔다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    const title = await findResultTitle();
    const detail = screen.getByRole("link", { name: "클래스 상세 보기" });
    expect(detail).toHaveAttribute("href", `/classes/${booking.class.id}`);
    expect(title.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(detail.compareDocumentPosition(screen.getByText("일시")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "클래스 상세 보기" })).toHaveLength(1);
  });

  it("R-30, R-52: 비공개 클래스는 상세가 열리지 않으므로 상세 링크를 두지 않는다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, class: { ...booking.class, id: null } });
    renderLookup();
    await submitLookup(user);

    await findResultTitle();
    expect(screen.queryByRole("link", { name: "클래스 상세 보기" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "클래스 목록" })).toHaveAttribute("href", "/");
  });

  it("R-30: 조회 결과 없이 결과 주소를 열면 폼을 보여주고, 조회하면 기록을 늘리지 않고 결과로 바꾼다", async () => {
    window.history.replaceState(null, "", "/bookings/lookup?code=BK-TEST01&view=result");
    const user = userEvent.setup();
    renderLookup(booking.code);

    expect(await findLookupForm()).toBeVisible();
    expect(screen.getByLabelText("예약번호")).toHaveValue(booking.code);
    expect(apiMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("전화번호 뒷자리 4자리"), "0007");
    await user.click(screen.getByRole("button", { name: "조회하기" }));

    expect(await findResultTitle()).toBeVisible();
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "?code=BK-TEST01&view=result");
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
    expect(screen.getByRole("form", { name: "예약 조회" })).toBeVisible();
    expect(screen.getByLabelText("예약번호")).toHaveValue(booking.code);
    expect(screen.getByLabelText("전화번호 뒷자리 4자리")).toHaveValue("0007");
    expect(window.location.search).toBe("");
  });

  it("조회 실패는 폼 아래에 서버 사유와 재시도 버튼을 표시하고, 재시도에 성공하면 결과 화면으로 바꾼다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0));
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("예약을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    expect(screen.getByRole("form", { name: "예약 조회" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await findResultTitle()).toBeVisible();
    expect(window.location.search).toBe("?code=BK-TEST01&view=result");
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("결과 화면에서 다시 조회가 실패하면 결과 화면에 머물며 재시도할 수 있다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await findResultTitle();
    apiMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0));
    await user.click(screen.getByRole("button", { name: "다시 조회" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("예약을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.");
    expect(screen.queryByRole("form", { name: "예약 조회" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "클래스 목록" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await findResultTitle()).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(3);
  });

  it.each<BookingStatus>(["pending", "confirmed", "rejected", "cancelled"])("R-33: %s 상태를 고객용 텍스트 배지로 표시한다", async (status) => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status, canCancel: false, cancelDeadline: null });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText(BOOKING_STATUS_LABEL[status])).toBeVisible();
  });

  it("R-31, R-33, R-58: 신청자·일시·장소·인원(예상 비용)·결제 방법·문의처만 차례로 표시하고 확정 예약의 취소 기한을 한국 시각으로 표시한다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status: "confirmed", cancelDeadline: "2026-10-18T16:00:00Z" });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText(booking.class.title)).toBeVisible();
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["신청자", "일시", "장소", "인원", "결제 방법", "문의처"]);
    expect(screen.getByText("10월 20일 (화) 오전 1:00–오전 3:00")).toBeVisible();
    expect(screen.getByText(/10월 19일 \(월\) 오전 1:00/)).toBeVisible();
    expect(screen.getByText("2명 (예상 비용 ₩90,000)")).toBeVisible();
    expect(screen.getByText("현장 결제")).toBeVisible();
    expect(screen.getByText("서울 공방")).toBeVisible();
    expect(screen.getByText("이*윤 · 010-****-0007")).toBeVisible();
    expect(screen.getByRole("link", { name: "02-123-4567" })).toHaveAttribute("href", "tel:021234567");
    expect(screen.queryByRole("heading", { name: /클래스 안내/ })).not.toBeInTheDocument();
    expect(screen.queryByText("₩45,000")).not.toBeInTheDocument();
    expect(screen.queryByText("없음")).not.toBeInTheDocument();
    expect(screen.queryByText(booking.code)).not.toBeInTheDocument();
    expect(screen.queryByText(/한국 시각 기준/)).not.toBeInTheDocument();
    expect(screen.getByText(/직접 취소 기한/)).toBeVisible();
    expect(screen.getByText(/정확히 24시간 전도 포함/)).toBeVisible();
  });

  it("R-33: 비용이 0원인 클래스는 예상 비용을 무료로 표시한다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, headcount: 3, class: { ...booking.class, price: 0 } });
    renderLookup();
    await submitLookup(user);

    expect(await screen.findByText("3명 (예상 비용 무료)")).toBeVisible();
  });

  it("R-33: 승인 대기는 참여 확정이 아니라는 안내를 취소 기한과 직접 취소 안내 사이에 표시한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    const meaning = await screen.findByText("승인 대기는 참여 확정이 아닙니다.");
    const deadline = screen.getByText(/직접 취소 기한/);
    const policy = screen.getByText("승인 대기는 회차 시작 시각 전까지 직접 취소할 수 있습니다.");
    expect(meaning).toBeVisible();
    expect(meaning.parentElement).toBe(policy.parentElement);
    expect(deadline.compareDocumentPosition(meaning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meaning.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/참여 미확정 — 공방에 문의/)).not.toBeInTheDocument();
  });

  it.each([
    { status: "rejected", text: "이번 신청은 확정되지 않았습니다. 다른 회차로 다시 신청해 주세요." },
    { status: "cancelled", text: "취소된 예약입니다. 다시 참여하려면 새로 신청해 주세요." },
  ] as const)("R-33: $status 예약도 상태 안내를 회차 정보 아래 안내 상자에 표시한다", async ({ status, text }) => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status, canCancel: false, cancelDeadline: null });
    renderLookup();
    await submitLookup(user);

    const meaning = await screen.findByText(text);
    expect(screen.getByText("일시").compareDocumentPosition(meaning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(screen.getByRole("link", { name: "02-123-4567" })).toBeVisible();
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

  it("R-31, R-33: 상세 아래에 직접 취소 기한을 두고, 그 아래 같은 줄의 양 끝에 예약 취소와 다시 조회를 둔다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);

    const refresh = await screen.findByRole("button", { name: "다시 조회" });
    const contact = screen.getByRole("link", { name: "02-123-4567" });
    const deadline = screen.getByText(/직접 취소 기한/);
    const cancel = screen.getByRole("button", { name: "예약 취소" });
    expect(contact.compareDocumentPosition(deadline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(deadline.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(refresh.parentElement).toBe(cancel.parentElement);
    expect(cancel.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R-33: 최종 상태 예약도 다른 회차 신청하기와 같은 줄에서 다시 조회할 수 있다", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValue({ ...booking, status: "rejected", canCancel: false, cancelDeadline: null });
    renderLookup();
    await submitLookup(user);

    const refresh = await screen.findByRole("button", { name: "다시 조회" });
    const apply = screen.getByRole("link", { name: "다른 회차 신청하기" });
    expect(refresh.parentElement).toBe(apply.parentElement);
    expect(screen.getByText("일시").compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("R-33, R-58: 다시 조회로 최신 상태와 장소·예상 비용·결제 방법·문의처·종료 시각을 갱신한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await screen.findByText("승인 대기");
    apiMock.mockResolvedValue({
      ...booking, status: "confirmed",
      class: { ...booking.class, place: "부산 공방", contact: "02-987-6543", durationMinutes: 90, price: 30000, paymentMethod: "계좌 이체" },
    });
    await user.click(screen.getByRole("button", { name: "다시 조회" }));

    expect(await screen.findByText("참여 확정")).toBeVisible();
    expect(screen.getByText("부산 공방")).toBeVisible();
    expect(screen.getByText("2명 (예상 비용 ₩60,000)")).toBeVisible();
    expect(screen.getByText("계좌 이체")).toBeVisible();
    expect(screen.getByRole("link", { name: "02-987-6543" })).toBeVisible();
    expect(screen.getByText("10월 20일 (화) 오전 1:00–오전 2:30")).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("R-30: 뒤로 가서 같은 인증값으로 폼을 다시 제출해도 다시 조회한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await findResultTitle();
    window.history.back();
    await findLookupForm();
    await user.click(screen.getByRole("button", { name: "조회하기" }));

    expect(await findResultTitle()).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it("R-30: 다른 인증값으로 조회하면 이전 예약 정보를 숨기고 새 인증값만 사용한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    await findResultTitle();
    window.history.back();
    await findLookupForm();
    apiMock.mockRejectedValue(new ApiError("BOOKING_NOT_FOUND", "예약을 찾을 수 없습니다.", 404));
    await submitLookup(user, "BK-OTHER1", "1234");

    await screen.findByRole("alert");
    expect(screen.queryByText(booking.class.title)).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
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

  it("R-31: 취소 실패는 다이얼로그를 유지한 채 서버 메시지를 표시한다", async () => {
    const user = userEvent.setup();
    renderLookup();
    await submitLookup(user);
    const dialog = await openCancel(user);
    const message = "직접 취소할 수 있는 기한이 지났습니다. 공방에 문의해 주세요.";
    apiMock.mockRejectedValueOnce(new ApiError("CANCEL_DEADLINE_PASSED", message, 409));
    await user.click(within(dialog).getByRole("button", { name: "예약 취소" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(within(dialog).getByRole("button", { name: "예약 취소" })).toBeEnabled();
    expect(screen.getByRole("dialog")).toBeVisible();
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
