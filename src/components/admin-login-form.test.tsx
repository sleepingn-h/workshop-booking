import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";

import { AdminLoginForm } from "./admin-login-form";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
let client: QueryClient;

function renderForm() {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminLoginForm /></QueryClientProvider>);
}

beforeEach(() => { vi.clearAllMocks(); apiMock.mockReset(); apiMock.mockResolvedValue({ ok: true }); });
afterEach(() => { cleanup(); client.clear(); });

describe("AdminLoginForm", () => {
  it("빈 비밀번호 제출을 막고 필드 오류를 표시한다", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    expect(screen.getByLabelText("비밀번호")).toHaveAccessibleDescription("비밀번호를 입력해 주세요.");
    expect(screen.getByLabelText("비밀번호")).toHaveFocus();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("로그인 성공 시 인증 상태를 새로고침한 뒤 운영자 예약 목록으로 교체 이동한다", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("비밀번호"), " test password {Enter}");
    expect(apiMock).toHaveBeenCalledExactlyOnceWith("/api/admin/login", { method: "POST", json: { password: " test password " } });
    expect(router.replace).toHaveBeenCalledWith("/admin");
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(router.refresh.mock.invocationCallOrder[0]).toBeLessThan(router.replace.mock.invocationCallOrder[0]);
  });

  it("401이면 비밀번호 오류를 표시하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(new ApiError("UNAUTHORIZED", "운영자 인증이 필요합니다.", 401));
    renderForm();
    await user.type(screen.getByLabelText("비밀번호"), "wrong");
    await user.click(screen.getByRole("button", { name: "로그인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("비밀번호가 올바르지 않습니다");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("wrong");
    await waitFor(() => expect(screen.getByLabelText("비밀번호")).toHaveFocus());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("네트워크 실패 시 원인을 표시하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValue(new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0));
    renderForm();
    await user.type(screen.getByLabelText("비밀번호"), "password{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("네트워크 연결을 확인해 주세요.");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("password");
  });

  it("제출 중 입력과 버튼을 비활성화하고 중복 제출을 막는다", async () => {
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderForm();
    await user.type(screen.getByLabelText("비밀번호"), "password{Enter}");
    const button = screen.getByRole("button", { name: "로그인 중…" });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("비밀번호")).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(apiMock).toHaveBeenCalledOnce();
    await act(async () => { finish({ ok: true }); });
  });
});
