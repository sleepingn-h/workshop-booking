import Link from "next/link";
import type { ReactNode } from "react";

import { SiteNav } from "@/components/site-nav";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] border-b border-[var(--border-subtle)] bg-[var(--surface-card)] max-[641px]:h-[60px]">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-2 px-8 max-[641px]:px-4">
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center gap-2.5 font-heading text-[22px] font-black tracking-[-.02em] text-[var(--text-strong)] max-[641px]:text-[19px]"
          >
            <span aria-hidden="true" className="flex gap-0.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--color-green)]" />
              <span className="size-2.5 rounded-[3px] bg-[var(--color-magenta)]" />
            </span>
            공방 클래스 예약
          </Link>
          <SiteNav />
        </div>
      </header>
      <main className="mx-auto mt-[68px] w-full min-w-0 max-w-[1200px] flex-1 px-8 pt-10 pb-24 max-[641px]:mt-[60px] max-[641px]:px-4 max-[641px]:pt-6 max-[641px]:pb-[72px]">
        {children}
      </main>
      <footer className="border-t border-[var(--border-subtle)] py-7 text-sm text-[var(--text-muted)]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-8 max-[641px]:px-4">
          <span>공방 클래스 예약 · 회원가입 없이 예약 신청</span>
          <Link href="/admin/login" className="inline-flex min-h-11 items-center font-medium text-[var(--color-link)] hover:text-[var(--color-link-hover)]">
            운영자 로그인
          </Link>
        </div>
      </footer>
    </>
  );
}
