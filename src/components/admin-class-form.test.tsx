import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
const path = `/api/admin/classes/${detail.id}`;
const clients: QueryClient[] = [];
function renderForm(classId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><AdminClassForm classId={classId} /></QueryClientProvider>);
  return client;
}
async function renderEdit() {
  const client = renderForm(detail.id);
  await screen.findByDisplayValue(detail.title);
  return client;
}
async function fillCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("클래스 이름"), "  향수 만들기  ");
  await user.type(screen.getByLabelText("클래스 설명"), "  장소: 서울  ");
}
beforeEach(() => {
  vi.clearAllMocks();
  apiMock.mockReset();
  apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : detail);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("AdminClassForm 생성", () => {
  it("빈 이름은 필드 오류를 표시하고 API를 호출하지 않는다", async () => {
    const user = userEvent.setup(); renderForm();
    await user.type(screen.getByLabelText("클래스 이름"), "   ");
    await user.click(screen.getByRole("button", { name: "클래스 만들기" }));
    expect(screen.getByRole("alert")).toHaveTextContent("클래스 이름을 입력해 주세요.");
    expect(screen.getByLabelText("클래스 이름")).toHaveAttribute("aria-invalid", "true");
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("R-53, R-57: 비공개 생성 안내와 설명 체크리스트를 별도 입력 없이 제공한다", () => {
    renderForm();
    expect(screen.getByText("새 클래스는 비공개로 만들어집니다.")).toBeVisible();
    const checklist = screen.getByRole("list", { name: "설명 필수 안내 항목" });
    for (const item of ["장소", "소요 시간", "비용과 결제 방법", "준비물", "문의처"]) expect(within(checklist).getByText(item, { exact: false })).toBeVisible();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.queryByLabelText("대표 이미지 파일")).not.toBeInTheDocument();
  });

  it("R-57: 정리한 이름·설명만 POST하고 생성된 비공개 클래스 상세로 이동한다", async () => {
    const user = userEvent.setup(); const client = renderForm();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    apiMock.mockResolvedValueOnce({ id: "new-class" });
    await fillCreate(user);
    await user.click(screen.getByRole("button", { name: "클래스 만들기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/classes/new-class"));
    expect(apiMock).toHaveBeenCalledWith("/api/admin/classes", { method: "POST", json: { title: "향수 만들기", description: "장소: 서울" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
  });

  it("생성 실패 시 입력과 서버 사유를 유지한다", async () => {
    const user = userEvent.setup(); renderForm(); await fillCreate(user);
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "클래스를 만들지 못했습니다.", 500));
    await user.click(screen.getByRole("button", { name: "클래스 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("클래스를 만들지 못했습니다.");
    expect(screen.getByLabelText("클래스 이름")).toHaveValue("  향수 만들기  ");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("생성 중 버튼·필드를 비활성화하고 중복 제출을 막는다", async () => {
    const user = userEvent.setup(); renderForm(); await fillCreate(user);
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: "클래스 만들기" }));
    expect(screen.getByRole("button", { name: "만드는 중…" })).toBeDisabled();
    expect(screen.getByLabelText("클래스 이름")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "만드는 중…" }));
    expect(apiMock).toHaveBeenCalledOnce();
    await act(async () => { finish({ id: "new-class" }); });
  });
});

describe("AdminClassForm 수정", () => {
  it("R-58: 상세 쿼리 키로 이름·설명·비공개 상태와 이미지 대체 면을 표시한다", async () => {
    const client = await renderEdit();
    expect(client.getQueryData(["admin", "class", detail.id])).toEqual(detail);
    expect(apiMock).toHaveBeenCalledWith(path);
    expect(screen.getByLabelText("클래스 설명")).toHaveValue(detail.description);
    expect(screen.getByText("비공개", { exact: true })).toBeVisible();
    expect(screen.getByText("등록된 이미지가 없습니다.")).toBeVisible();
  });

  it("R-58: 수정한 이름·설명만 PATCH하고 운영자 쿼리와 토스트를 갱신한다", async () => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await user.clear(screen.getByLabelText("클래스 이름"));
    await user.type(screen.getByLabelText("클래스 이름"), "  새 도자기  ");
    apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : { ...detail, title: "새 도자기" });
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("클래스 정보를 저장했습니다"));
    expect(apiMock).toHaveBeenCalledWith(path, { method: "PATCH", json: { title: "새 도자기", description: detail.description } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    await waitFor(() => expect(screen.getByLabelText("클래스 이름")).toHaveValue("새 도자기"));
  });

  it("수정 실패 시 이름·설명 입력과 서버 사유를 유지한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.type(screen.getByLabelText("클래스 이름"), " 수정");
    await user.type(screen.getByLabelText("클래스 설명"), " 추가 안내");
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "저장에 실패했습니다.", 500));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("저장에 실패했습니다.");
    expect(screen.getByLabelText("클래스 이름")).toHaveValue(`${detail.title} 수정`);
    expect(screen.getByLabelText("클래스 설명")).toHaveValue(`${detail.description} 추가 안내`);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("서버의 필드 오류도 해당 입력에 연결한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    apiMock.mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "입력을 확인하세요.", 400, { title: "이름을 다시 확인해 주세요." }));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    expect(await screen.findByText("이름을 다시 확인해 주세요.")).toBeVisible();
    expect(screen.getByLabelText("클래스 이름")).toHaveAttribute("aria-invalid", "true");
  });

  it("R-52, R-53, R-57: 공개 전환은 안내 확인 후 isPublished만 PATCH한다", async () => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const trigger = screen.getByRole("button", { name: "공개로 전환" });
    trigger.focus(); await user.keyboard("{Enter}");
    let dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("설명에 필수 안내가 모두 있는지 확인했나요?");
    expect(apiMock).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.keyboard("{Enter}"); dialog = await screen.findByRole("dialog");
    apiMock.mockImplementation(async (_path, init) => init?.method ? { ok: true } : { ...detail, isPublished: true });
    await user.click(within(dialog).getByRole("button", { name: "공개하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(path, { method: "PATCH", json: { isPublished: true } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(await screen.findByText("공개", { exact: true })).toBeVisible();
  });

  it("R-52: 비공개 전환은 기존 예약 유지 안내를 확인한 후 PATCH한다", async () => {
    const user = userEvent.setup(); apiMock.mockResolvedValueOnce({ ...detail, isPublished: true }); await renderEdit();
    await user.click(screen.getByRole("button", { name: "비공개로 전환" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("고객 목록·검색에서 사라지고 새 예약을 받지 않습니다. 기존 예약은 유지됩니다");
    await user.click(within(dialog).getByRole("button", { name: "비공개로 전환하기" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(path, { method: "PATCH", json: { isPublished: false } }));
  });

  it("공개 전환 후 재조회해도 저장하지 않은 이름·설명을 유지한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.type(screen.getByLabelText("클래스 이름"), " 미저장");
    await user.type(screen.getByLabelText("클래스 설명"), " 미저장 안내");
    await user.click(screen.getByRole("button", { name: "공개로 전환" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "공개하기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("클래스 이름")).toHaveValue(`${detail.title} 미저장`);
    expect(screen.getByLabelText("클래스 설명")).toHaveValue(`${detail.description} 미저장 안내`);
  });

  it("기존 대표 이미지를 미리보기로 표시한다", async () => {
    apiMock.mockResolvedValueOnce({ ...detail, imageUrl: "/images/sample.webp" }); await renderEdit();
    expect(screen.getByRole("img", { name: "도자기 만들기 대표 이미지" })).toHaveAttribute("alt", "도자기 만들기 대표 이미지");
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
    await user.click(screen.getByRole("button", { name: "이미지 업로드" }));
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("정상 %s 파일은 자체 API에 FormData로 PUT하고 재조회한다", async (type) => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const file = new File([new Uint8Array(type === "image/jpeg" ? IMAGE_MAX_BYTES : 5)], "sample", { type });
    await user.upload(screen.getByLabelText("대표 이미지 파일"), file);
    await user.click(screen.getByRole("button", { name: "이미지 업로드" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(`${path}/image`, { method: "PUT", body: expect.any(FormData) }));
    const upload = apiMock.mock.calls.find(([, init]) => init?.method === "PUT")!;
    expect((upload[1]!.body as FormData).get("image")).toBe(file);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
    expect(toast.success).toHaveBeenCalledWith("대표 이미지를 저장했습니다");
  });

  it("이미지 업로드 실패 시 선택 파일과 미저장 입력을 유지한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.type(screen.getByLabelText("클래스 이름"), " 미저장");
    const file = new File(["image"], "sample.png", { type: "image/png" });
    const input = screen.getByLabelText("대표 이미지 파일") as HTMLInputElement;
    await user.upload(input, file);
    apiMock.mockRejectedValueOnce(new ApiError("INTERNAL_ERROR", "이미지 저장에 실패했습니다.", 500));
    await user.click(screen.getByRole("button", { name: "이미지 업로드" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이미지 저장에 실패했습니다.");
    expect(input.files?.[0]).toBe(file);
    expect(screen.getByLabelText("클래스 이름")).toHaveValue(`${detail.title} 미저장`);
  });

  it("R-50: 삭제는 확인 후 DELETE하고 목록으로 이동한다", async () => {
    const user = userEvent.setup(); const client = await renderEdit();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const trigger = screen.getByRole("button", { name: "클래스 삭제" });
    await user.click(trigger);
    let dialog = await screen.findByRole("dialog");
    expect(apiMock).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole("button", { name: "돌아가기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(trigger); dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/classes"));
    expect(apiMock).toHaveBeenCalledWith(path, { method: "DELETE" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["admin"] });
  });

  it("R-51: CLASS_HAS_SESSIONS는 비공개 전환 안내만 표시하고 자동 변경하지 않는다", async () => {
    const user = userEvent.setup(); await renderEdit();
    await user.click(screen.getByRole("button", { name: "클래스 삭제" }));
    const dialog = await screen.findByRole("dialog");
    apiMock.mockRejectedValueOnce(new ApiError("CLASS_HAS_SESSIONS", "회차가 있는 클래스는 삭제할 수 없습니다.", 409));
    await user.click(within(dialog).getByRole("button", { name: "삭제하기" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("회차가 있는 클래스는 삭제할 수 없어요. 비공개로 전환해 주세요");
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(router.push).not.toHaveBeenCalled();
  });

  it.each([
    ["공개로 전환", "공개하기"], ["클래스 삭제", "삭제하기"],
  ])("%s 처리 중에는 다이얼로그 닫기·중복 확정을 막는다", async (trigger, confirm) => {
    const user = userEvent.setup(); await renderEdit();
    await user.click(screen.getByRole("button", { name: trigger }));
    const dialog = await screen.findByRole("dialog");
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(within(dialog).getByRole("button", { name: confirm }));
    expect(within(dialog).getByRole("button", { name: "돌아가기" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "처리 중…" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    expect(apiMock).toHaveBeenCalledTimes(2);
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
    expect(await screen.findByRole("alert")).toHaveTextContent("조회에 실패했습니다.");
    await user.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByDisplayValue(detail.title)).toBeVisible();
  });

  it("NOT_FOUND는 클래스 없음과 목록 진입을 표시한다", async () => {
    apiMock.mockRejectedValue(new ApiError("NOT_FOUND", "요청한 정보를 찾을 수 없습니다.", 404)); renderForm(detail.id);
    expect(await screen.findByText("클래스를 찾을 수 없습니다.")).toBeVisible();
    expect(screen.getByRole("link", { name: "클래스 목록" })).toHaveAttribute("href", "/admin/classes");
    expect(screen.queryByLabelText("클래스 이름")).not.toBeInTheDocument();
  });

  it("상세 조회 401이면 로그인으로 이동한다", async () => {
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401)); renderForm(detail.id);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
    expect(apiMock).toHaveBeenCalledOnce();
  });

  it("변경 요청 401도 로그인으로 이동한다", async () => {
    const user = userEvent.setup(); await renderEdit();
    apiMock.mockRejectedValueOnce(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
