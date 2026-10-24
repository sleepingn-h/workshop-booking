import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { InfoNotice } from "./info-notice";

afterEach(cleanup);

describe("InfoNotice", () => {
  it("회색 안내 상자에 내용을 표시하고 아이콘은 기본 magenta-600으로 장식만 한다", () => {
    const { container } = render(<InfoNotice><p>예약번호를 보관해 주세요.</p><p>조회·취소할 때 예약번호가 필요해요.</p></InfoNotice>);

    expect(screen.getByText("예약번호를 보관해 주세요.")).toBeVisible();
    expect(screen.getByText("조회·취소할 때 예약번호가 필요해요.")).toBeVisible();
    const icon = container.querySelector("svg");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveClass("text-[var(--color-magenta-600)]");
  });

  it("여러 줄 안내는 ul 목록으로 받아 줄마다 앞에 블릿을 붙인다", () => {
    render(<InfoNotice><ul><li>예약번호를 보관해 주세요.</li><li>조회·취소할 때 예약번호가 필요해요.</li></ul></InfoNotice>);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "예약번호를 보관해 주세요.",
      "조회·취소할 때 예약번호가 필요해요.",
    ]);
    expect(list.parentElement).toHaveClass("[&_ul]:list-disc", "[&_ul]:pl-4");
  });

  it.each([
    ["blurple", "text-[var(--color-primary)]"],
    ["green", "text-[var(--color-green-700)]"],
  ] as const)("color=%s이면 아이콘을 %s로 칠한다", (color, className) => {
    const { container } = render(<InfoNotice color={color}><p>안내</p></InfoNotice>);

    expect(container.querySelector("svg")).toHaveClass(className);
    expect(container.querySelector("svg")).not.toHaveClass("text-[var(--color-magenta-600)]");
  });
});
