import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ClassFacts, ClassSummaryLine } from "./class-facts";

const info = {
  place: "가상 도자기 공방",
  durationMinutes: 120,
  price: 45000,
  paymentMethod: "현장 결제",
  materials: "없음",
  contact: "010-0000-9001 (시연용 가상 번호)",
};

afterEach(cleanup);

describe("ClassFacts", () => {
  it("R-53: 소요 시간·비용·결제 방법·문의처·장소·준비물을 라벨이 붙은 정보 항목으로 보여준다", () => {
    render(<ClassFacts info={info} />);

    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual(["소요 시간", "비용 (1인)", "결제 방법", "문의처", "장소", "준비물"]);
    const definitions = screen.getAllByRole("definition");
    expect(within(definitions[0]).getByText("120분")).toBeVisible();
    expect(within(definitions[1]).getByText("₩45,000")).toBeVisible();
    expect(screen.getByText("가상 도자기 공방")).toBeVisible();
  });

  it("R-53: 비용이 0원이면 무료로 보여준다", () => {
    render(<ClassFacts info={{ ...info, price: 0 }} />);

    expect(within(screen.getAllByRole("definition")[1]).getByText("무료")).toBeVisible();
  });

  it("R-53: 문의처의 전화번호는 바로 걸 수 있는 링크로 둔다", () => {
    render(<ClassFacts info={info} />);

    expect(screen.getByRole("link", { name: "010-0000-9001" })).toHaveAttribute("href", "tel:01000009001");
    expect(screen.getByText(/시연용 가상 번호/)).toBeVisible();
  });
});

describe("ClassSummaryLine", () => {
  it("R-53: 목록 한 줄에 장소·소요 시간·비용을 순서대로 보여준다", () => {
    render(<ClassSummaryLine info={info} />);

    expect(screen.getByText("가상 도자기 공방").parentElement).toHaveTextContent("가상 도자기 공방·120분·₩45,000");
  });

  it("R-53: 비용이 0원이면 무료로 보여준다", () => {
    render(<ClassSummaryLine info={{ ...info, price: 0 }} />);

    expect(screen.getByText("무료")).toBeVisible();
  });
});
