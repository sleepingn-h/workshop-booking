import { ArrowRight, Check, Info } from "lucide-react";
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
    <div className="mx-auto flex max-w-[640px] flex-col gap-8">
      <div className="flex flex-col items-start gap-4">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success)]">
          <Check aria-hidden="true" className="size-9" />
        </div>
        <h1 className="font-heading text-[28px] leading-[1.2] font-extrabold max-[641px]:text-2xl">
          예약 신청이 접수되었습니다
        </h1>
        <p className="max-w-[56ch] text-lg leading-[1.55] max-[641px]:text-base">
          아직 참여 확정이 아닙니다. 운영자가 신청을 확인한 뒤 승인하며, 결과는 예약 조회에서 직접 확인해 주세요.
        </p>
      </div>

      <section aria-labelledby="booking-code-label" className="min-w-0 space-y-5 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-7 shadow-[var(--shadow-card)] max-[641px]:p-6">
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 space-y-2.5">
            <h2 id="booking-code-label" className="font-sans text-sm font-semibold text-[var(--text-muted)]">예약번호</h2>
            <p className="select-text font-heading text-[44px] leading-none font-extrabold tracking-[.08em] text-[var(--text-strong)] tabular-nums [overflow-wrap:anywhere] max-[641px]:text-[34px]">
              {code}
            </p>
          </div>
          <CopyButton text={code} />
        </div>
        <p className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm leading-[1.55]">
          <Info aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--color-primary)]" />
          예약번호를 보관해 주세요. 결과 조회에 필요합니다. 조회할 때는 신청한 전화번호 뒷자리 4자리도 함께 입력합니다.
        </p>
      </section>

      <ol aria-label="신청 처리 단계" className="grid grid-cols-3 gap-2 text-[13px] leading-[1.3] font-semibold">
        <li className="space-y-2 text-[var(--text-strong)]">
          <div aria-hidden="true" className="h-1.5 rounded-[3px] bg-[var(--color-green)]" />
          <span className="flex items-center gap-1">신청 <Check aria-hidden="true" className="size-3.5 shrink-0" /><span className="sr-only">(완료)</span></span>
        </li>
        <li aria-current="step" className="space-y-2 text-[var(--color-magenta-600)]">
          <div aria-hidden="true" className="h-1.5 rounded-[3px] bg-[var(--color-magenta-300)]" />
          <p>운영자 확인 <span className="sr-only">(현재 단계)</span></p>
        </li>
        <li className="space-y-2 text-[var(--text-muted)]">
          <div aria-hidden="true" className="h-1.5 rounded-[3px] bg-[var(--surface-sunk)]" />
          <p>참여 확정</p>
        </li>
      </ol>

      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          승인 결과는 자동으로 알려드리지 않습니다. 예약 조회에서 직접 확인해 주세요.
        </p>
        <Link href={`/bookings/lookup?code=${encodeURIComponent(code)}`} className={`${lookupLinkClassName} max-[641px]:w-full`}>
          예약 조회하기
          <ArrowRight aria-hidden="true" className="size-[18px]" />
        </Link>
      </div>
    </div>
  );
}
