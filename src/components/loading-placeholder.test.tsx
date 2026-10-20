import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { LoadingPlaceholder } from "./loading-placeholder";

afterEach(cleanup);

describe("LoadingPlaceholder", () => {
  it("로딩 문구를 상태로 알리고 실제 레이아웃 모양의 자리 표시를 행 수만큼 그린다", () => {
    const { container } = render(<LoadingPlaceholder label="예약 목록을 불러오고 있습니다…" rows={3} />);

    expect(screen.getByRole("status")).toHaveTextContent("예약 목록을 불러오고 있습니다…");
    expect(container.querySelectorAll("[data-placeholder-row]")).toHaveLength(3);
  });

  it("자리 표시는 보조 기술에 읽히지 않고 움직이지 않는다", () => {
    const { container } = render(<LoadingPlaceholder label="불러오는 중" />);

    for (const row of container.querySelectorAll("[data-placeholder-row]")) {
      expect(row.closest("[aria-hidden='true']")).not.toBeNull();
    }
    expect(container.innerHTML).not.toMatch(/animate-/);
  });
});
