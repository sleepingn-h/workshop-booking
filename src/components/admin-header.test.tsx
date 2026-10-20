import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "@/lib/api";

import { AdminHeader } from "./admin-header";

const navigation = vi.hoisted(() => ({ pathname: "/admin", router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useRouter: () => navigation.router }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: vi.fn() }));
const apiMock = vi.mocked(apiFetch);
let client: QueryClient;
function renderHeader() {
  client = new QueryClient();
  render(<QueryClientProvider client={client}><AdminHeader /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); navigation.pathname = "/admin"; apiMock.mockReset(); apiMock.mockResolvedValue({ ok: true }); });
afterEach(() => { cleanup(); client.clear(); });

describe("AdminHeader", () => {
  it.each(["/admin/login", "/admin/login/"])("로그인 경로 %s에서는 로고만 표시한다", (path) => {
    navigation.pathname = path;
    renderHeader();
    expect(screen.getByRole("link", { name: "공방 클래스 예약" })).toBeVisible();
    expect(screen.getByText("운영자")).toBeVisible();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument();
  });

  it.each([
    ["/admin", "예약 관리", "클래스 관리"],
    ["/admin/classes", "클래스 관리", "예약 관리"],
    ["/admin/classes/class-1", "클래스 관리", "예약 관리"],
  ])("경로 %s에 맞는 내비에만 aria-current를 표시한다", (path, current, other) => {
    navigation.pathname = path;
    renderHeader();
    expect(screen.getAllByRole("link", { name: current }).every((link) => link.getAttribute("aria-current") === "page")).toBe(true);
    expect(screen.getAllByRole("link", { name: other }).every((link) => !link.hasAttribute("aria-current"))).toBe(true);
  });

  it("로그아웃 API 성공 후 로그인 화면으로 이동하고 운영자 캐시를 제거한다", async () => {
    const user = userEvent.setup();
    renderHeader();
    client.setQueryData(["admin", "bookings", {}], { private: true });
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/admin/login"));
    expect(apiMock).toHaveBeenCalledExactlyOnceWith("/api/admin/logout", { method: "POST" });
    expect(client.getQueryData(["admin", "bookings", {}])).toBeUndefined();
  });

  it("로그아웃 요청 중 버튼을 비활성화한다", async () => {
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    apiMock.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderHeader();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(screen.getByRole("button", { name: "로그아웃 중…" })).toBeDisabled();
    await act(async () => { finish({ ok: true }); });
  });

  it("로그아웃 실패를 표시하고 다시 시도할 수 있다", async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "네트워크 연결을 확인해 주세요.", 0));
    renderHeader();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("네트워크 연결을 확인해 주세요.");
    expect(navigation.router.replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith("/admin/login"));
  });
});
