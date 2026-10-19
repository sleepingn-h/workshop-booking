"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CircleAlert, Paintbrush, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { ERROR_MESSAGE, type AdminClassSummary } from "@/lib/types";

export default function AdminClassesPage() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["admin", "classes"],
    queryFn: () => apiFetch<{ classes: AdminClassSummary[] }>("/api/admin/classes"),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) router.replace("/admin/login");
  }, [query.error, router]);

  return (
    <div className="min-w-0 space-y-10 max-[641px]:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-3">
          <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">클래스 관리</h1>
          <p className="text-[var(--text-muted)]">공개·비공개 클래스를 확인하고 안내와 이미지를 관리하세요.</p>
        </div>
        <Link href="/admin/classes/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-5 py-3 font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--color-primary-press)] active:scale-[.97]"><Plus aria-hidden="true" className="size-[18px]" />새 클래스</Link>
      </div>
      {query.isFetching && <p role="status" className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm">클래스 목록을 불러오고 있습니다…</p>}
      {query.isError && <div className="space-y-3">
        <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          <p className="min-w-0 [overflow-wrap:anywhere]">{query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className="h-auto min-h-11 rounded-[var(--radius-card)] bg-[var(--surface-raised)] px-5 py-3 text-base text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]">재시도</Button>
      </div>}
      {query.isSuccess && (query.data.classes.length === 0 ? <p className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5">등록된 클래스가 없습니다. 새 클래스를 만들어 주세요.</p> :
        <ul aria-label="운영자 클래스 목록" className="min-w-0 divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          {query.data.classes.map((workshop) => <li key={workshop.id} className="min-w-0">
            <Link href={`/admin/classes/${encodeURIComponent(workshop.id)}`} className="flex min-w-0 items-center gap-6 px-8 py-6 hover:bg-[var(--surface-raised)] max-[641px]:gap-4 max-[641px]:px-4">
              <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-image-placeholder)] max-[641px]:w-16">
                {workshop.imageUrl ? <Image src={workshop.imageUrl} alt={`${workshop.title} 대표 이미지`} fill sizes="112px" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[var(--color-blurple-600)]"><Paintbrush aria-hidden="true" className="size-6" /></div>}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <h2 className="font-heading text-xl leading-[1.3] font-bold [overflow-wrap:anywhere]">{workshop.title}</h2>
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]"><Tag tone={workshop.isPublished ? "success" : "neutral"}>{workshop.isPublished ? "공개" : "비공개"}</Tag><span>회차 {workshop.sessionCount}개</span></div>
              </div>
              <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-[var(--color-link)]" />
            </Link>
          </li>)}
        </ul>
      )}
    </div>
  );
}
