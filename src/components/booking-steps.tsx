import { Check, X } from "lucide-react";
import type { JSX } from "react";

import type { BookingStatus } from "@/lib/types";

type StepState = "done" | "rejected" | "todo";

const stepStyles: Record<StepState, { text: string; bar: string }> = {
  done: { text: "text-[var(--text-strong)]", bar: "bg-[var(--color-green)]" },
  rejected: { text: "text-[var(--badge-rejected-text)]", bar: "bg-[var(--badge-rejected-text)]" },
  todo: { text: "text-[var(--text-muted)]", bar: "bg-[var(--surface-sunk)]" },
};

// 이미 일어난 단계만 완료로 칠한다. 승인 한 번으로 운영자 확인과 참여 확정이 함께 끝나므로 승인 대기는 신청만 완료다.
function stepsOf(status: BookingStatus): { label: string; state: StepState }[] | null {
  if (status === "cancelled") return null; // 어느 단계에서 취소됐는지 알 수 없다.
  const reviewed = status !== "pending";
  return [
    { label: "신청", state: "done" },
    { label: "운영자 확인", state: reviewed ? "done" : "todo" },
    status === "rejected"
      ? { label: "거절됨", state: "rejected" }
      : { label: "참여 확정", state: status === "confirmed" ? "done" : "todo" },
  ];
}

export function BookingSteps({ status = "pending" }: { status?: BookingStatus }): JSX.Element | null {
  const steps = stepsOf(status);
  if (!steps) return null;

  return (
    <ol aria-label="신청 처리 단계" className="grid grid-cols-3 gap-2 text-[13px] leading-[1.3] font-semibold">
      {steps.map(({ label, state }) => (
        <li key={label} className={`space-y-2 ${stepStyles[state].text}`}>
          <div aria-hidden="true" className={`h-1.5 rounded-[3px] ${stepStyles[state].bar}`} />
          <span className="flex items-center gap-1">
            {label}
            {state === "done" && <>
              <Check aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="sr-only"> (완료)</span>
            </>}
            {state === "rejected" && <X aria-hidden="true" className="size-3.5 shrink-0" />}
          </span>
        </li>
      ))}
    </ol>
  );
}
