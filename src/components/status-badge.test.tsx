import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BookingStatusBadge, Tag } from "./status-badge";

afterEach(cleanup);

describe("BookingStatusBadge", () => {
  it.each([
    ["pending", "승인 대기"],
    ["confirmed", "참여 확정"],
    ["rejected", "거절됨"],
    ["cancelled", "취소됨"],
  ] as const)("%s 상태를 한국어 라벨 '%s'로 표시한다", (status, label) => {
    render(<BookingStatusBadge status={status} />);

    expect(screen.getByText(label)).toBeVisible();
  });
});

describe("Tag", () => {
  it.each([
    ["success", "공개"],
    ["neutral", "비공개"],
    ["neutral", "지난 회차"],
    ["danger", "취소된 회차"],
  ] as const)("%s 톤에서 '%s' 텍스트를 표시한다", (tone, label) => {
    render(<Tag tone={tone}>{label}</Tag>);

    expect(screen.getByText(label)).toBeVisible();
  });
});
