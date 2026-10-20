import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "클래스를 찾을 수 없습니다 | 공방 클래스 예약",
  robots: { index: false, follow: false },
};

const primaryLinkClassName = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-5 py-3 text-base font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--color-primary-press)] active:scale-[.97]";
const ghostLinkClassName = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface-raised)] px-5 py-3 text-base font-medium text-[var(--text-strong)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--surface-sunk)] active:scale-[.97]";

// 비공개·삭제된 클래스나 잘못된 주소에서도 막다른 화면 대신 다음 행동(목록·예약 조회)을 준다.
export default function SiteNotFound() {
  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">
        클래스를 찾을 수 없습니다
      </h1>
      <p className="text-lg leading-[1.55] max-[641px]:text-base">
        주소가 바뀌었거나 지금은 신청을 받지 않는 클래스입니다. 목록에서 다른 클래스를 찾아 주세요. 이미 신청한 예약은 예약 조회에서 확인할 수 있습니다.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/" className={primaryLinkClassName}>
          클래스 목록 보기
          <ArrowRight aria-hidden="true" className="size-[18px]" />
        </Link>
        <Link href="/bookings/lookup" className={ghostLinkClassName}>예약 조회</Link>
      </div>
    </div>
  );
}
