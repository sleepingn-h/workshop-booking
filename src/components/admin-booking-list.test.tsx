import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime } from "@/lib/format";
import { BOOKING_STATUS_LABEL, type AdminBooking, type AdminBookingList, type BookingStatus } from "@/lib/types";

import { AdminBookingList as BookingList } from "./admin-booking-list";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
const now = new Date("2026-10-19T00:00:00Z");
const booking: AdminBooking = {
  id: "booking-1", code: "BK-TEST01", status: "pending", headcount: 2,
  customerName: "김공방", phone: "01012340007", classTitle: "도자기 만들기",
  sessionId: "session-1", sessionStartsAt: "2026-10-22T16:00:00Z", sessionStatus: "scheduled",
};
const data: AdminBookingList = {
  bookings: [booking], sessions: [
    { id: booking.sessionId, classTitle: booking.classTitle, startsAt: booking.sessionStartsAt, status: "scheduled" },
    { id: "session-2", classTitle: "향수 만들기", startsAt: "2026-10-23T16:00:00Z", status: "cancelled" },
  ],
};
const clients: QueryClient[] = [];
function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><BookingList /></QueryClientProvider>);
  return client;
}
function bookingRow(name = booking.customerName) { return screen.getByRole("row", { name: new RegExp(name) }); }
function lastParams() { return new URL(String(apiMock.mock.calls.at(-1)![0]), "http://localhost").searchParams; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  apiMock.mockReset(); apiMock.mockResolvedValue(data);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); });

describe("AdminBookingList", () => {
  it("R-19: 이름·전체 전화번호·예약번호·인원·KST 회차·상태를 표시한다", async () => {
    renderList();
    await screen.findByText(booking.customerName);
    const row = within(bookingRow());
    for (const text of [booking.phone, booking.code, booking.classTitle, "2명", formatKstDateTime(booking.sessionStartsAt), "승인 대기", "예정"]) {
      expect(row.getByText(text)).toBeVisible();
    }
    expect(screen.getByRole("option", { name: `향수 만들기 · ${formatKstDateTime(data.sessions[1].startsAt)} (취소)` })).toBeInTheDocument();
  });

  it.each(["김공방", "010-1234-0007", "김&공방"])("R-19: 검색어 %s는 제출할 때만 q에 전달한다", async (q) => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    await user.type(screen.getByLabelText("이름 또는 전체 전화번호"), q);
    expect(apiMock).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "검색" }));
    await waitFor(() => expect(lastParams().get("q")).toBe(q));
  });

  it("R-19: Enter 검색·회차·상태 필터를 함께 적용하고 전체 선택지를 유지한다", async () => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    await user.type(screen.getByLabelText("이름 또는 전체 전화번호"), "김공방{Enter}");
    await waitFor(() => expect(lastParams().get("q")).toBe("김공방"));
    await user.selectOptions(screen.getByLabelText("회차"), "session-2");
    await waitFor(() => expect(lastParams().get("sessionId")).toBe("session-2"));
    await user.selectOptions(screen.getByLabelText("예약 상태"), "confirmed");
    await waitFor(() => expect(lastParams().get("status")).toBe("confirmed"));
    expect(lastParams().get("q")).toBe("김공방");
    expect(within(screen.getByLabelText("회차")).getAllByRole("option")).toHaveLength(3);
    await user.selectOptions(screen.getByLabelText("회차"), "");
    await user.selectOptions(screen.getByLabelText("예약 상태"), "");
    await user.clear(screen.getByLabelText("이름 또는 전체 전화번호"));
    await user.click(screen.getByRole("button", { name: "검색" }));
    await waitFor(() => expect(lastParams().size).toBe(0));
  });

  it.each<BookingStatus>(["pending", "confirmed", "rejected", "cancelled"])("R-20, R-21: %s 상태의 허용 동작만 제공한다", async (status) => {
    apiMock.mockResolvedValue({ ...data, bookings: [{ ...booking, status }] });
    renderList(); await screen.findByText(booking.customerName);
    const row = within(bookingRow());
    expect(row.getByText(BOOKING_STATUS_LABEL[status])).toBeVisible();
    expect(Boolean(row.queryByRole("button", { name: "승인" }))).toBe(status === "pending");
    expect(Boolean(row.queryByRole("button", { name: "거절" }))).toBe(status === "pending");
    expect(Boolean(row.queryByRole("button", { name: "취소" }))).toBe(status === "pending" || status === "confirmed");
  });

  it.each(["2026-10-18T23:59:59Z", now.toISOString()])("R-17, R-22, R-32: 시작 시각 %s에는 승인만 비활성화한다", async (startsAt) => {
    apiMock.mockResolvedValue({ ...data, bookings: [{ ...booking, sessionStartsAt: startsAt }] });
    renderList(); await screen.findByText(booking.customerName);
    const row = within(bookingRow());
    expect(row.getByRole("button", { name: "승인" })).toBeDisabled();
    expect(row.getByRole("button", { name: "승인" })).toHaveAttribute("title", "시작한 회차는 승인할 수 없어요");
    expect(row.getByRole("button", { name: "거절" })).toBeEnabled();
    expect(row.getByRole("button", { name: "취소" })).toBeEnabled();
  });

  it("R-20: 승인은 바로 POST하고 ['admin'] 접두 쿼리를 무효화한다", async () => {
    const user = userEvent.setup(); const client = renderList();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByText(booking.customerName);
    apiMock.mockResolvedValue({ ...data, bookings: [{ ...booking, status: "confirmed" }] });
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] }));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/bookings/booking-1/confirm", { method: "POST" });
    expect(await within(bookingRow()).findByText("참여 확정")).toBeVisible();
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([["거절", "거절하기", "reject"], ["취소", "예약 취소", "cancel"]])("R-20, R-32: %s는 확인에서 돌아가면 미호출, 확정하면 동작별 POST한다", async (trigger, confirm, action) => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    const button = within(bookingRow()).getByRole("button", { name: trigger });
    await user.click(button);
    let dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledOnce();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: confirm }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(`/api/admin/bookings/booking-1/${action}`, { method: "POST" }));
  });

  it("변경 중 해당 행 버튼을 비활성화하고 중복 요청을 막는다", async () => {
    const user = userEvent.setup(); renderList();
    await screen.findByText(booking.customerName);
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(within(bookingRow()).getAllByRole("button").every((b) => (b as HTMLButtonElement).disabled)).toBe(true));
    expect(apiMock).toHaveBeenCalledTimes(2);
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
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeDisabled();
    await act(async () => { finish({ ok: true }); });
  });

  it("R-22: 변경 실패는 서버 메시지 토스트를 표시한다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(booking.customerName);
    apiMock.mockRejectedValueOnce(new ApiError("SESSION_STARTED", "이미 시작한 회차입니다.", 409));
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("이미 시작한 회차입니다."));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("R-42: 취소된 회차는 예약 취소 상태와 구분해 표시한다", async () => {
    apiMock.mockResolvedValue({ ...data, bookings: [{ ...booking, sessionStatus: "cancelled", status: "cancelled" }] });
    renderList(); await screen.findByText(booking.customerName);
    expect(within(bookingRow()).getByText("취소된 회차")).toHaveClass("text-[var(--status-danger)]");
    expect(within(bookingRow()).getByText("취소됨")).toBeVisible();
  });

  it("목록 로딩을 표시한다", async () => {
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    renderList(); expect(screen.getByRole("status")).toHaveTextContent("예약 목록을 불러오고 있습니다");
    await act(async () => { finish(data); });
  });

  it("빈 결과를 안내한다", async () => {
    apiMock.mockResolvedValue({ ...data, bookings: [] }); renderList();
    expect(await screen.findByText("조건에 맞는 예약이 없습니다.")).toBeVisible();
  });

  it("조회 실패 시 재시도 버튼으로 다시 요청한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "조회에 실패했습니다.", 500)); renderList();
    expect(await screen.findByRole("alert")).toHaveTextContent("조회에 실패했습니다.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByText(booking.customerName)).toBeVisible();
  });

  it("조회 401이면 로그인 화면으로 이동한다", async () => {
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401)); renderList();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it("변경 요청 401도 로그인 화면으로 이동한다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(booking.customerName);
    apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await user.click(within(bookingRow()).getByRole("button", { name: "승인" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
