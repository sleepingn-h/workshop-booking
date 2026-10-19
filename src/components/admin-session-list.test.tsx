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
const empty: AdminSession = { id: "empty", startsAt: "2026-10-23T05:00:00Z", capacity: 6, occupied: 0, bookingCount: 0, status: "scheduled" };
const booked: AdminSession = { id: "booked", startsAt: "2026-10-22T05:00:37Z", capacity: 6, occupied: 3, bookingCount: 4, status: "scheduled" };
const cancelled: AdminSession = { id: "cancelled", startsAt: "2026-10-24T05:00:00Z", capacity: 4, occupied: 0, bookingCount: 2, status: "cancelled" };
const past: AdminSession = { id: "past", startsAt: "2026-10-18T05:00:00Z", capacity: 4, occupied: 0, bookingCount: 0, status: "scheduled" };
const detail: AdminClassDetail = { id: "class-1", title: "도자기 만들기", description: "장소: 서울 공방", imageUrl: null, isPublished: false, sessions: [empty, cancelled, booked, past] };
const path = `/api/admin/classes/${detail.id}`;
const bookings: AdminBooking[] = (["pending", "confirmed", "rejected", "cancelled"] as const).map((status, index) => ({
  id: `booking-${index}`, code: `BK-TEST0${index}`, status, headcount: index === 0 ? 2 : 1,
  customerName: "예약자", phone: "01012345678", classTitle: detail.title,
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
  fireEvent.change(within(addForm()).getByLabelText("시작 시각 (한국 시각)"), { target: { value: startsAt } });
  fireEvent.change(within(addForm()).getByLabelText("정원"), { target: { value: capacity } });
}
async function edit(session = empty) {
  const user = userEvent.setup();
  await user.click(within(row(session)).getByRole("button", { name: "수정" }));
  return { user, form: screen.getByRole("form", { name: "회차 수정" }) };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T09:00:00Z"));
  vi.clearAllMocks(); apiMock.mockReset();
  apiMock.mockImplementation(async (url, init) => init?.method ? { ok: true } : url.startsWith("/api/admin/bookings") ? { bookings, sessions: [] } : detail);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); });

describe("AdminSessionList 조회", () => {
  it("클래스 폼과 같은 상세 쿼리를 공유하고 시작 시각 오름차순으로 KST·상태·정원·이력을 표시한다", async () => {
    const client = renderList(true);
    const table = await screen.findByRole("table", { name: "회차 목록" });
    expect(apiMock).toHaveBeenCalledExactlyOnceWith(path);
    expect(client.getQueryData(["admin", "class", detail.id])).toEqual(detail);
    const rows = within(table).getAllByRole("row").slice(1);
    for (const [index, session] of [past, booked, empty, cancelled].entries()) expect(rows[index]).toHaveTextContent(formatKstDateTime(session.startsAt));
    expect(within(row(past)).getByText("지난 회차", { exact: true })).toBeVisible();
    expect(within(row(empty)).getByText("예정", { exact: true })).toBeVisible();
    expect(row(booked)).toHaveTextContent("차지 3 / 정원 6");
    expect(row(booked)).toHaveTextContent("예약 이력 4건");
    expect(within(row(booked)).getByRole("meter")).toHaveAttribute("aria-valuenow", "3");
    expect(within(row(booked)).getByRole("meter")).toHaveAttribute("aria-valuemax", "6");
  });

  it("회차가 없으면 빈 상태와 추가 폼을 제공한다", async () => {
    apiMock.mockResolvedValueOnce({ ...detail, sessions: [] }); renderList();
    expect(await screen.findByText("아직 등록된 회차가 없습니다.")).toBeVisible();
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
  it.each(["2026-10-18T14:00", "2026-10-19T18:00", ""])("R-46: 과거·현재·빈 시작 시각 %s는 필드 오류로 막는다", async (value) => {
    await ready(); fillAdd(value);
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(within(addForm()).getByLabelText("시작 시각 (한국 시각)")).toHaveAttribute("aria-invalid", "true");
    expect(within(addForm()).getByRole("alert")).toHaveTextContent("미래 시작 시각");
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it.each(["0", "1.5", ""])("R-46: 잘못된 정원 %s는 필드 오류로 막는다", async (capacity) => {
    await ready(); fillAdd("2026-10-25T14:30", capacity);
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(within(addForm()).getByRole("alert")).toHaveTextContent("정원은 1 이상의 정수");
    expect(within(addForm()).getByLabelText("정원")).toHaveAttribute("aria-invalid", "true");
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it("R-46: 한국 시각을 +09:00 ISO로 POST하고 운영자 쿼리를 무효화한다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); fillAdd();
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("회차를 추가했습니다"));
    expect(apiMock).toHaveBeenCalledWith(`${path}/sessions`, { method: "POST", json: { startsAt: "2026-10-25T14:30:00+09:00", capacity: 8 } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
  });

  it("추가 실패 시 입력과 서버 필드 오류를 유지한다", async () => {
    await ready(); fillAdd();
    apiMock.mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "회차 추가 실패", 400, { capacity: "정원을 다시 확인해 주세요." }));
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(await within(addForm()).findByText("회차 추가 실패")).toBeVisible();
    expect(within(addForm()).getByText("정원을 다시 확인해 주세요.")).toBeVisible();
    expect(within(addForm()).getByLabelText("정원")).toHaveValue(8);
    expect(within(addForm()).getByLabelText("시작 시각 (한국 시각)")).toHaveValue("2026-10-25T14:30");
  });

  it("추가 중 입력·제출을 비활성화해 중복 요청을 막는다", async () => {
    await ready(); fillAdd(); let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup(); await user.click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    expect(within(addForm()).getByRole("button", { name: "추가 중…" })).toBeDisabled();
    expect(within(addForm()).getByLabelText("정원")).toBeDisabled();
    expect(within(addForm()).getByLabelText("시작 시각 (한국 시각)")).toBeDisabled();
    await user.click(within(addForm()).getByRole("button", { name: "추가 중…" }));
    expect(apiMock).toHaveBeenCalledTimes(2);
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
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it("R-44: 이력이 있으면 KST 시작 입력을 비활성화하고 일정 변경 절차를 안내한다", async () => {
    await ready(); const { form } = await edit(booked);
    expect(within(form).getByLabelText("시작 시각 (한국 시각)")).toBeDisabled();
    expect(within(form).getByLabelText("시작 시각 (한국 시각)")).toHaveValue("2026-10-22T14:00");
    expect(within(form).getByText("예약 이력이 있는 회차는 시간을 바꿀 수 없어요. 회차를 취소하고 새로 만들어 주세요")).toBeVisible();
  });

  it("R-40, R-44: 정원만 바꾸면 초 단위 원본 시각을 PATCH에 포함하지 않는다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); const { user, form } = await edit(booked);
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "3" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("회차를 수정했습니다"));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/booked", { method: "PATCH", json: { capacity: 3 } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
  });

  it("R-44: 이력 없는 회차의 시작 시각만 바꾸면 KST ISO 필드만 전송한다", async () => {
    await ready(); const { user, form } = await edit();
    fireEvent.change(within(form).getByLabelText("시작 시각 (한국 시각)"), { target: { value: "2026-10-26T10:00" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/empty", { method: "PATCH", json: { startsAt: "2026-10-26T10:00:00+09:00" } }));
  });

  it("R-44: 시작 시각을 과거로 바꾸면 오류를 표시하고 미호출한다", async () => {
    await ready(); const { user, form } = await edit();
    fireEvent.change(within(form).getByLabelText("시작 시각 (한국 시각)"), { target: { value: "2026-10-18T10:00" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("미래 시작 시각");
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it("지난 회차의 정원만 수정할 수 있고 변경 없는 저장은 비활성화한다", async () => {
    await ready(); const { user, form } = await edit(past);
    expect(within(form).getByRole("button", { name: "저장" })).toBeDisabled();
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "5" } });
    await user.click(within(form).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/past", { method: "PATCH", json: { capacity: 5 } }));
  });

  it("수정 중 입력·버튼을 막고 실패 시 편집값·서버 사유를 유지한다", async () => {
    await ready(); const { user, form } = await edit();
    fireEvent.change(within(form).getByLabelText("정원"), { target: { value: "10" } });
    let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await user.click(within(form).getByRole("button", { name: "저장" }));
    expect(within(form).getByLabelText("정원")).toBeDisabled();
    expect(within(form).getByRole("button", { name: "저장 중…" })).toBeDisabled();
    expect(within(form).getByRole("button", { name: "돌아가기" })).toBeDisabled();
    await act(async () => { fail(new ApiError("INTERNAL_ERROR", "수정 실패", 500)); });
    expect(await within(form).findByRole("alert")).toHaveTextContent("수정 실패");
    expect(within(form).getByLabelText("정원")).toHaveValue(10);
  });
});

describe("회차 삭제·취소", () => {
  it("R-41: 예약 이력이 있으면 삭제 버튼 대신 취소 안내를 제공한다", async () => {
    await ready();
    expect(within(row(booked)).queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
    expect(row(booked)).toHaveTextContent("예약 이력이 있는 회차는 삭제할 수 없어요. 회차를 취소해 주세요.");
  });

  it("R-43: 이력 없는 회차는 키보드 확인 후 DELETE하고 쿼리를 무효화한다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); const user = userEvent.setup();
    const trigger = within(row(empty)).getByRole("button", { name: "삭제" });
    trigger.focus(); await user.keyboard("{Enter}");
    let dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("되돌릴 수 없습니다");
    expect(apiMock).toHaveBeenCalledOnce();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}"); dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/empty", { method: "DELETE" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("회차를 삭제했습니다");
  });

  it("R-42: 점유 인원·전체 이력 대신 활성 예약 건수를 안내하고 확인 후 취소·무효화한다", async () => {
    const client = await ready(); const invalidate = vi.spyOn(client, "invalidateQueries"); const user = userEvent.setup();
    await user.click(within(row(booked)).getByRole("button", { name: "회차 취소" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("승인 대기·참여 확정 예약 2건이 함께 취소됩니다. 고객에게 직접 연락해 주세요")).toBeVisible();
    expect(apiMock).toHaveBeenCalledWith("/api/admin/bookings?sessionId=booked");
    expect(apiMock.mock.calls.some(([, init]) => init?.method)).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "회차 취소하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/sessions/booked/cancel", { method: "POST" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("회차를 취소했습니다");
  });

  it("R-42: 활성 예약 조회 중·실패 시 확정을 막고 재시도를 제공한다", async () => {
    await ready(); let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    const user = userEvent.setup(); await user.click(within(row(booked)).getByRole("button", { name: "회차 취소" }));
    const dialog = await screen.findByRole("dialog");
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

  it("R-45: 취소된 회차는 취소 상태만 표시하고 모든 동작을 숨긴다", async () => {
    await ready();
    expect(within(row(cancelled)).getByText("취소", { exact: true })).toBeVisible();
    expect(within(row(cancelled)).queryByRole("button")).not.toBeInTheDocument();
  });

  it("변경 요청의 미인증도 로그인으로 이동한다", async () => {
    await ready(); fillAdd(); apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await userEvent.setup().click(within(addForm()).getByRole("button", { name: "회차 추가" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
