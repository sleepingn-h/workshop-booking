import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { parseClassInfo } from "@/lib/format";

import { ClassFacts } from "./class-facts";

const description = "장소: 가상 도자기 공방\n소요 시간: 2시간\n비용·결제 방법: 1인 45,000원, 현장 결제\n준비물: 없음\n문의처: 010-0000-9001 (시연용 가상 번호)";

afterEach(cleanup);

describe("ClassFacts", () => {
  it("R-53: 소요 시간·비용·장소·준비물·문의처를 라벨이 붙은 정보 항목으로 보여준다", () => {
    render(<ClassFacts facts={parseClassInfo(description).facts} />);

    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual(["소요 시간", "비용·결제 방법", "장소", "준비물", "문의처"]);
    const price = screen.getAllByRole("definition")[1];
    expect(within(price).getByText("1인 45,000원, 현장 결제")).toBeVisible();
    expect(screen.getByText("가상 도자기 공방")).toBeVisible();
  });

  it("R-53: 문의처의 전화번호는 바로 걸 수 있는 링크로 둔다", () => {
    render(<ClassFacts facts={parseClassInfo(description).facts} />);

    expect(screen.getByRole("link", { name: "010-0000-9001" })).toHaveAttribute("href", "tel:01000009001");
    expect(screen.getByText(/시연용 가상 번호/)).toBeVisible();
  });

  it("안내 항목이 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<ClassFacts facts={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
