import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import type { AdminClassSummary } from "@/lib/types";

import { AdminClassList } from "./admin-class-list";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
const pottery: AdminClassSummary = { id: "class-1", title: "도자기 컵", place: "흙과불 공방", durationMinutes: 120, price: 55000, isPublished: true, imageUrl: null, upcomingSessionCount: 3, pendingCount: 2 };
const candle: AdminClassSummary = { id: "class-2", title: "캔들 클래스", place: "밤결 향공방", durationMinutes: 90, price: 0, isPublished: false, imageUrl: "/samples/class-4.jpg", upcomingSessionCount: 1, pendingCount: 0 };
const flower: AdminClassSummary = { id: "class-3", title: "꽃다발 클래스", place: "들꽃 공방", durationMinutes: 60, price: 20000, isPublished: false, imageUrl: null, upcomingSessionCount: 0, pendingCount: 0 };
const clients: QueryClient[] = [];
function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AdminClassList /></QueryClientProvider>);
  return client;
}
function item(title: string) { return within(screen.getByRole("listitem", { name: title })); }
function listClasses(classes: AdminClassSummary[]) {
  apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : { classes });
}
beforeEach(() => {
  vi.clearAllMocks(); apiMock.mockReset();
  apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : { classes: [pottery, candle] });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("AdminClassList", () => {
  it("R-57: 제목 아래 비공개 생성 안내와 새 클래스 진입을 둔다", async () => {
    renderList();
    expect(screen.getByRole("heading", { level: 1, name: "클래스 관리" })).toBeVisible();
    expect(screen.getByText("새 클래스는 비공개로 만들어져요. 회차를 추가한 뒤 공개로 바꾸세요.")).toBeVisible();
    expect(screen.getByRole("link", { name: "새 클래스" })).toHaveAttribute("href", "/admin/classes/new");
    await screen.findByText(pottery.title);
  });

  it("R-17, R-52, R-53, R-54: 비공개를 포함해 공개 상태·장소·소요 시간·비용·예정 회차 수·승인 대기 건수를 표시한다", async () => {
    renderList(); await screen.findByText(pottery.title);
    expect(apiMock).toHaveBeenCalledWith("/api/admin/classes");
    expect(item(pottery.title).getByText("흙과불 공방").parentElement).toHaveTextContent("흙과불 공방·120분·₩55,000");
    expect(item(candle.title).getByText("무료")).toBeVisible();
    expect(item(pottery.title).getByText("공개", { selector: "span:not(label span)" })).toBeVisible();
    expect(item(pottery.title).getByText("예정 회차 3개")).toBeVisible();
    expect(item(pottery.title).getByText("승인 대기 2건")).toBeVisible();
    expect(item(candle.title).getByText("비공개")).toBeVisible();
    expect(item(candle.title).getByText("예정 회차 1개")).toBeVisible();
    expect(item(candle.title).queryByText(/승인 대기/)).not.toBeInTheDocument();
    expect(item(candle.title).getByRole("img", { name: "캔들 클래스 대표 이미지" })).toBeVisible();
  });

  it("행마다 공개 스위치와 편집 링크를 클래스 이름으로 구분한다", async () => {
    renderList(); await screen.findByText(pottery.title);
    expect(item(pottery.title).getByRole("switch", { name: "공개" })).toBeChecked();
    expect(item(pottery.title).getByRole("switch", { name: "공개" })).toHaveAccessibleDescription(pottery.title);
    expect(item(candle.title).getByRole("switch", { name: "공개" })).not.toBeChecked();
    expect(item(candle.title).getByRole("link", { name: "캔들 클래스 편집" })).toHaveAttribute("href", "/admin/classes/class-2");
  });

  it("R-52, R-57: 공개 스위치는 isPublished만 PATCH하고 처리 중 비활성 후 운영자 쿼리를 무효화한다", async () => {
    const user = userEvent.setup(); const client = renderList();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByText(candle.title);
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(item(candle.title).getByRole("switch"));
    expect(item(candle.title).getByRole("switch")).toBeChecked();
    expect(item(candle.title).getByRole("switch")).toBeDisabled();
    expect(apiMock).toHaveBeenCalledWith("/api/admin/classes/class-2", { method: "PATCH", json: { isPublished: true } });
    apiMock.mockResolvedValue({ classes: [pottery, { ...candle, isPublished: true }] });
    await act(async () => { finish({ ok: true }); });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] }));
    await waitFor(() => expect(item(candle.title).getByRole("switch")).toBeEnabled());
    expect(item(candle.title).getByRole("switch")).toBeChecked();
  });

  it("R-59: 예정 회차가 없는 클래스의 공개 스위치는 API를 호출하지 않고 회차 추가 안내 창을 연다", async () => {
    const user = userEvent.setup(); listClasses([pottery, flower]); renderList();
    await screen.findByText(flower.title);
    await user.click(item(flower.title).getByRole("switch", { name: "공개" }));
    const dialog = await screen.findByRole("dialog", { name: "회차를 먼저 추가해 주세요" });
    expect(dialog).toHaveTextContent("꽃다발 클래스에 예정 회차가 없어 공개할 수 없어요. 회차를 추가한 뒤 공개로 바꿔 주세요.");
    expect(within(dialog).getByRole("link", { name: "회차 추가하기" })).toHaveAttribute("href", "/admin/classes/class-3#add-session");
    expect(apiMock.mock.calls.filter(([, init]) => init?.method)).toEqual([]);
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(item(flower.title).getByRole("switch", { name: "공개" })).not.toBeChecked();
  });

  it("R-59: 저장 시점에 예정 회차가 없다는 응답을 받으면 토스트 대신 같은 안내 창을 열고 목록을 다시 조회한다", async () => {
    const user = userEvent.setup(); const client = renderList();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByText(candle.title);
    apiMock.mockRejectedValueOnce(new ApiError("NO_UPCOMING_SESSIONS", "예정 회차가 없는 클래스는 공개할 수 없습니다. 회차를 먼저 추가해 주세요.", 409));
    await user.click(item(candle.title).getByRole("switch"));
    const dialog = await screen.findByRole("dialog", { name: "회차를 먼저 추가해 주세요" });
    expect(within(dialog).getByRole("link", { name: "회차 추가하기" })).toHaveAttribute("href", "/admin/classes/class-2#add-session");
    expect(toast.error).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(item(candle.title).getByRole("switch")).not.toBeChecked();
  });

  it("R-59: 공개 중이지만 예정 회차가 없으면 고객에게 보이지 않는다고 표시하고, 비공개 전환은 그대로 PATCH한다", async () => {
    const user = userEvent.setup(); const hidden = { ...pottery, upcomingSessionCount: 0, pendingCount: 0 };
    listClasses([hidden, candle]); renderList();
    await screen.findByText(hidden.title);
    expect(item(hidden.title).getByText("예정 회차 0개").parentElement).toHaveTextContent("예정 회차 0개 · 고객에게 보이지 않아요");
    expect(item(candle.title).queryByText("고객에게 보이지 않아요")).not.toBeInTheDocument();
    await user.click(item(hidden.title).getByRole("switch"));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/classes/class-1", { method: "PATCH", json: { isPublished: false } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("공개 전환 실패 시 서버 사유를 알리고 저장된 상태로 되돌린다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(pottery.title);
    apiMock.mockRejectedValueOnce(new ApiError("MOCK_READ_ONLY", "목 데이터 모드에서는 변경할 수 없습니다.", 503));
    await user.click(item(pottery.title).getByRole("switch"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("목 데이터 모드에서는 변경할 수 없습니다."));
    expect(item(pottery.title).getByRole("switch")).toBeChecked();
  });

  it("목록 로딩·빈 결과를 구분한다", async () => {
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    renderList();
    expect(screen.getByRole("status")).toHaveTextContent("클래스 목록을 불러오고 있습니다");
    await act(async () => { finish({ classes: [] }); });
    expect(await screen.findByText("등록된 클래스가 없어요.")).toBeVisible();
  });

  it("조회 실패 시 재시도로 다시 요청한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "조회에 실패했습니다.", 500)); renderList();
    expect(await screen.findByRole("alert")).toHaveTextContent("클래스 목록을 불러오지 못했어요. 조회에 실패했습니다.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByText(pottery.title)).toBeVisible();
  });

  it("조회·변경 요청이 401이면 로그인으로 이동한다", async () => {
    const user = userEvent.setup(); renderList(); await screen.findByText(pottery.title);
    apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await user.click(item(pottery.title).getByRole("switch"));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
    cleanup(); router.replace.mockClear();
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401)); renderList();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
