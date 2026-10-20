import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToggleSwitch } from "./toggle-switch";

afterEach(cleanup);

describe("ToggleSwitch", () => {
  it.each([true, false])("라벨을 이름으로 가진 스위치에 켜짐 %s 상태를 표시한다", (checked) => {
    render(<ToggleSwitch label="공개" checked={checked} onCheckedChange={vi.fn()} />);

    const control = screen.getByRole("switch", { name: "공개" });
    expect(control).toHaveProperty("checked", checked);
  });

  it("클릭과 Space 키로 반대 상태를 알린다", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<ToggleSwitch label="고객에게 공개" checked={false} onCheckedChange={onCheckedChange} />);

    await user.click(screen.getByText("고객에게 공개"));
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    screen.getByRole("switch").focus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it("비활성이면 상태 변경을 알리지 않는다", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<ToggleSwitch label="공개" checked onCheckedChange={onCheckedChange} disabled />);

    expect(screen.getByRole("switch", { name: "공개" })).toBeDisabled();
    await user.click(screen.getByText("공개"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("같은 라벨이 여러 개일 때 대상 이름을 설명으로 연결한다", () => {
    render(<><span id="class-title">도자기 컵</span><ToggleSwitch label="공개" checked onCheckedChange={vi.fn()} describedBy="class-title" /></>);

    expect(screen.getByRole("switch", { name: "공개" })).toHaveAccessibleDescription("도자기 컵");
  });
});
