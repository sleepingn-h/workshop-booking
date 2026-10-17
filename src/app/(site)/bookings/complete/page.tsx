import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CopyButton } from "@/components/copy-button";

export const metadata: Metadata = {
  title: "예약 신청 접수 | 공방 클래스 예약",
  robots: { index: false, follow: false },
};

const lookupLinkClassName = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--color-primary-press)] active:scale-[.97]";

export default async function BookingCompletePage({
  searchParams,
}: PageProps<"/bookings/complete">) {
  const { code } = await searchParams;

  if (typeof code !== "string" || !code.trim()) {
    return (
      <div className="mx-auto max-w-[640px] space-y-6">
        <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">
          예약번호를 확인해 주세요
        </h1>
        <p>예약번호가 없습니다. 예약 조회에서 예약번호와 전화번호 뒷자리 4자리로 신청 결과를 확인해 주세요.</p>
        <Link href="/bookings/lookup" className={lookupLinkClassName}>
          예약 조회로 이동
          <ArrowRight aria-hidden="true" className="size-[18px]" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-10">
      <div className="space-y-6">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success)]">
          <Check aria-hidden="true" className="size-10" />
        </div>
        <div className="space-y-4">
          <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">
            신청이 접수되었습니다
          </h1>
          <p className="text-lg leading-[1.55] max-[641px]:text-base">
            운영자가 신청을 확인한 뒤 승인합니다. 신청만으로 참여가 확정되지는 않아요.
          </p>
        </div>
      </div>

      <ol aria-label="신청 처리 단계" className="grid grid-cols-3 gap-3 text-sm">
        <li className="space-y-3">
          <div aria-hidden="true" className="h-1.5 rounded-full bg-[var(--color-green)]" />
          <span className="flex items-center gap-1 font-semibold">
            신청 완료 <Check aria-hidden="true" className="size-4 shrink-0" />
          </span>
        </li>
        <li aria-current="step" className="space-y-3">
          <div aria-hidden="true" className="h-1.5 rounded-full bg-[var(--color-magenta-300)]" />
          <p className="font-semibold text-[var(--color-magenta-600)]">승인 대기 <span className="sr-only">(현재)</span></p>
        </li>
        <li className="space-y-3">
          <div aria-hidden="true" className="h-1.5 rounded-full bg-[var(--surface-sunk)]" />
          <p className="text-[var(--text-muted)]">참여 확정</p>
        </li>
      </ol>

      <div className="min-w-0 space-y-4 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold">예약번호</h2>
        <p className="select-text font-heading text-[44px] font-extrabold tracking-[.08em] text-[var(--text-strong)] tabular-nums [overflow-wrap:anywhere] max-[641px]:text-[34px]">
          {code}
        </p>
        <CopyButton text={code} />
        <p className="text-sm text-[var(--text-muted)]">예약번호를 보관해 주세요. 결과 조회에 필요합니다.</p>
      </div>

      <div className="space-y-6">
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm">
          승인 결과는 자동으로 알려드리지 않습니다. 예약 조회에서 직접 확인해 주세요.
        </p>
        <Link href={`/bookings/lookup?code=${encodeURIComponent(code)}`} className={lookupLinkClassName}>
          예약 조회하기
          <ArrowRight aria-hidden="true" className="size-[18px]" />
        </Link>
      </div>
    </div>
  );
}
