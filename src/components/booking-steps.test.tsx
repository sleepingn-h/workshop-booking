import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BookingSteps } from "./booking-steps";

afterEach(cleanup);

function getSteps() {
  const list = screen.getByRole("list", { name: "신청 처리 단계" });
  expect(list.tagName).toBe("OL");
  return within(list).getAllByRole("listitem");
}

describe("BookingSteps", () => {
  it("R-10, R-33: 승인 대기는 신청만 완료로 표시하고 운영자 확인·참여 확정은 진행 중 색 없이 남은 단계로 둔다", () => {
    render(<BookingSteps />);

    const steps = getSteps();
    expect(steps.map((step) => step.textContent)).toEqual(["신청 (완료)", "운영자 확인", "참여 확정"]);
    expect(steps[1].className).toBe(steps[2].className);
    expect(steps[1].className).not.toBe(steps[0].className);
    for (const step of steps) expect(step).not.toHaveAttribute("aria-current");
  });

  it("R-33: 참여 확정은 세 단계를 모두 완료로 표시한다", () => {
    render(<BookingSteps status="confirmed" />);

    const steps = getSteps();
    expect(steps.map((step) => step.textContent)).toEqual(["신청 (완료)", "운영자 확인 (완료)", "참여 확정 (완료)"]);
    expect(new Set(steps.map((step) => step.className)).size).toBe(1);
    for (const step of steps) expect(step).not.toHaveAttribute("aria-current");
  });

  it("R-21, R-33: 거절됨은 신청·운영자 확인을 완료로 두고 마지막 단계를 참여 확정 대신 거절됨으로 표시한다", () => {
    render(<BookingSteps status="rejected" />);

    const steps = getSteps();
    expect(steps.map((step) => step.textContent)).toEqual(["신청 (완료)", "운영자 확인 (완료)", "거절됨"]);
    expect(steps[1].className).toBe(steps[0].className);
    expect(steps[2].className).not.toBe(steps[0].className);
    expect(screen.queryByText("참여 확정")).not.toBeInTheDocument();
  });

  it("R-21, R-33: 취소됨은 어느 단계에서 취소됐는지 알 수 없으므로 단계를 표시하지 않는다", () => {
    render(<BookingSteps status="cancelled" />);

    expect(screen.queryByRole("list", { name: "신청 처리 단계" })).not.toBeInTheDocument();
  });
});
