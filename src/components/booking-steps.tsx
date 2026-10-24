import { Check } from "lucide-react";
import type { JSX } from "react";

import type { BookingStatus } from "@/lib/types";

const labels = ["신청", "운영자 확인", "참여 확정"];

export function BookingSteps({ status = "pending" }: { status?: BookingStatus }): JSX.Element | null {
  if (status === "rejected" || status === "cancelled") return null;
  const currentStep = status === "confirmed" ? 2 : 1;

  return (
    <ol aria-label="신청 처리 단계" className="grid grid-cols-3 gap-2 text-[13px] leading-[1.3] font-semibold">
      {labels.map((label, index) => {
        const current = index === currentStep;
        const completed = index < currentStep || status === "confirmed";
        const textClassName = completed ? "text-[var(--text-strong)]" : current ? "text-[var(--color-magenta-600)]" : "text-[var(--text-muted)]";
        const barClassName = completed ? "bg-[var(--color-green)]" : current ? "bg-[var(--color-magenta-300)]" : "bg-[var(--surface-sunk)]";

        return (
          <li key={label} aria-current={current ? "step" : undefined} className={`space-y-2 ${textClassName}`}>
            <div aria-hidden="true" className={`h-1.5 rounded-[3px] ${barClassName}`} />
            <span className="flex items-center gap-1">
              {label}
              {completed && <Check aria-hidden="true" className="size-3.5 shrink-0" />}
              {(current || completed) && <span className="sr-only">{current ? " (현재 단계)" : " (완료)"}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
