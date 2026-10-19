import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata: Metadata = { title: "운영자 로그인 | 공방 클래스 예약" };

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[calc(100dvh-204px)] items-center justify-center max-[641px]:min-h-[calc(100dvh-156px)]">
      <section className="w-full min-w-0 max-w-[640px] space-y-8 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)] max-[641px]:p-6">
        <div className="space-y-3">
          <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">운영자 로그인</h1>
          <p className="text-[var(--text-muted)]">예약과 클래스 관리를 위해 비밀번호를 입력해 주세요.</p>
        </div>
        <AdminLoginForm />
      </section>
    </div>
  );
}
