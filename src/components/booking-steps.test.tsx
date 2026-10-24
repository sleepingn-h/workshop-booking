import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BookingSteps } from "./booking-steps";

afterEach(cleanup);

describe("BookingSteps", () => {
  it("R-10, R-33: 신청 완료와 운영자 확인 단계를 안내하고 참여 확정은 이후 단계로 표시한다", () => {
    render(<BookingSteps />);

    const list = screen.getByRole("list", { name: "신청 처리 단계" });
    expect(list.tagName).toBe("OL");
    const steps = within(list).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "신청 (완료)",
      "운영자 확인 (현재 단계)",
      "참여 확정",
    ]);
    expect(steps[0]).not.toHaveAttribute("aria-current");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[2]).not.toHaveAttribute("aria-current");
  });

  it("R-33: 확정 예약은 신청·운영자 확인을 완료하고 참여 확정을 현재 단계로 표시한다", () => {
    render(<BookingSteps status="confirmed" />);

    const steps = within(screen.getByRole("list", { name: "신청 처리 단계" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "신청 (완료)",
      "운영자 확인 (완료)",
      "참여 확정 (현재 단계)",
    ]);
    expect(steps[0]).not.toHaveAttribute("aria-current");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    expect(steps[2]).toHaveAttribute("aria-current", "step");
  });

  it.each(["rejected", "cancelled"] as const)("R-21, R-33: %s 예약은 참여 확정으로 진행 중인 단계를 표시하지 않는다", (status) => {
    render(<BookingSteps status={status} />);

    expect(screen.queryByRole("list", { name: "신청 처리 단계" })).not.toBeInTheDocument();
  });
});
