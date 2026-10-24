import { Info } from "lucide-react";
import type { JSX, ReactNode } from "react";

const infoColorStyles = {
  magenta: "text-[var(--color-magenta-600)]",
  blurple: "text-[var(--color-primary)]",
  green: "text-[var(--color-green-700)]",
};

// 회색 안내 상자. 색은 아이콘에만 쓰고 글씨는 본문색을 유지한다. 여러 줄 안내는 ul로 넘기면 줄마다 블릿을 붙인다.
export function InfoNotice({
  color = "magenta",
  children,
}: {
  color?: "magenta" | "blurple" | "green";
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm leading-[1.55] text-[var(--text-body)]">
      <Info aria-hidden="true" className={`mt-0.5 size-[18px] shrink-0 ${infoColorStyles[color]}`} />
      <div className="min-w-0 space-y-1 break-words [&_li]:marker:text-[var(--text-muted)] [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-4">{children}</div>
    </div>
  );
}
