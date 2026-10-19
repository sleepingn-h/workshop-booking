"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
      <div className="mx-auto flex min-h-[68px] max-w-[1200px] items-center justify-between gap-x-6 px-8 max-[641px]:min-h-[60px] max-[641px]:flex-wrap max-[641px]:px-4">
        <Link href="/admin" prefetch={!isLogin} className="inline-flex min-h-[68px] shrink-0 items-center font-heading text-[22px] font-black tracking-[-.02em] max-[641px]:min-h-[60px] max-[641px]:text-[19px]">공방 예약 관리</Link>
        {!isLogin && (
          <div className="flex min-w-0 items-center gap-6 max-[641px]:w-full max-[641px]:justify-between max-[641px]:gap-2 max-[641px]:pb-3">
            <nav aria-label="운영자 메뉴" className="flex items-center gap-1">
              {[{ href: "/admin", label: "예약" }, { href: "/admin/classes", label: "클래스" }].map(({ href, label }) => {
                const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
                return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex h-11 items-center rounded-[var(--radius-pill)] px-3.5 text-[15px] transition-colors duration-120 ${active ? "bg-[var(--surface-ink-raised)] font-semibold" : "font-medium hover:bg-[var(--surface-ink-raised)]"}`}>{label}</Link>;
              })}
            </nav>
            <Button type="button" onClick={() => { if (!mutation.isPending) mutation.mutate(); }} disabled={mutation.isPending} className="h-11 rounded-[var(--radius-card)] bg-[var(--surface-ink)] px-5 text-base font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--surface-ink-raised)] active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100">
              {mutation.isPending ? "로그아웃 중…" : "로그아웃"}
            </Button>
          </div>
        )}
      </div>
      {!isLogin && mutation.isError && (
        <p role="alert" className="mx-auto max-w-[1200px] px-8 pb-3 text-sm text-[var(--status-danger)] max-[641px]:px-4">{mutation.error instanceof ApiError ? mutation.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
      )}
    </header>
  );
}
