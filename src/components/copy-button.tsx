"use client";

import { Copy } from "lucide-react";
import type { JSX } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "예약번호 복사",
}: {
  text: string;
  label?: string;
}): JSX.Element {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("예약번호를 복사했습니다");
    } catch {
      toast.error("복사하지 못했습니다. 직접 선택해 복사해 주세요");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleCopy}
      className="h-11 gap-2 rounded-[var(--radius-card)] bg-[var(--surface-raised)] px-5 text-base font-medium text-[var(--text-strong)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--surface-sunk)] active:translate-y-0 active:scale-[.97]"
    >
      <Copy aria-hidden="true" className="size-[18px]" />
      {label}
    </Button>
  );
}
