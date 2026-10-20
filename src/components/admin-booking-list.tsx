"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleAlert, Info, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type JSX, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { BookingStatusBadge, Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime, formatPhone } from "@/lib/format";
import { ERROR_MESSAGE, type AdminBooking, type AdminBookingList as BookingListData, type BookingStatus } from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-strong)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
// 행 동작은 sm 버튼이고, 카드로 바뀌는 900px 이하에서는 터치 높이 44px로 가로를 채운다.
const smallClassName = "h-auto min-h-9 min-w-0 rounded-[var(--radius-button-sm)] px-4 py-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100 max-[901px]:min-h-11 max-[901px]:flex-1";
const smallGhostClassName = `${smallClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const gridClassName = "grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)_56px_minmax(0,1.1fr)_104px_176px] items-center gap-4 px-5 py-4 max-[901px]:grid-cols-[minmax(0,1fr)_auto] max-[901px]:gap-x-3 max-[901px]:gap-y-2.5 max-[901px]:px-4 max-[901px]:py-[18px]";
const statusTabs: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "confirmed", label: "확정" },
  { value: "rejected", label: "거절" },
  { value: "cancelled", label: "취소" },
];
const restoredMessage = "자리가 복구됐어요. 고객에게는 직접 연락해 주세요.";
type Filters = { sessionId: string; status: string; q: string };
type DialogAction = "reject" | "cancel";

function bookingsPath(filters: Filters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) { if (value) params.set(key, value); }
  return `/api/admin/bookings${params.size ? `?${params}` : ""}`;
}

function BookingRow({ booking, now }: { booking: AdminBooking; now: Date }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogAction, setDialogAction] = useState<DialogAction>("reject");
  const [dialogOpen, setDialogOpen] = useState(false);
  const started = new Date(booking.sessionStartsAt) <= now;
  const off = started || booking.sessionStatus === "cancelled";
  const mutation = useMutation({
    mutationFn: (action: "confirm" | DialogAction) => apiFetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}/${action}`, { method: "POST" }),
    onSuccess: async (_result, action) => {
      setDialogOpen(false);
      if (action === "confirm") toast.success(`${booking.customerName}님 ${booking.headcount}명 확정했어요`);
      else toast.success(`${booking.customerName}님 ${action === "reject" ? "신청을 거절했어요" : "예약을 취소했어요"}`, { description: restoredMessage });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : ERROR_MESSAGE.INTERNAL_ERROR);
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });
  const done = booking.status === "rejected" || booking.status === "cancelled" ? "처리 완료" : booking.status === "confirmed" && started ? "진행 완료" : null;

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!mutation.isPending) setDialogOpen(open); }}>
      <div role="row" aria-busy={mutation.isPending} className={`${gridClassName} border-t border-[var(--border-subtle)] max-[901px]:rounded-[var(--radius-card)] max-[901px]:border-0 max-[901px]:bg-[var(--surface-card)] max-[901px]:shadow-[var(--shadow-card)] ${off ? "bg-[var(--surface-muted-row)]" : "bg-[var(--surface-card)]"}`}>
        <div role="cell" className="min-w-0 [overflow-wrap:anywhere] max-[901px]:col-start-1 max-[901px]:row-start-1">
          <p className="font-semibold text-[var(--text-strong)]">{booking.customerName}</p>
          <p className="text-sm text-[var(--text-muted)] tabular-nums">{formatPhone(booking.phone)}</p>
        </div>
        <div role="cell" className="min-w-0 [overflow-wrap:anywhere] max-[901px]:col-span-2">
          <p className="font-medium text-[var(--text-strong)]">{booking.classTitle}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-muted)]">{formatKstDateTime(booking.sessionStartsAt)}</span>
            {booking.sessionStatus === "cancelled" ? <Tag tone="danger">취소된 회차</Tag> : started && <Tag tone="neutral">지난 회차</Tag>}
          </div>
        </div>
        <div role="cell" className="text-[15px] font-semibold text-[var(--text-strong)]"><span className="sr-only">인원 </span>{booking.headcount}명</div>
        <div role="cell" className="min-w-0 font-heading text-[15px] font-extrabold tracking-[.06em] text-[var(--text-strong)] tabular-nums [overflow-wrap:anywhere] max-[901px]:text-right"><span className="sr-only">예약번호 </span>{booking.code}</div>
        <div role="cell" className="max-[901px]:col-start-2 max-[901px]:row-start-1 max-[901px]:justify-self-end"><BookingStatusBadge status={booking.status} /></div>
        <div role="cell" className="flex min-w-0 justify-end gap-2 max-[901px]:col-span-2">
          {booking.status === "pending" && <>
            <DialogTrigger onClick={() => { setDialogAction("reject"); mutation.reset(); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={smallGhostClassName} />}>거절</DialogTrigger>
            <Button type="button" disabled={mutation.isPending || started} title={started ? "시작한 회차는 승인할 수 없어요" : undefined} onClick={() => { if (!mutation.isPending) mutation.mutate("confirm"); }} className={`${smallClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`}>
              {mutation.isPending && mutation.variables === "confirm" ? "승인 중…" : "승인"}
            </Button>
          </>}
          {booking.status === "confirmed" && !started && <DialogTrigger onClick={() => { setDialogAction("cancel"); mutation.reset(); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={smallGhostClassName} />}>예약 취소</DialogTrigger>}
          {done && <span className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-button-sm)] bg-[var(--surface-sunk)] px-4 text-sm font-medium whitespace-nowrap text-[var(--text-control-disabled)] max-[901px]:min-h-11 max-[901px]:flex-1">{done}</span>}
        </div>
      </div>
      <DialogPortal>
        <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
          <DialogTitle className="pr-12 font-heading text-[28px] leading-[1.15] font-extrabold max-[641px]:text-2xl">{dialogAction === "reject" ? "이 신청을 거절할까요?" : "확정된 예약을 취소할까요?"}</DialogTitle>
          <dl className="min-w-0 text-[15px] [overflow-wrap:anywhere]">
            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 py-3 max-[641px]:grid-cols-[80px_minmax(0,1fr)]"><dt className="text-[var(--text-muted)]">예약자</dt><dd className="text-[var(--text-strong)]">{booking.customerName} · {formatPhone(booking.phone)}</dd></div>
            <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-t border-[var(--border-subtle)] py-3 max-[641px]:grid-cols-[80px_minmax(0,1fr)]"><dt className="text-[var(--text-muted)]">회차</dt><dd className="text-[var(--text-strong)]">{booking.classTitle}<br />{formatKstDateTime(booking.sessionStartsAt)} · {booking.headcount}명</dd></div>
          </dl>
          <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm leading-[1.55] text-[var(--text-body)]">
            <Info aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--color-primary)]" />
            <DialogDescription className="min-w-0">{booking.headcount}자리가 다시 열려요. 자동 알림이 없으니 고객에게 직접 연락해 주세요.</DialogDescription>
          </div>
          {mutation.isError && mutation.variables === dialogAction && (
            <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              <p className="min-w-0 [overflow-wrap:anywhere]">{mutation.error instanceof ApiError ? mutation.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
            <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
            <Button type="button" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) mutation.mutate(dialogAction); }} className={`${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}>
              {mutation.isPending ? "처리 중…" : dialogAction === "reject" ? "거절하기" : "예약 취소하기"}
            </Button>
          </div>
          <DialogClose aria-label="닫기" disabled={mutation.isPending} render={<Button type="button" variant="ghost" className="absolute top-9 right-9 size-10 rounded-full bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)] max-[641px]:top-5 max-[641px]:right-5" />}><X aria-hidden="true" className="size-5" /></DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export function AdminBookingList(): JSX.Element {
  const router = useRouter();
  const prefix = useId();
  const [filters, setFilters] = useState<Filters>({ sessionId: "", status: "", q: "" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BookingStatus | "all">("all");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // 상태는 탭 건수를 함께 보여주려고 화면에서 거르고, 서버에는 회차·검색만 보낸다.
  const query = useQuery({
    queryKey: ["admin", "bookings", filters],
    queryFn: () => apiFetch<BookingListData>(bookingsPath(filters)),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const pendingFilters = { sessionId: "", status: "pending", q: "" };
  const pendingQuery = useQuery({
    queryKey: ["admin", "bookings", pendingFilters],
    queryFn: () => apiFetch<BookingListData>(bookingsPath(pendingFilters)),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) router.replace("/admin/login");
  }, [query.error, router]);
  useEffect(() => {
    const q = search.trim();
    if (q === filters.q) return;
    const timer = setTimeout(() => setFilters((current) => ({ ...current, q })), 300);
    return () => clearTimeout(timer);
  }, [search, filters.q]);
  const now = new Date();
  // 승인 대기도 자리를 차지하므로 처리할 예약을 먼저 보여주고, 나머지는 서버의 회차 순서를 유지한다.
  const bookings = query.isSuccess && !query.isPlaceholderData
    ? query.data.bookings.toSorted((a, b) => Number(b.status === "pending") - Number(a.status === "pending"))
    : undefined;
  const counted = query.data?.bookings;
  const rows = bookings?.filter((booking) => status === "all" || booking.status === status);
  const selectedTab = statusTabs.findIndex((tab) => tab.value === status);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = search.trim();
    if (q === filters.q) void query.refetch();
    else setFilters({ ...filters, q });
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (selectedTab + step + statusTabs.length) % statusTabs.length;
    setStatus(statusTabs[next].value);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-[36px] leading-[1.15] font-extrabold tracking-[-.01em]">예약 관리</h1>
        <p className="text-[var(--text-muted)]">
          {pendingQuery.isSuccess && <>승인 대기 <b className="font-semibold text-[var(--color-magenta-600)]">{pendingQuery.data.bookings.length}건</b> · </>}
          시작 전 회차만 승인할 수 있어요
        </p>
      </div>
      <form role="search" onSubmit={handleSearch} aria-label="예약 필터·검색" className="grid min-w-0 grid-cols-[320px_minmax(0,1fr)] items-end gap-4 max-[901px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-session`} className="text-sm font-semibold text-[var(--text-strong)]">회차</Label>
          <div className="relative min-w-0">
            <select id={`${prefix}-session`} value={filters.sessionId} onChange={(event) => setFilters({ ...filters, sessionId: event.target.value })} className={`${inputClassName} cursor-pointer appearance-none truncate pr-11`}>
              <option value="">전체 회차</option>
              {query.data?.sessions.map((session) => <option key={session.id} value={session.id}>{session.classTitle} · {formatKstDateTime(session.startsAt)}{session.status === "cancelled" ? " (취소된 회차)" : new Date(session.startsAt) <= now ? " (지난 회차)" : ""}</option>)}
            </select>
            <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-search`} className="text-sm font-semibold text-[var(--text-strong)]">예약자 검색</Label>
          <div className="relative min-w-0">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input id={`${prefix}-search`} name="q" type="search" enterKeyHint="search" value={search} placeholder="이름 또는 전화번호" onChange={(event) => setSearch(event.target.value)} className={`${inputClassName} pl-12`} />
          </div>
        </div>
      </form>
      <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
        <div role="tablist" aria-label="예약 상태" onKeyDown={handleTabKey} className="inline-flex gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-raised)] p-1">
          {statusTabs.map((tab, index) => {
            const selected = tab.value === status;
            const count = counted?.filter((booking) => tab.value === "all" || booking.status === tab.value).length;
            return (
              <button key={tab.value} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${prefix}-tab-${tab.value}`} aria-selected={selected} aria-controls={`${prefix}-panel`} tabIndex={selected ? 0 : -1} onClick={() => setStatus(tab.value)}
                className={`min-h-10 rounded-[var(--radius-pill)] px-[18px] py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-120 max-[641px]:px-3 ${selected ? "bg-[var(--surface-card)] text-[var(--text-strong)] shadow-[var(--shadow-tab)]" : "text-[var(--text-muted)] hover:text-[var(--text-strong)]"}`}>
                {tab.label}{count !== undefined && <> {count}</>}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" id={`${prefix}-panel`} aria-labelledby={`${prefix}-tab-${status}`} className="min-w-0">
        {!bookings && query.isFetching && <LoadingPlaceholder label="예약 목록을 불러오고 있습니다…" rows={4} />}
        {query.isError && !query.isFetching && (
          <div className="space-y-3">
            <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              <p className="min-w-0 [overflow-wrap:anywhere]">예약 목록을 불러오지 못했어요. {query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
            </div>
            <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className={ghostClassName}>재시도</Button>
          </div>
        )}
        {rows?.length === 0 && <p className="rounded-[var(--radius-card)] bg-[var(--surface-card)] p-10 text-center text-[var(--text-muted)] shadow-[var(--shadow-card)]">조건에 맞는 예약이 없어요.</p>}
        {rows && rows.length > 0 && (
          <div role="table" aria-label="운영자 예약 목록" aria-busy={query.isFetching} className="min-w-0 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] max-[901px]:overflow-visible max-[901px]:rounded-none max-[901px]:bg-transparent max-[901px]:shadow-none">
            <div role="rowgroup" className="max-[901px]:sr-only">
              <div role="row" className={`${gridClassName} bg-[var(--surface-raised)] py-3 text-[13px] font-semibold text-[var(--text-muted)]`}>
                {["예약자", "클래스 · 회차", "인원", "예약번호", "상태"].map((label) => <div role="columnheader" key={label}>{label}</div>)}
                <div role="columnheader" className="text-right">처리</div>
              </div>
            </div>
            <div role="rowgroup" className="max-[901px]:grid max-[901px]:gap-3">
              {rows.map((booking) => <BookingRow key={booking.id} booking={booking} now={now} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
