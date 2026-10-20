import type { JSX } from "react";

// 스피너 대신 카드·행 모양의 정적인 자리 표시를 보여준다(UI 가이드상 반복 애니메이션은 쓰지 않는다).
export function LoadingPlaceholder({ label, rows = 2 }: { label: string; rows?: number }): JSX.Element {
  return (
    <div role="status" className="min-w-0 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)]">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex flex-col divide-y divide-[var(--border-subtle)]">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} data-placeholder-row className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-4 w-2/5 rounded-[var(--radius-button-sm)] bg-[var(--surface-sunk)]" />
              <div className="h-3.5 w-3/5 rounded-[var(--radius-button-sm)] bg-[var(--surface-raised)]" />
            </div>
            <div className="h-7 w-20 shrink-0 rounded-[var(--radius-card)] bg-[var(--surface-raised)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
