import type { JSX } from "react";

// 네이티브 체크박스에 switch 역할을 주어 키보드·라벨 클릭을 브라우저 기본 동작으로 처리한다.
export function ToggleSwitch({ label, checked, onCheckedChange, disabled = false, describedBy }: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
}): JSX.Element {
  return (
    <label className={`inline-flex min-h-11 shrink-0 items-center gap-3 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={describedBy} onChange={(event) => onCheckedChange(event.target.checked)} className="peer sr-only" />
      <span aria-hidden="true" className={`flex h-8 w-[52px] shrink-0 rounded-full p-1 transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] ${checked ? "bg-[var(--color-green)]" : "bg-[var(--switch-off)]"}`}>
        <span className={`size-6 rounded-full bg-[var(--surface-card)] shadow-[var(--shadow-switch-thumb)] transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] ${checked ? "translate-x-5" : ""}`} />
      </span>
      <span className="font-medium text-[var(--text-strong)]">{label}</span>
    </label>
  );
}
