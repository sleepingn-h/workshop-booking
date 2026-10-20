import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata: Metadata = { title: "운영자 로그인 | 공방 클래스 예약" };

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-[calc(100dvh-204px)] items-center justify-center max-[641px]:min-h-[calc(100dvh-156px)]">
      <div className="flex w-full min-w-0 max-w-[480px] flex-col gap-4">
        <section className="w-full min-w-0 space-y-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)] max-[641px]:p-6">
          <div className="space-y-2">
            <h1 className="font-heading text-[28px] leading-[1.2] font-extrabold max-[641px]:text-2xl">운영자 로그인</h1>
            <p className="text-sm text-[var(--text-muted)]">예약 확인과 클래스 관리는 운영자만 할 수 있어요. 비밀번호를 입력해 주세요.</p>
          </div>
          <AdminLoginForm />
        </section>
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] text-[var(--text-muted)] hover:text-[var(--text-strong)]">
          <ArrowLeft aria-hidden="true" className="size-[18px]" />
          고객 화면으로
        </Link>
      </div>
    </div>
  );
}
