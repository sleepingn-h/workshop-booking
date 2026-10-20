import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteNav } from "./site-nav";

const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

beforeEach(() => { navigation.pathname = "/"; });
afterEach(cleanup);

describe("SiteNav", () => {
  it.each([
    ["/", "클래스", "예약 조회"],
    ["/classes/class-1", "클래스", "예약 조회"],
    ["/bookings/lookup", "예약 조회", "클래스"],
  ])("경로 %s에서 현재 메뉴 %s에만 aria-current를 표시한다", (path, current, other) => {
    navigation.pathname = path;
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: current })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
  });

  it("신청 완료 화면에서는 어떤 메뉴도 현재 페이지로 표시하지 않는다", () => {
    navigation.pathname = "/bookings/complete";
    render(<SiteNav />);

    expect(screen.getByRole("navigation", { name: "고객 메뉴" })).toBeVisible();
    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "예약 조회" })).toHaveAttribute("href", "/bookings/lookup");
  });
});
