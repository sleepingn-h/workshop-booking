import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";
import { IMAGE_MAX_BYTES } from "@/lib/rules";
import type { AdminClassDetail } from "@/lib/types";

import { AdminClassForm } from "./admin-class-form";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
const detail: AdminClassDetail = {
  id: "class-1", title: "도자기 만들기", description: "장소: 서울 공방\n소요 시간: 2시간\n비용·결제 방법: 3만원, 현장 결제\n준비물: 없음\n문의처: 02-123-4567",
  imageUrl: null, isPublished: false, sessions: [],
};
const withSession: AdminClassDetail = {
  ...detail, sessions: [{ id: "session-1", startsAt: "2026-10-25T05:00:00Z", capacity: 4, status: "scheduled", occupied: 0, bookingCount: 0, pendingCount: 0 }],
};
const path = `/api/admin/classes/${detail.id}`;
const clients: QueryClient[] = [];
function renderForm(classId?: string, sessions?: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AdminClassForm classId={classId}>{sessions}</AdminClassForm></QueryClientProvider>);
  return client;
}
async function renderEdit() {
  const client = renderForm(detail.id);
  await screen.findByDisplayValue(detail.title);
  return client;
}
async function fillCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("클래스명"), "  향수 만들기  ");
  await user.type(screen.getByLabelText("소개"), "  장소: 서울  ");
}
function changes() { return apiMock.mock.calls.filter(([, init]) => init?.method); }
beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockReset();
  apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : detail);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("AdminClassForm 생성", () => {
  it("빈 이름은 필드 오류를 표시하고 API를 호출하지 않는다", async () => {
    const user = userEvent.setup(); renderForm();
    await user.type(screen.getByLabelText("클래스명"), "   ");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("alert")).toHaveTextContent("클래스 이름을 입력해 주세요.");
    expect(screen.getByLabelText("클래스명")).toHaveAttribute("aria-invalid", "true");
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-53: 이름·소개 두 칸만 두고 소개 placeholder로 필수 안내 작성 형식을 보여준다", () => {
    renderForm();
    expect(screen.getByRole("heading", { level: 1, name: "새 클래스" })).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    const placeholder = screen.getByLabelText("소개").getAttribute("placeholder");
    for (const label of ["장소:", "소요 시간:", "비용·결제 방법:", "준비물:", "문의처:"]) expect(placeholder).toContain(label);
    expect(screen.queryByLabelText("대표 이미지 파일")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("R-57: 정리한 이름·설명만 POST하고 생성된 비공개 클래스 상세로 이동한다", async () => {
    const user = userEvent.setup(); const client = renderForm();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    apiMock.mockResolvedValueOnce({ id: "new-class" });
    await fillCreate(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/classes/new-class"));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/classes", { method: "POST", json: { title: "향수 만들기", description: "장소: 서울" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("비공개 클래스를 만들었어요");
  });

  it("생성 실패 시 입력과 서버 사유를 유지한다", async () => {
    const user = userEvent.setup(); renderForm(); await fillCreate(user);
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "클래스를 만들지 못했습니다.", 500));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("클래스를 만들지 못했습니다.");
    expect(screen.getByLabelText("클래스명")).toHaveValue("  향수 만들기  ");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("생성 중 버튼·필드를 비활성화하고 중복 제출을 막는다", async () => {
    const user = userEvent.setup(); renderForm(); await fillCreate(user);
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
    expect(screen.getByLabelText("클래스명")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "저장 중…" }));
    expect(apiMock).toHaveBeenCalledOnce();
    await act(async () => { finish({ id: "new-class" }); });
  });
});

describe("AdminClassForm 수정", () => {
  it("R-58: 상세 쿼리 키로 저장된 이름을 제목에, 설명·비공개 상태와 이미지 대체 면을 표시한다", async () => {
    const client = await renderEdit();
    expect(client.getQueryData(["admin", "class", detail.id])).toEqual(detail);
    expect(apiMock).toHaveBeenCalledWith(path);
    const heading = screen.getByRole("heading", { level: 1, name: detail.title });
    expect(heading.parentElement).toHaveTextContent("비공개");
    expect(screen.getByLabelText("소개")).toHaveValue(detail.description);
    expect(screen.getByRole("link", { name: "클래스 관리" })).toHaveAttribute("href", "/admin/classes");
    expect(screen.getByRole("button", { name: "이미지 업로드" })).toBeVisible();
    expect(screen.getByText("목록과 링크 미리보기에 쓰여요. 가로 1200px 이상 권장.")).toBeVisible();
  });

  it("R-53: 왼쪽에 기본 정보 → 회차, 보조 영역에 대표 이미지 → 공개 → 클래스 삭제 순서로 둔다", async () => {
    renderForm(detail.id, <p>회차 관리 영역</p>);
    await screen.findByDisplayValue(detail.title);
    const order = [
      screen.getByLabelText("소개"),
      screen.getByText("회차 관리 영역"),
      screen.getByRole("button", { name: "이미지 업로드" }),
      screen.getByRole("switch", { name: "고객에게 공개" }),
      screen.getByRole("button", { name: "클래스 삭제" }),
    ];
    for (const [index, element] of order.slice(1).entries()) {
      expect(order[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByText("비공개 클래스는 목록에 나오지 않고 링크로도 신청할 수 없어요.")).toBeVisible();
  });

  it("R-58: 수정한 이름·설명만 PATCH하고 운영자 쿼리와 토스트를 갱신한다", async () => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.clear(screen.getByLabelText("클래스명"));
    await user.type(screen.getByLabelText("클래스명"), "  새 도자기  ");
    apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : { ...detail, title: "새 도자기" });
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("저장했어요"));
    expect(apiMock).toHaveBeenCalledWith(path, { method: "PATCH", json: { title: "새 도자기", description: detail.description } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("새 도자기"));
    expect(screen.getByLabelText("클래스명")).toHaveValue("새 도자기");
  });

  it("수정 실패 시 이름·설명 입력과 서버 사유를 유지한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.type(screen.getByLabelText("클래스명"), " 수정");
    await user.type(screen.getByLabelText("소개"), " 추가 안내");
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "저장에 실패했습니다.", 500));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장에 실패했습니다.");
    expect(screen.getByLabelText("클래스명")).toHaveValue(`${detail.title} 수정`);
    expect(screen.getByLabelText("소개")).toHaveValue(`${detail.description} 추가 안내`);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("서버의 필드 오류도 해당 입력에 연결한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    apiMock.mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "입력을 확인하세요.", 400, { title: "이름을 다시 확인해 주세요." }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("이름을 다시 확인해 주세요.")).toBeVisible();
    expect(screen.getByLabelText("클래스명")).toHaveAttribute("aria-invalid", "true");
  });

  it.each([false, true])("R-52, R-57: 공개 %s 상태의 스위치는 확인 없이 반대 값만 PATCH하고 처리 중에는 비활성이다", async (isPublished) => {
    const user = userEvent.setup(); apiMock.mockResolvedValueOnce({ ...detail, isPublished });
    const client = renderForm(detail.id); await screen.findByDisplayValue(detail.title);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const control = screen.getByRole("switch", { name: "고객에게 공개" });
    expect(control).toHaveProperty("checked", isPublished);
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(control);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith(path, { method: "PATCH", json: { isPublished: !isPublished } });
    expect(control).toHaveProperty("checked", !isPublished);
    expect(control).toBeDisabled();
    apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : { ...detail, isPublished: !isPublished });
    await act(async () => { finish({ ok: true }); });
    await waitFor(() => expect(control).toBeEnabled());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveTextContent(isPublished ? "비공개" : "공개 중");
  });

  it("공개 전환 실패 시 서버 사유를 표시하고 저장된 상태로 되돌린다", async () => {
    const user = userEvent.setup(); await renderEdit();
    apiMock.mockRejectedValueOnce(new ApiError("MOCK_READ_ONLY", "목 데이터 모드에서는 변경할 수 없습니다.", 503));
    await user.click(screen.getByRole("switch", { name: "고객에게 공개" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("목 데이터 모드에서는 변경할 수 없습니다.");
    expect(screen.getByRole("switch", { name: "고객에게 공개" })).not.toBeChecked();
  });

  it("공개 전환 후 재조회해도 저장하지 않은 이름·설명을 유지한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.type(screen.getByLabelText("클래스명"), " 미저장");
    await user.type(screen.getByLabelText("소개"), " 미저장 안내");
    await user.click(screen.getByRole("switch", { name: "고객에게 공개" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "고객에게 공개" })).toBeEnabled());
    expect(screen.getByLabelText("클래스명")).toHaveValue(`${detail.title} 미저장`);
    expect(screen.getByLabelText("소개")).toHaveValue(`${detail.description} 미저장 안내`);
  });

  it("기존 대표 이미지를 미리보기로 표시하고 변경 버튼을 둔다", async () => {
    apiMock.mockResolvedValueOnce({ ...detail, imageUrl: "/images/sample.webp" }); await renderEdit();
    expect(screen.getByRole("img", { name: "도자기 만들기 대표 이미지" })).toBeVisible();
    expect(screen.getByRole("button", { name: "이미지 변경" })).toBeVisible();
  });

  it.each([
    ["image/gif", "test.gif", 5],
    ["image/png", "large.png", IMAGE_MAX_BYTES + 1],
  ])("이미지 형식·크기 오류(%s, %s)는 업로드 전에 거부한다", async (type, name, size) => {
    const user = userEvent.setup({ applyAccept: false }); await renderEdit();
    const input = screen.getByLabelText("대표 이미지 파일");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    await user.upload(input, new File([new Uint8Array(size)], name, { type }));
    expect(await screen.findByRole("alert")).toHaveTextContent("JPEG·PNG·WebP, 4MB 이하 이미지를 선택해 주세요.");
    expect(changes()).toHaveLength(0);
  });

  it("이미지 버튼은 숨긴 파일 선택 창을 연다", async () => {
    const user = userEvent.setup(); await renderEdit();
    const input = screen.getByLabelText("대표 이미지 파일") as HTMLInputElement;
    const open = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "이미지 업로드" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("정상 %s 파일은 고르면 바로 자체 API에 FormData로 PUT하고 재조회한다", async (type) => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const file = new File([new Uint8Array(type === "image/jpeg" ? IMAGE_MAX_BYTES : 5)], "sample", { type });
    await user.upload(screen.getByLabelText("대표 이미지 파일"), file);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(`${path}/image`, { method: "PUT", body: expect.any(FormData) }));
    const upload = apiMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect((upload[1]!.body as FormData).get("image")).toBe(file);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] }));
    expect(toast.success).toHaveBeenCalledWith("대표 이미지를 바꿨어요");
  });

  it("업로드 중 버튼을 비활성화하고 실패 시 서버 사유와 미저장 입력을 유지한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.type(screen.getByLabelText("클래스명"), " 미저장");
    let fail!: (error: Error) => void;
    apiMock.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await user.upload(screen.getByLabelText("대표 이미지 파일"), new File(["image"], "sample.png", { type: "image/png" }));
    expect(screen.getByRole("button", { name: "업로드 중…" })).toBeDisabled();
    await act(async () => { fail(new ApiError("INTERNAL_ERROR", "이미지 저장에 실패했습니다.", 500)); });
    expect(await screen.findByRole("alert")).toHaveTextContent("이미지 저장에 실패했습니다.");
    expect(screen.getByLabelText("클래스명")).toHaveValue(`${detail.title} 미저장`);
  });

  it("R-50: 회차가 없으면 확인 후 DELETE하고 목록으로 이동한다", async () => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(screen.getByText("삭제하면 되돌릴 수 없어요.")).toBeVisible();
    const trigger = screen.getByRole("button", { name: "클래스 삭제" });
    await user.click(trigger);
    let dialog = await screen.findByRole("dialog", { name: "클래스를 삭제할까요?" });
    expect(changes()).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(trigger); dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/classes"));
    expect(apiMock).toHaveBeenCalledWith(path, { method: "DELETE" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("클래스를 삭제했어요");
  });

  it("R-51: 회차가 있으면 삭제 버튼을 비활성으로 두고 비공개 전환을 안내한다", async () => {
    apiMock.mockResolvedValueOnce(withSession); await renderEdit();
    expect(screen.getByRole("button", { name: "클래스 삭제" })).toBeDisabled();
    expect(screen.getByText("회차가 있어 삭제할 수 없어요. 대신 비공개로 전환하세요.")).toBeVisible();
  });

  it("R-51: 삭제 직전에 회차가 생겨 CLASS_HAS_SESSIONS면 비공개 전환 안내만 표시하고 자동 변경하지 않는다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.click(screen.getByRole("button", { name: "클래스 삭제" }));
    const dialog = await screen.findByRole("dialog");
    apiMock.mockRejectedValueOnce(new ApiError("CLASS_HAS_SESSIONS", "회차가 있는 클래스는 삭제할 수 없습니다.", 409));
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("회차가 있어 삭제할 수 없어요. 대신 비공개로 전환하세요.");
    expect(changes()).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("삭제 처리 중에는 다이얼로그 닫기·중복 확정을 막는다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.click(screen.getByRole("button", { name: "클래스 삭제" }));
    const dialog = await screen.findByRole("dialog");
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "처리 중…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    expect(changes()).toHaveLength(1);
    await act(async () => { finish({ ok: true }); });
  });

  it("상세 로딩을 표시한다", async () => {
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    renderForm(detail.id);
    expect(screen.getByRole("status")).toHaveTextContent("클래스 정보를 불러오고 있습니다");
    await act(async () => { finish(detail); });
  });

  it("상세 조회 실패 시 재시도한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "조회에 실패했습니다.", 500)); renderForm(detail.id);
    expect(await screen.findByRole("alert")).toHaveTextContent("클래스 정보를 불러오지 못했어요. 조회에 실패했습니다.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByDisplayValue(detail.title)).toBeVisible();
  });

  it("NOT_FOUND는 클래스 없음과 목록 진입을 표시한다", async () => {
    apiMock.mockRejectedValue(new ApiError("NOT_FOUND", "요청한 정보를 찾을 수 없습니다.", 404)); renderForm(detail.id);
    expect(await screen.findByText("클래스를 찾을 수 없어요.")).toBeVisible();
    expect(screen.getByRole("link", { name: "클래스 관리" })).toHaveAttribute("href", "/admin/classes");
    expect(screen.queryByLabelText("클래스명")).not.toBeInTheDocument();
  });

  it("상세 조회 401이면 로그인으로 이동한다", async () => {
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401)); renderForm(detail.id);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it("변경 요청 401도 로그인으로 이동한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
