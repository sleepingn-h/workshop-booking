"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Paintbrush, Pencil, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, type JSX } from "react";
import { toast } from "sonner";

import { ClassSummaryLine } from "@/components/class-facts";
import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { Tag } from "@/components/status-badge";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { ERROR_MESSAGE, type AdminClassSummary } from "@/lib/types";

function ClassRow({ workshop }: { workshop: AdminClassSummary }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const titleId = useId();
  const mutation = useMutation({
    mutationFn: (isPublished: boolean) => apiFetch(`/api/admin/classes/${encodeURIComponent(workshop.id)}`, { method: "PATCH", json: { isPublished } }),
    // 재조회가 끝날 때까지 처리 중으로 두어 스위치가 이전 상태로 잠깐 돌아가지 않게 한다.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] }),
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : ERROR_MESSAGE.INTERNAL_ERROR);
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });
  const isPublished = mutation.isPending ? mutation.variables : workshop.isPublished;

  return (
    <li aria-labelledby={titleId} className="grid min-w-0 grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-5 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-card)] max-[901px]:grid-cols-[88px_minmax(0,1fr)] max-[901px]:gap-3.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-image-placeholder)]">
        {workshop.imageUrl ? <Image src={workshop.imageUrl} alt={`${workshop.title} 대표 이미지`} fill sizes="112px" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[var(--color-blurple-700)]"><Paintbrush aria-hidden="true" className="size-7" /></div>}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 id={titleId} className="min-w-0 font-heading text-lg leading-[1.3] font-bold [overflow-wrap:anywhere]">{workshop.title}</h2>
          <Tag tone={workshop.isPublished ? "success" : "neutral"}>{workshop.isPublished ? "공개" : "비공개"}</Tag>
        </div>
        <ClassSummaryLine info={workshop} className="text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-body)]">
          <span>예정 회차 {workshop.upcomingSessionCount}개</span>
          {workshop.pendingCount > 0 && <> · <b className="font-semibold text-[var(--color-magenta-600)]">승인 대기 {workshop.pendingCount}건</b></>}
        </p>
      </div>
      <div className="flex items-center gap-4 max-[901px]:col-span-full max-[901px]:justify-between">
        <ToggleSwitch label="공개" checked={isPublished} disabled={mutation.isPending} describedBy={titleId} onCheckedChange={(checked) => { if (!mutation.isPending) mutation.mutate(checked); }} />
        <Link href={`/admin/classes/${encodeURIComponent(workshop.id)}`} aria-label={`${workshop.title} 편집`} className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-button-sm)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-strong)] transition-colors duration-120 hover:bg-[var(--surface-sunk)] max-[901px]:min-h-11">
          <Pencil aria-hidden="true" className="size-4" />편집
        </Link>
      </div>
    </li>
  );
}

export function AdminClassList(): JSX.Element {
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
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="font-heading text-[36px] leading-[1.15] font-extrabold tracking-[-.01em]">클래스 관리</h1>
          <p className="text-[var(--text-muted)]">새 클래스는 비공개로 만들어져요. 준비가 끝나면 공개로 바꾸세요.</p>
        </div>
        <Link href="/admin/classes/new" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-5 py-3 font-medium text-[var(--text-on-ink)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--color-primary-press)] active:scale-[.97]"><Plus aria-hidden="true" className="size-[18px]" />새 클래스</Link>
      </div>
      {query.isPending && <LoadingPlaceholder label="클래스 목록을 불러오고 있습니다…" rows={3} />}
      {query.isError && <div className="space-y-3">
        <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          <p className="min-w-0 [overflow-wrap:anywhere]">클래스 목록을 불러오지 못했어요. {query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
        </div>
        <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className="h-auto min-h-11 rounded-[var(--radius-card)] bg-[var(--surface-raised)] px-5 py-3 text-base text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]">재시도</Button>
      </div>}
      {query.isSuccess && (query.data.classes.length === 0
        ? <p className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm">등록된 클래스가 없어요.</p>
        : <ul aria-label="운영자 클래스 목록" className="flex min-w-0 flex-col gap-3">
          {query.data.classes.map((workshop) => <ClassRow key={workshop.id} workshop={workshop} />)}
        </ul>)}
    </div>
  );
}
