import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BookingReceipt } from "@/lib/types";

import { BookingReceiptDetails, saveBookingReceipt } from "./booking-receipt";

const receipt: BookingReceipt = {
  code: "BK-TEST01",
  status: "pending",
  classTitle: "손으로 빚는 도자기 컵",
  place: "서울 공방",
  startsAt: "2026-10-19T16:00:00Z",
  durationMinutes: 120,
  headcount: 2,
  customer: { name: "홍*동", phone: "010-****-5678" },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("BookingReceiptDetails", () => {
  it("R-10, R-33: 저장한 신청 내용을 상태·클래스·신청자·일시·장소·인원 순서로 표시한다", () => {
    saveBookingReceipt(receipt);
    render(<BookingReceiptDetails code="BK-TEST01" />);

    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(["상태", "클래스", "신청자", "일시", "장소", "인원"]);
    expect(screen.getByText("승인 대기")).toBeVisible();
    expect(screen.getByText("손으로 빚는 도자기 컵")).toBeVisible();
    expect(screen.getByText("홍*동 · 010-****-5678")).toBeVisible();
    expect(screen.getByText("10월 20일 (화) 오전 1:00–오전 3:00")).toBeVisible();
    expect(screen.getByText("서울 공방")).toBeVisible();
    expect(screen.getByText("2명")).toBeVisible();
  });

  it("R-30: 같은 탭에 저장한 다른 예약번호의 신청 내용은 표시하지 않는다", () => {
    saveBookingReceipt(receipt);
    const { container } = render(<BookingReceiptDetails code="BK-OTHER" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("R-30: 저장한 신청 내용이 없거나 형식이 맞지 않으면 표시하지 않는다", () => {
    const { container, rerender } = render(<BookingReceiptDetails code="BK-TEST01" />);
    expect(container).toBeEmptyDOMElement();

    sessionStorage.setItem("booking-receipt:BK-BROKEN", "{");
    rerender(<BookingReceiptDetails code="BK-BROKEN" />);
    expect(container).toBeEmptyDOMElement();

    sessionStorage.setItem("booking-receipt:BK-PARTIAL", JSON.stringify({ ...receipt, code: "BK-PARTIAL", customer: undefined }));
    rerender(<BookingReceiptDetails code="BK-PARTIAL" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("저장소를 쓸 수 없으면 저장을 건너뛰고 신청 내용 없이 표시한다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });

    expect(() => saveBookingReceipt(receipt)).not.toThrow();
    const { container } = render(<BookingReceiptDetails code="BK-TEST01" />);
    expect(container).toBeEmptyDOMElement();
  });
});
