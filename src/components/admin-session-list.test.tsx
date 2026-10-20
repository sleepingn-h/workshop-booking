import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime } from "@/lib/format";
import type { AdminBooking, AdminClassDetail, AdminSession } from "@/lib/types";

import { AdminClassForm } from "./admin-class-form";
import { AdminSessionList } from "./admin-session-list";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
const empty: AdminSession = { id: "empty", startsAt: "2026-10-23T05:00:00Z", capacity: 6, occupied: 0, bookingCount: 0, pendingCount: 0, status: "scheduled" };
const booked: AdminSession = { id: "booked", startsAt: "2026-10-22T05:00:37Z", capacity: 6, occupied: 3, bookingCount: 4, pendingCount: 1, status: "scheduled" };
const soon: AdminSession = { id: "soon", startsAt: "2026-10-19T13:30:00Z", capacity: 4, occupied: 0, bookingCount: 0, pendingCount: 0, status: "scheduled" };
const cancelled: AdminSession = { id: "cancelled", startsAt: "2026-10-24T05:00:00Z", capacity: 4, occupied: 0, bookingCount: 2, pendingCount: 0, status: "cancelled" };
const past: AdminSession = { id: "past", startsAt: "2026-10-18T05:00:00Z", capacity: 4, occupied: 1, bookingCount: 1, pendingCount: 1, status: "scheduled" };
const detail: AdminClassDetail = {
  id: "class-1", title: "도자기 만들기", description: "물레로 컵을 만들어요.",
  place: "서울 공방", durationMinutes: 120, price: 30000, paymentMethod: "현장 결제", materials: "없음", contact: "02-123-4567",
  imageUrl: null, isPublished: false, sessions: [empty, cancelled, booked, past, soon],
};
const path = `/api/admin/classes/${detail.id}`;
const bookings: AdminBooking[] = (["pending", "confirmed", "rejected", "cancelled"] as const).map((status, index) => ({
  id: `booking-${index}`, code: `BK-TEST0${index}`, status, headcount: index === 0 ? 2 : 1,
  customerName: `예약자${index}`, phone: "01012345678", classTitle: detail.title,
  sessionId: booked.id, sessionStartsAt: booked.startsAt, sessionStatus: "scheduled",
}));
const clients: QueryClient[] = [];
function renderList(withClassForm = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}>{withClassForm && <AdminClassForm classId={detail.id} />}<AdminSessionList classId={detail.id} /></QueryClientProvider>);
  return client;
}
async function ready() {
  const client = renderList();
  await screen.findByRole("table", { name: "회차 목록" });
  return client;
}
function row(session: AdminSession) {
  return screen.getByRole("row", { name: (name) => name.includes(formatKstDateTime(session.startsAt)) });
}
function addForm() { return screen.getByRole("form", { name: "회차 추가" }); }
function fillAdd(startsAt = "2026-10-25T14:30", capacity = "8") {
  fireEvent.change(within(addForm()).getByLabelText("시작 일시"), { target: { value: startsAt } });
  fireEvent.change(within(addForm()).getByLabelText("정원"), { target: { value: capacity } });
}
async function edit(session = empty) {
  const user = userEvent.setup();
  await user.click(within(row(session)).getByRole("button", { name: session.bookingCount > 0 ? "정원 수정" : "수정" }));
  return { user, form: screen.getByRole("form", { name: "회차 수정" }) };
}
function changes() { return apiMock.mock.calls.filter(([, init]) => init?.method); }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T09:00:00Z"));
  vi.clearAllMocks(); apiMock.mockReset();
  apiMock.mockImplementation(async (url, init) => init?.method ? { ok: true } : url.startsWith("/api/admin/bookings") ? { bookings, sessions: [] } : detail);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); });

describe("AdminSessionList 조회", () => {
  it("R-01, R-17, R-41: 클래스 폼과 같은 상세 쿼리로 시작 순서대로 KST·상태·차지/정원·이력·승인 대기를 표시한다", async () => {
    const client = renderList(true);
    const table = await screen.findByRole("table", { name: "회차 목록" });
    expect(apiMock).toHaveBeenCalledExactlyOnceWith(path);
    expect(client.getQueryData(["admin", "class", detail.id])).toEqual(detail);
    const rows = within(table).getAllByRole("row").slice(1);
    for (const [index, session] of [past, soon, booked, empty, cancelled].entries()) expect(rows[index]).toHaveTextContent(formatKstDateTime(session.startsAt));
    expect(within(row(past)).getByText("지난 회차", { exact: true })).toBeVisible();
    expect(within(row(soon)).getByText("4시간 후 시작")).toBeVisible();
    expect(within(row(empty)).getByText("예정", { exact: true })).toBeVisible();
    expect(row(booked)).toHaveTextContent("3 / 6명");
    expect(within(row(booked)).getByText("승인 대기 1건")).toBeVisible();
    expect(within(row(booked)).getByText("예약 이력 있음")).toBeVisible();
    expect(within(row(empty)).getByText("예약 없음")).toBeVisible();
    expect(within(row(empty)).queryByText(/승인 대기/)).not.toBeInTheDocument();
    expect(within(row(booked)).getByRole("meter")).toHaveAttribute("aria-valuenow", "3");
    expect(within(row(booked)).getByRole("meter")).toHaveAttribute("aria-valuemax", "6");
  });

  it("R-41, R-44: 회차 카드 머리에 이력 있는 회차의 처리 방법을 한 번 안내하고 추가 폼을 목록 위에 둔다", async () => {
    await ready();
    const section = screen.getByRole("region", { name: "회차" });
    expect(within(section).getByText("예약 이력이 있는 회차는 삭제·시각 변경 대신 취소해요.")).toBeVisible();
    expect(addForm().compareDocumentPosition(screen.getByRole("table", { name: "회차 목록" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(addForm()).getByLabelText("정원")).toHaveValue("6");
  });

  it("회차가 없으면 빈 상태와 추가 폼을 제공한다", async () => {
    apiMock.mockResolvedValueOnce({ ...detail, sessions: [] }); renderList();
    expect(await screen.findByText("등록된 회차가 없어요.")).toBeVisible();
    expect(addForm()).toBeVisible();
  });

  it("로딩과 조회 실패·재시도를 구분한다", async () => {
    let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; })); renderList();
    expect(screen.getByRole("status")).toHaveTextContent("회차를 불러오고 있습니다");
    await act(async () => { fail(new ApiError("INTERNAL_ERROR", "회차 조회 실패", 500)); });
    expect(await screen.findByRole("alert")).toHaveTextContent("회차 조회 실패");
    expect(screen.queryByRole("form", { name: "회차 추가" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByRole("table", { name: "회차 목록" })).toBeVisible();
  });

  it("미인증 조회는 로그인으로 이동한다", async () => {
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401)); renderList();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});

describe("회차 추가", () => {
  it.each([
    ["2026-10-18T14:00", "지금보다 뒤의 시작 시각을 입력해 주세요."],
    ["2026-10-19T18:00", "지금보다 뒤의 시작 시각을 입력해 주세요."],
    ["", "시작 날짜와 시각을 입력해 주세요."],
  ])("R-46: 과거·현재·빈 시작 시각 %s는 필드 오류로 막는다", async (value, message) => {
    await ready(); fillAdd(value);
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(within(addForm()).getByLabelText("시작 일시")).toHaveAttribute("aria-invalid", "true");
    expect(within(addForm()).getByRole("alert")).toHaveTextContent(message);
    expect(changes()).toHaveLength(0);
  });

  it.each(["0", "1.5", ""])("R-46: 잘못된 정원 %s는 필드 오류로 막는다", async (capacity) => {
    await ready(); fillAdd("2026-10-25T14:30", capacity);
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(within(addForm()).getByRole("alert")).toHaveTextContent("정원은 1 이상의 정수");
    expect(within(addForm()).getByLabelText("정원")).toHaveAttribute("aria-invalid", "true");
    expect(changes()).toHaveLength(0);
  });

  it("R-46: 한국 시각을 +09:00 ISO로 POST하고 운영자 쿼리를 무효화한다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); fillAdd();
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("회차를 추가했어요"));
    expect(apiMock).toHaveBeenCalledWith(`${path}/sessions`, { method: "POST", json: { startsAt: "2026-10-25T14:30:00+09:00", capacity: 8 } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
  });

  it("추가 실패 시 입력과 서버 필드 오류를 유지한다", async () => {
    await ready(); fillAdd();
    apiMock.mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "회차 추가 실패", 400, { capacity: "정원을 다시 확인해 주세요." }));
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(await within(addForm()).findByText("회차 추가 실패")).toBeVisible();
    expect(within(addForm()).getByText("정원을 다시 확인해 주세요.")).toBeVisible();
    expect(within(addForm()).getByLabelText("정원")).toHaveValue("8");
    expect(within(addForm()).getByLabelText("시작 일시")).toHaveValue("2026-10-25T14:30");
  });

  it("추가 중 입력·제출을 비활성화해 중복 요청을 막는다", async () => {
    await ready(); fillAdd(); let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup(); await user.click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(within(addForm()).getByRole("button", { name: "추가 중…" })).toBeDisabled();
    expect(within(addForm()).getByLabelText("정원")).toBeDisabled();
    expect(within(addForm()).getByLabelText("시작 일시")).toBeDisabled();
    await user.click(within(addForm()).getByRole("button", { name: "추가 중…" }));
    expect(changes()).toHaveLength(1);
    await act(async () => { finish({ id: "new-session" }); });
  });
});

describe("회차 수정", () => {
  it("R-40: 차지된 자리보다 작은 정원은 PATCH 전에 막는다", async () => {
    await ready(); const { user, form } = await edit(booked);
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "2" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("차지된 자리보다 적게");
    expect(within(form).getByLabelText("정원")).toHaveAttribute("aria-invalid", "true");
    expect(changes()).toHaveLength(0);
  });

  it("R-44: 이력이 있으면 KST 시작 입력을 비활성화하고 이유를 안내한다", async () => {
    await ready(); const { form } = await edit(booked);
    expect(within(form).getByLabelText("시작 일시")).toBeDisabled();
    expect(within(form).getByLabelText("시작 일시")).toHaveValue("2026-10-22T14:00");
    expect(within(form).getByLabelText("시작 일시")).toHaveAccessibleDescription("예약 이력이 있어 시각은 바꿀 수 없어요");
  });

  it.each([[booked, "최소 3명"], [empty, "최소 1명"]] as const)("R-40, R-46: 정원 칸에 줄일 수 있는 최소값(%s)을 입력 전에 안내한다", async (session, hint) => {
    await ready();
    const { form } = await edit(session);
    expect(within(form).getByLabelText("정원")).toHaveAccessibleDescription(hint);
  });

  it("R-40, R-44: 정원만 바꾸면 초 단위 원본 시각을 PATCH에 포함하지 않는다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); const { user, form } = await edit(booked);
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "3" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("회차를 수정했어요"));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/booked", { method: "PATCH", json: { capacity: 3 } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
  });

  it("R-44: 이력 없는 회차의 시작 시각만 바꾸면 KST ISO 필드만 전송한다", async () => {
    await ready(); const { user, form } = await edit();
    fireEvent.change(within(form).getByLabelText("시작 일시"), { target: { value: "2026-10-26T10:00" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/empty", { method: "PATCH", json: { startsAt: "2026-10-26T10:00:00+09:00" } }));
  });

  it("R-44: 시작 시각을 과거로 바꾸면 오류를 표시하고 미호출한다", async () => {
    await ready(); const { user, form } = await edit();
    fireEvent.change(within(form).getByLabelText("시작 일시"), { target: { value: "2026-10-18T10:00" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("지금보다 뒤의 시작 시각을 입력해 주세요.");
    expect(changes()).toHaveLength(0);
  });

  it("바꾼 값 없이 저장하거나 닫으면 요청 없이 행으로 돌아간다", async () => {
    await ready(); const { user, form } = await edit();
    await user.click(within(form).getByRole("button", { name: "저장" }));
    expect(screen.queryByRole("form", { name: "회차 수정" })).not.toBeInTheDocument();
    const second = await edit();
    await second.user.click(within(second.form).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("form", { name: "회차 수정" })).not.toBeInTheDocument();
    expect(changes()).toHaveLength(0);
  });

  it("수정 중 입력·버튼을 막고 실패 시 편집값·서버 사유를 유지한다", async () => {
    await ready(); const { user, form } = await edit();
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "10" } });
    let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await user.click(within(form).getByRole("button", { name: "저장" }));
    expect(within(form).getByLabelText("정원")).toBeDisabled();
    expect(within(form).getByRole("button", { name: "저장 중…" })).toBeDisabled();
    expect(within(form).getByRole("button", { name: "닫기" })).toBeDisabled();
    await act(async () => { fail(new ApiError("INTERNAL_ERROR", "수정 실패", 500)); });
    expect(await within(form).findByRole("alert")).toHaveTextContent("수정 실패");
    expect(within(form).getByLabelText("정원")).toHaveValue("10");
  });
});

describe("회차 삭제·취소", () => {
  it("R-41, R-44: 예약 이력이 있으면 삭제 대신 회차 취소를, 수정은 정원 수정으로 제시한다", async () => {
    await ready();
    expect(within(row(booked)).queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
    expect(within(row(booked)).getByRole("button", { name: "회차 취소" })).toBeVisible();
    expect(within(row(booked)).getByRole("button", { name: "정원 수정" })).toBeVisible();
  });

  it("R-43: 예약 이력이 없으면 회차 취소 대신 삭제를 제시한다", async () => {
    await ready();
    expect(within(row(empty)).getByRole("button", { name: "삭제" })).toBeVisible();
    expect(within(row(empty)).getByRole("button", { name: "수정" })).toBeVisible();
    expect(within(row(empty)).queryByRole("button", { name: "회차 취소" })).not.toBeInTheDocument();
  });

  it("R-43: 이력 없는 회차는 키보드 확인 후 DELETE하고 쿼리를 무효화한다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); const user = userEvent.setup();
    const trigger = within(row(empty)).getByRole("button", { name: "삭제" });
    trigger.focus(); await user.keyboard("{Enter}");
    let dialog = await screen.findByRole("dialog", { name: "회차를 삭제할까요?" });
    expect(dialog).toHaveAccessibleDescription(`${formatKstDateTime(empty.startsAt)} 회차를 삭제해요. 되돌릴 수 없어요.`);
    expect(changes()).toHaveLength(0);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}"); dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/empty", { method: "DELETE" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("회차를 삭제했어요");
  });

  it("R-42: 함께 취소될 활성 예약 건수·인원과 예약자를 보여주고 확인 후 취소·무효화한다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); const user = userEvent.setup();
    await user.click(within(row(booked)).getByRole("button", { name: "회차 취소" }));
    const dialog = await screen.findByRole("dialog", { name: "이 회차를 취소할까요?" });
    await waitFor(() => expect(dialog).toHaveAccessibleDescription(`${formatKstDateTime(booked.startsAt)} 회차의 활성 예약 2건 (3명)이 함께 취소돼요. 되돌릴 수 없어요.`));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/bookings?sessionId=booked");
    expect(within(dialog).getByText("예약자0 · 010-1234-5678 · 2명")).toBeVisible();
    expect(within(dialog).getByText("예약자1 · 010-1234-5678 · 1명")).toBeVisible();
    expect(within(dialog).queryByText(/예약자2/)).not.toBeInTheDocument();
    expect(within(dialog).getByText("승인 대기")).toBeVisible();
    expect(within(dialog).getByText("자동 알림이 없어요. 위 예약자에게 직접 연락해 주세요.")).toBeVisible();
    expect(changes()).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "회차 취소하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/booked/cancel", { method: "POST" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("회차를 취소했어요", { description: "활성 예약 2건도 함께 취소됐어요." });
  });

  it("편집 화면처럼 클래스 폼 안에 두어도 중첩 다이얼로그가 아니라 배경을 덮는다", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><AdminClassForm classId={detail.id}><AdminSessionList classId={detail.id} /></AdminClassForm></QueryClientProvider>);
    await screen.findByRole("table", { name: "회차 목록" });
    await userEvent.setup().click(within(row(booked)).getByRole("button", { name: "회차 취소" }));
    await screen.findByRole("dialog");
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeInTheDocument();
  });

  it("R-42: 활성 예약 조회 중·실패 시 확정을 막고 재시도를 제공한다", async () => {
    await ready(); let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const user = userEvent.setup(); await user.click(within(row(booked)).getByRole("button", { name: "회차 취소" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("status")).toHaveTextContent("활성 예약을 확인하고 있어요");
    expect(within(dialog).getByRole("button", { name: "회차 취소하기" })).toBeDisabled();
    await act(async () => { fail(new ApiError("INTERNAL_ERROR", "예약 건수 조회 실패", 500)); });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("예약 건수 조회 실패");
    expect(within(dialog).getByRole("button", { name: "회차 취소하기" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "재시도" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "회차 취소하기" })).toBeEnabled());
  });

  it.each([["삭제", "삭제하기", empty], ["회차 취소", "회차 취소하기", booked]] as const)("%s 처리 중 닫기·중복 확정을 막고 실패 사유를 창에 유지한다", async (action, confirm, session) => {
    await ready(); const user = userEvent.setup();
    await user.click(within(row(session)).getByRole("button", { name: action }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("button", { name: confirm })).toBeEnabled());
    let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await user.click(within(dialog).getByRole("button", { name: confirm }));
    for (const name of ["처리 중…", "돌아가기", "닫기"]) expect(within(dialog).getByRole("button", { name })).toBeDisabled();
    await user.keyboard("{Escape}"); expect(dialog).toBeVisible();
    await act(async () => { fail(new ApiError("SESSION_HAS_BOOKINGS", "요청을 처리하지 못했습니다.", 409)); });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("요청을 처리하지 못했습니다.");
  });

  it.each([["취소된 회차", cancelled], ["지난 회차", past]] as const)("R-17, R-45: %s는 상태만 표시하고 동작을 두지 않는다", async (label, session) => {
    await ready();
    expect(within(row(session)).getByText(label, { exact: true })).toBeVisible();
    expect(within(row(session)).queryByRole("button")).not.toBeInTheDocument();
    if (session === cancelled) expect(row(session)).toHaveTextContent("—");
  });

  it("변경 요청의 미인증도 로그인으로 이동한다", async () => {
    await ready(); fillAdd(); apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
