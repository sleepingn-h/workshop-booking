import Link from "next/link";
import type { ReactNode } from "react";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] border-b border-[var(--border-subtle)] bg-[var(--surface-card)] max-[641px]:h-[60px]">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-2 px-8 max-[641px]:px-4">
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center font-heading text-[22px] font-black tracking-[-.02em] text-[var(--text-strong)] max-[641px]:text-[19px]"
          >
            공방 클래스 예약
          </Link>
          <nav aria-label="고객 메뉴" className="flex shrink-0 items-center gap-1">
            <Link
              href="/"
              className="inline-flex h-11 items-center rounded-[var(--radius-pill)] px-3.5 text-[15px] font-medium text-[var(--text-strong)] transition-colors duration-120 hover:bg-[var(--surface-raised)]"
            >
              클래스
            </Link>
            <Link
              href="/bookings/lookup"
              className="inline-flex h-11 items-center rounded-[var(--radius-pill)] px-3.5 text-[15px] font-medium text-[var(--text-strong)] transition-colors duration-120 hover:bg-[var(--surface-raised)]"
            >
              예약 조회
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto mt-[68px] w-full min-w-0 max-w-[1200px] px-8 pt-10 pb-24 max-[641px]:mt-[60px] max-[641px]:px-4 max-[641px]:pt-6 max-[641px]:pb-[72px]">
        {children}
      </main>
    </>
  );
}
