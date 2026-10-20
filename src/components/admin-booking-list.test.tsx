import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime } from "@/lib/format";
import type { AdminBooking, AdminBookingList } from "@/lib/types";

import { AdminBookingList as BookingList } from "./admin-booking-list";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
const now = new Date("2026-10-19T00:00:00Z");
const started = "2026-10-18T05:00:00Z";
const booking: AdminBooking = {
  id: "booking-1", code: "BK-TEST01", status: "pending", headcount: 2,
  customerName: "김공방", phone: "01012340007", classTitle: "도자기 만들기",
  sessionId: "session-1", sessionStartsAt: "2026-10-22T16:00:00Z", sessionStatus: "scheduled",
};
const sessions: AdminBookingList["sessions"] = [
  { id: booking.sessionId, classTitle: booking.classTitle, startsAt: booking.sessionStartsAt, status: "scheduled" },
  { id: "session-2", classTitle: "향수 만들기", startsAt: "2026-10-23T16:00:00Z", status: "cancelled" },
  { id: "session-3", classTitle: "캔들 만들기", startsAt: started, status: "scheduled" },
];
const person = (id: number, status: AdminBooking["status"], extra: Partial<AdminBooking> = {}): AdminBooking => ({
  ...booking, id: `booking-${id}`, code: `BK-TEST0${id}`, customerName: `예약자${id}`, status, ...extra,
});
let rows: AdminBooking[];
const clients: QueryClient[] = [];
function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><BookingList /></QueryClientProvider>);
  return client;
}
function bookingRow(name = booking.customerName) { return screen.getByRole("row", { name: new RegExp(name) }); }
function listCalls() { return apiMock.mock.calls.filter(([url, init]) => !init?.method && !String(url).includes("status=")); }
function lastParams() { return new URL(String(listCalls().at(-1)![0]), "http://localhost").searchParams; }
function changes() { return apiMock.mock.calls.filter(([, init]) => init?.method); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  rows = [booking];
  apiMock.mockReset();
  apiMock.mockImplementation(async (url, init) => {
    if (init?.method) return { ok: true };
    const status = new URL(String(url), "http://localhost").searchParams.get("status");
    return { sessions, bookings: rows.filter((row) => !status || row.status === status) };
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); });

describe("AdminBookingList 조회", () => {
  it("R-19: 이름·전체 전화번호·예약번호·인원·KST 회차·상태를 표시한다", async () => {
    renderList();
    await screen.findByText(booking.customerName);
    const row = within(bookingRow());
    for (const text of ["010-1234-0007", booking.code, booking.classTitle, "2명", formatKstDateTime(booking.sessionStartsAt), "승인 대기"]) {
      expect(row.getByText(text)).toBeVisible();
    }
    expect(screen.getByRole("option", { name: `향수 만들기 · ${formatKstDateTime(sessions[1].startsAt)} (취소된 회차)` })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: `캔들 만들기 · ${formatKstDateTime(started)} (지난 회차)` })).toBeInTheDocument();
  });

  it("R-17, R-22: 제목 아래 필터와 관계없는 전체 승인 대기 건수와 승인 가능 시점을 표시한다", async () => {
    rows = [booking, person(2, "pending", { sessionId: "session-3" }), person(3, "confirmed")];
    const user = userEvent.setup(); renderList();
    expect(screen.getByRole("heading", { level: 1, name: "예약 관리" })).toBeVisible();
    const summary = screen.getByText(/시작 전 회차만 승인할 수 있어요/);
    await waitFor(() => expect(summary).toHaveTextContent("승인 대기 2건 · 시작 전 회차만 승인할 수 있어요"));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/bookings?status=pending");
    await user.selectOptions(screen.getByLabelText("회차"), "session-2");
    await waitFor(() => expect(lastParams().get("sessionId")).toBe("session-2"));
    expect(summary).toHaveTextContent("승인 대기 2건");
  });

  it.each(["김공방", "010-1234-0007", "김&공방"])("R-19: 검색어 %s는 입력을 멈추면 q로 전달한다", async (q) => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    const input = screen.getByLabelText("예약자 검색");
    expect(input).toHaveAttribute("placeholder", "이름 또는 전화번호");
    await user.type(input, q);
    await waitFor(() => expect(lastParams().get("q")).toBe(q));
    expect(screen.queryByRole("button", { name: "검색" })).not.toBeInTheDocument();
  });

  it("R-19: Enter 검색과 회차 필터를 함께 적용하고 전체 선택지를 유지한다", async () => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    await user.type(screen.getByLabelText("예약자 검색"), " 김공방 {Enter}");
    await waitFor(() => expect(lastParams().get("q")).toBe("김공방"));
    await user.selectOptions(screen.getByLabelText("회차"), "session-2");
    await waitFor(() => expect(lastParams().get("sessionId")).toBe("session-2"));
    expect(lastParams().get("q")).toBe("김공방");
    expect(lastParams().has("status")).toBe(false);
    expect(within(screen.getByLabelText("회차")).getAllByRole("option")).toHaveLength(4);
    await user.selectOptions(screen.getByLabelText("회차"), "");
    await user.clear(screen.getByLabelText("예약자 검색"));
    await waitFor(() => expect(lastParams().size).toBe(0));
  });

  it("R-20: 상태 탭은 회차·검색 결과 기준 건수를 보여주고 서버 재요청 없이 목록을 거른다", async () => {
    rows = [booking, person(2, "confirmed"), person(3, "confirmed"), person(4, "rejected"), person(5, "cancelled")];
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    const tabs = within(screen.getByRole("tablist", { name: "예약 상태" })).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["전체 5", "대기 1", "확정 2", "거절 1", "취소 1"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    const requests = listCalls().length;
    await user.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent?.replace(/010.*/, ""))).toEqual(["예약자2", "예약자3"]);
    expect(listCalls()).toHaveLength(requests);
    await user.click(tabs[3]);
    expect(screen.getByText("예약자4")).toBeVisible();
    expect(screen.queryByText(booking.customerName)).not.toBeInTheDocument();
  });

  it("상태 탭은 방향키로 이동하며 선택한다", async () => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    await user.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(tabs[4]).toHaveFocus();
    expect(tabs[4]).toHaveAttribute("aria-selected", "true");
  });

  it("R-20: 처리할 승인 대기 예약을 먼저 보여주고 나머지는 회차 순서를 유지한다", async () => {
    rows = [person(0, "confirmed", { customerName: "이확정" }), booking, person(2, "pending", { customerName: "박대기" })];
    renderList(); await screen.findByText(booking.customerName);
    const names = screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
    expect(names.map((name) => name?.replace(/010.*/, ""))).toEqual(["김공방", "박대기", "이확정"]);
  });

  it("R-42: 취소된 회차는 예약 취소 상태와 구분해 표시한다", async () => {
    rows = [{ ...booking, sessionStatus: "cancelled", status: "cancelled" }];
    renderList(); await screen.findByText(booking.customerName);
    expect(within(bookingRow()).getByText("취소된 회차")).toHaveClass("text-[var(--status-danger)]");
    expect(within(bookingRow()).getByText("취소됨")).toBeVisible();
  });

  it("목록 로딩을 표시한다", async () => {
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    renderList(); expect(screen.getByRole("status")).toHaveTextContent("예약 목록을 불러오고 있습니다");
    await act(async () => { finish({ sessions, bookings: rows }); });
  });

  it("빈 결과를 안내한다", async () => {
    rows = [];
    renderList();
    expect(await screen.findByText("조건에 맞는 예약이 없어요.")).toBeVisible();
  });

  it("조회 실패 시 재시도 버튼으로 다시 요청한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "조회에 실패했습니다.", 500)); renderList();
    expect(await screen.findByRole("alert")).toHaveTextContent("예약 목록을 불러오지 못했어요. 조회에 실패했습니다.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByText(booking.customerName)).toBeVisible();
  });

  it("조회 401이면 로그인 화면으로 이동한다", async () => {
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401)); renderList();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});

describe("AdminBookingList 처리", () => {
  it.each([
    ["승인 대기", person(1, "pending"), ["거절", "승인"], null],
    ["확정", person(1, "confirmed"), ["예약 취소"], null],
    ["시작한 확정", person(1, "confirmed", { sessionStartsAt: started }), [], "진행 완료"],
    ["거절됨", person(1, "rejected"), [], "처리 완료"],
    ["취소됨", person(1, "cancelled"), [], "처리 완료"],
  ] as const)("R-20, R-21, R-31: %s 예약에는 허용된 동작만 두고 끝난 예약은 결과를 표시한다", async (_label, row, buttons, result) => {
    rows = [row];
    renderList(); await screen.findByText(row.customerName);
    const cells = within(bookingRow(row.customerName));
    expect(cells.queryAllByRole("button").map((button) => button.textContent)).toEqual(buttons);
    if (result) expect(cells.getByText(result)).toBeVisible();
  });

  it.each(["2026-10-18T23:59:59Z", now.toISOString()])("R-17, R-22: 시작 시각 %s에는 승인만 비활성화하고 거절은 둔다", async (startsAt) => {
    rows = [{ ...booking, sessionStartsAt: startsAt }];
    renderList(); await screen.findByText(booking.customerName);
    const row = within(bookingRow());
    expect(row.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(row.getByRole("button", { name: "승인" })).toHaveAttribute("title", "시작한 회차는 승인할 수 없어요");
    expect(row.getByRole("button", { name: "거절" })).toBeEnabled();
  });

  it("R-20: 승인은 바로 POST하고 ['admin'] 접두 쿼리를 무효화한다", async () => {
    const user = userEvent.setup(); const client = renderList();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByText(booking.customerName);
    rows = [{ ...booking, status: "confirmed" }];
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] }));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/bookings/booking-1/confirm", { method: "POST" });
    expect(await within(bookingRow()).findByText("참여 확정")).toBeVisible();
    expect(toast.success).toHaveBeenCalledWith("김공방님 2명 확정했어요");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    ["pending", "거절", "이 신청을 거절할까요?", "거절하기", "reject", "김공방님 신청을 거절했어요"],
    ["confirmed", "예약 취소", "확정된 예약을 취소할까요?", "예약 취소하기", "cancel", "김공방님 예약을 취소했어요"],
  ] as const)("R-03, R-20, R-32: %s 예약의 %s는 예약자·회차를 확인한 뒤 동작별 POST한다", async (status, trigger, title, confirm, action, message) => {
    rows = [{ ...booking, status }];
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    const button = within(bookingRow()).getByRole("button", { name: trigger });
    await user.click(button);
    let dialog = await screen.findByRole("dialog", { name: title });
    expect(dialog).toHaveTextContent("김공방 · 010-1234-0007");
    expect(dialog).toHaveTextContent(`도자기 만들기${formatKstDateTime(booking.sessionStartsAt)} · 2명`);
    expect(dialog).toHaveAccessibleDescription("2자리가 다시 열려요. 자동 알림이 없으니 고객에게 직접 연락해 주세요.");
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(changes()).toHaveLength(0);
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: confirm }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(`/api/admin/bookings/booking-1/${action}`, { method: "POST" }));
    expect(toast.success).toHaveBeenCalledWith(message, { description: "자리가 복구됐어요. 고객에게는 직접 연락해 주세요." });
  });

  it("변경 중 해당 행 버튼을 비활성화하고 중복 요청을 막는다", async () => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(within(bookingRow()).getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true));
    expect(within(bookingRow()).getByRole("button", { name: "승인 중…" })).toBeDisabled();
    expect(changes()).toHaveLength(1);
    await act(async () => { finish({ ok: true }); });
  });

  it("거절 요청 중에는 확인창 닫기·중복 확정을 막는다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(booking.customerName);
    await user.click(within(bookingRow()).getByRole("button", { name: "거절" }));
    const dialog = await screen.findByRole("dialog");
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(within(dialog).getByRole("button", { name: "거절하기" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: "처리 중…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeDisabled();
    await act(async () => { finish({ ok: true }); });
  });

  it.each([["pending", "거절", "거절하기"], ["confirmed", "예약 취소", "예약 취소하기"]] as const)("R-21, R-22: %s 예약의 %s 실패 사유를 확인 창 안에 표시하고 창을 유지한다", async (status, action, confirm) => {
    rows = [{ ...booking, status }];
    const user = userEvent.setup(); renderList(); await screen.findByText(booking.customerName);
    await user.click(within(bookingRow()).getByRole("button", { name: action }));
    const dialog = await screen.findByRole("dialog");
    apiMock.mockRejectedValueOnce(new ApiError("INVALID_TRANSITION", "이미 처리된 예약입니다.", 409));
    await user.click(within(dialog).getByRole("button", { name: confirm }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("이미 처리된 예약입니다.");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeEnabled();
  });

  it("R-22: 변경 실패는 서버 메시지 토스트를 표시한다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(booking.customerName);
    apiMock.mockRejectedValueOnce(new ApiError("SESSION_STARTED", "이미 시작한 회차입니다.", 409));
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("이미 시작한 회차입니다."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("변경 요청 401도 로그인 화면으로 이동한다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(booking.customerName);
    apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
