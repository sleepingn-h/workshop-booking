"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { ERROR_MESSAGE } from "@/lib/types";

export function AdminHeader(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isLogin = pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  const leave = () => {
    queryClient.removeQueries({ queryKey: ["admin"] });
    router.replace("/admin/login");
  };
  const mutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/logout", { method: "POST" }),
    onSuccess: leave,
    onError: (error) => { if (error instanceof ApiError && error.status === 401) leave(); },
  });

  return (
    <header className="sticky inset-x-0 top-0 z-30 shrink-0 bg-[var(--surface-ink)] text-[var(--text-on-ink)]">
      <div className="mx-auto flex min-h-[68px] max-w-[1200px] flex-wrap items-center gap-x-5 px-8 max-[641px]:min-h-[60px] max-[641px]:gap-x-3 max-[641px]:px-4">
        <div className="flex min-h-[68px] shrink-0 items-center gap-2.5 max-[641px]:min-h-[60px]">
          <Link href="/admin" prefetch={!isLogin} className="inline-flex min-h-11 items-center font-heading text-[22px] font-black tracking-[-.02em] max-[641px]:text-[19px]">공방 클래스 예약</Link>
          <span className="rounded-[var(--radius-card)] bg-[var(--color-green)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-on-green)]">운영자</span>
        </div>
        {!isLogin && <>
          <nav aria-label="운영자 메뉴" className="flex items-center gap-1 max-[641px]:order-last max-[641px]:w-full max-[641px]:pb-2.5">
            {[{ href: "/admin", label: "예약 관리" }, { href: "/admin/classes", label: "클래스 관리" }].map(({ href, label }) => {
              const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex h-11 items-center rounded-[var(--radius-pill)] px-3.5 text-[15px] whitespace-nowrap transition-colors duration-120 hover:bg-[var(--surface-ink-raised)] hover:text-[var(--text-on-ink)] max-[641px]:px-3 max-[641px]:text-sm ${active ? "bg-[var(--surface-ink-raised)] font-semibold text-[var(--text-on-ink)]" : "font-medium text-[var(--text-control-disabled)]"}`}>{label}</Link>;
            })}
          </nav>
          <Button type="button" onClick={() => { if (!mutation.isPending) mutation.mutate(); }} disabled={mutation.isPending} className="ml-auto h-11 gap-2 rounded-[var(--radius-button-sm)] bg-[var(--surface-ink-raised)] px-4 text-sm font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:shadow-[inset_0_0_0_1px_var(--text-control-disabled)] active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100">
            <LogOut aria-hidden="true" className="size-4" />
            {mutation.isPending ? "로그아웃 중…" : "로그아웃"}
          </Button>
        </>}
      </div>
      {!isLogin && mutation.isError && (
        <p role="alert" className="mx-auto max-w-[1200px] px-8 pb-3 text-sm text-[var(--status-danger)] max-[641px]:px-4">{mutation.error instanceof ApiError ? mutation.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
      )}
    </header>
  );
}
