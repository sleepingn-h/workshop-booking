import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyButton } from "./copy-button";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("CopyButton", () => {
  it("예약번호를 클립보드에 복사하고 성공 토스트를 표시한다", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<CopyButton text="BK-7F3K2A" />);

    await user.click(screen.getByRole("button", { name: "예약번호 복사" }));

    expect(writeText).toHaveBeenCalledWith("BK-7F3K2A");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("예약번호를 복사했습니다"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("전달받은 라벨을 버튼에 표시한다", () => {
    render(<CopyButton text="BK-7F3K2A" label="번호 복사하기" />);

    expect(screen.getByRole("button", { name: "번호 복사하기" })).toHaveAttribute("type", "button");
  });

  it("클립보드 쓰기에 실패하면 직접 복사를 안내하는 오류 토스트를 표시한다", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Permission denied"));
    render(<CopyButton text="BK-7F3K2A" />);

    await user.click(screen.getByRole("button", { name: "예약번호 복사" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("복사하지 못했습니다. 직접 선택해 복사해 주세요"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("클립보드 API가 없어도 직접 복사를 안내한다", async () => {
    const user = userEvent.setup();
    const clipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<CopyButton text="BK-7F3K2A" />);

    try {
      await user.click(screen.getByRole("button", { name: "예약번호 복사" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("복사하지 못했습니다. 직접 선택해 복사해 주세요"));
      expect(toast.success).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    }
  });
});
