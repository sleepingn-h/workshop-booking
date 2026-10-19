"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type JSX } from "react";
import { toast } from "sonner";

import { BookingStatusBadge, Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime } from "@/lib/format";
import { BOOKING_STATUS_LABEL, ERROR_MESSAGE, type AdminBooking, type AdminBookingList as BookingListData, type BookingAction } from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const primaryClassName = `${buttonClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`;
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const noticeClassName = "rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm text-[var(--text-body)]";
const gridClassName = "grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_56px_minmax(0,1fr)_104px_176px] items-center gap-4 px-5 py-4 max-[901px]:grid-cols-1 max-[901px]:gap-3";
const successMessages: Record<BookingAction, string> = { confirm: "예약을 승인했습니다", reject: "예약을 거절했습니다", cancel: "예약을 취소했습니다" };

function BookingRow({ booking, now }: { booking: AdminBooking; now: Date }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialogAction, setDialogAction] = useState<"reject" | "cancel">("reject");
  const [dialogOpen, setDialogOpen] = useState(false);
  const started = new Date(booking.sessionStartsAt) <= now;
  const mutation = useMutation({
    mutationFn: (action: BookingAction) => apiFetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}/${action}`, { method: "POST" }),
    onSuccess: async (_result, action) => {
      setDialogOpen(false);
      toast.success(successMessages[action]);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : ERROR_MESSAGE.INTERNAL_ERROR);
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });
  const active = booking.status === "pending" || booking.status === "confirmed";

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!mutation.isPending) setDialogOpen(open); }}>
      <div role="row" aria-busy={mutation.isPending} className={`${gridClassName} border-t border-[var(--border-subtle)] max-[901px]:rounded-[var(--radius-card)] max-[901px]:border-0 max-[901px]:shadow-[var(--shadow-card)] ${started || booking.sessionStatus === "cancelled" ? "bg-[var(--surface-muted-row)]" : "bg-[var(--surface-card)]"}`}>
        <div role="cell" className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
          <p className="font-semibold text-[var(--text-strong)]">{booking.customerName}</p>
          <p className="text-sm text-[var(--text-muted)]">{booking.phone}</p>
        </div>
        <div role="cell" className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
          <p className="font-semibold">{booking.classTitle}</p>
          <p className="text-sm text-[var(--text-muted)]">{formatKstDateTime(booking.sessionStartsAt)}</p>
          <div className="flex flex-wrap gap-2">
            {booking.sessionStatus === "cancelled" ? <Tag tone="danger">취소된 회차</Tag> : <Tag tone="neutral">예정</Tag>}
            {started && <Tag tone="neutral">지난 회차</Tag>}
          </div>
        </div>
        <div role="cell" className="text-[15px]"><span className="sr-only">인원 </span>{booking.headcount}명</div>
        <div role="cell" className="min-w-0 font-heading text-sm font-extrabold tracking-[.06em] tabular-nums [overflow-wrap:anywhere]"><span className="sr-only">예약번호 </span>{booking.code}</div>
        <div role="cell"><BookingStatusBadge status={booking.status} /></div>
        <div role="cell" className="min-w-0 space-y-2">
          {active && (
            <div className="grid grid-cols-2 gap-2 max-[901px]:flex">
              {booking.status === "pending" && <>
                <Button type="button" disabled={mutation.isPending || started} title={started ? "시작한 회차는 승인할 수 없어요" : undefined} onClick={() => { if (!mutation.isPending) mutation.mutate("confirm"); }} className={`${primaryClassName} col-span-2 px-3 py-2 text-sm max-[901px]:min-w-0 max-[901px]:flex-1`}>
                  {mutation.isPending && mutation.variables === "confirm" ? "승인 중…" : "승인"}
                </Button>
                <DialogTrigger onClick={() => setDialogAction("reject")} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={`${ghostClassName} px-3 py-2 text-sm max-[901px]:min-w-0 max-[901px]:flex-1`} />}>거절</DialogTrigger>
              </>}
              <DialogTrigger onClick={() => setDialogAction("cancel")} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={`${ghostClassName} px-3 py-2 text-sm max-[901px]:min-w-0 max-[901px]:flex-1`} />}>취소</DialogTrigger>
            </div>
          )}
          {booking.status === "pending" && started && <p className="text-xs text-[var(--text-muted)]">시작한 회차는 승인할 수 없어요</p>}
        </div>
      </div>
      <DialogPortal>
        <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
          <DialogTitle className="pr-8 font-heading text-[28px] leading-[1.2] font-extrabold max-[641px]:text-2xl">예약을 {dialogAction === "reject" ? "거절" : "취소"}할까요?</DialogTitle>
          <DialogDescription className="text-base text-[var(--text-body)] [overflow-wrap:anywhere]">{booking.customerName} · {booking.code}. {dialogAction === "reject" ? "거절한" : "취소한"} 예약은 되돌릴 수 없습니다.</DialogDescription>
          <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
            <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
            <Button type="button" disabled={mutation.isPending} onClick={() => { if (!mutation.isPending) mutation.mutate(dialogAction); }} className={`${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}>
              {mutation.isPending ? "처리 중…" : dialogAction === "reject" ? "거절하기" : "예약 취소"}
            </Button>
          </div>
          <DialogClose aria-label="닫기" disabled={mutation.isPending} render={<Button type="button" variant="ghost" className="absolute top-2 right-2 size-11 text-[var(--text-strong)] hover:bg-[var(--surface-raised)]" />}><X aria-hidden="true" className="size-5" /></DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export function AdminBookingList(): JSX.Element {
  const router = useRouter();
  const prefix = useId();
  const [filters, setFilters] = useState({ sessionId: "", status: "", q: "" });
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["admin", "bookings", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) { if (value) params.set(key, value); }
      return apiFetch<BookingListData>(`/api/admin/bookings${params.size ? `?${params}` : ""}`);
    },
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) router.replace("/admin/login");
  }, [query.error, router]);
  const now = new Date();
  const bookings = query.isSuccess && !query.isPlaceholderData ? query.data.bookings : undefined;

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = search.trim();
    if (q === filters.q) void query.refetch();
    else setFilters({ ...filters, q });
  }

  return (
    <div className="min-w-0 space-y-6">
      <form onSubmit={handleSearch} aria-label="예약 필터·검색" className="grid min-w-0 grid-cols-[minmax(0,1fr)_200px] items-end gap-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)] max-[641px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-session`} className="text-sm font-semibold text-[var(--text-strong)]">회차</Label>
          <select id={`${prefix}-session`} value={filters.sessionId} onChange={(event) => setFilters({ ...filters, sessionId: event.target.value })} className={inputClassName}>
            <option value="">전체 회차</option>
            {query.data?.sessions.map((session) => <option key={session.id} value={session.id}>{session.classTitle} · {formatKstDateTime(session.startsAt)}{session.status === "cancelled" ? " (취소)" : ""}</option>)}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-status`} className="text-sm font-semibold text-[var(--text-strong)]">예약 상태</Label>
          <select id={`${prefix}-status`} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClassName}>
            <option value="">전체 상태</option>
            {Object.entries(BOOKING_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="col-span-full flex min-w-0 items-end gap-3 max-[641px]:flex-col max-[641px]:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={`${prefix}-search`} className="text-sm font-semibold text-[var(--text-strong)]">이름 또는 전체 전화번호</Label>
            <Input id={`${prefix}-search`} name="q" value={search} onChange={(event) => setSearch(event.target.value)} className={inputClassName} />
          </div>
          <Button type="submit" className={`${primaryClassName} min-h-[52px]`}>검색</Button>
        </div>
      </form>
      <p className="text-sm text-[var(--text-muted)]">일정은 한국 시각 기준입니다. 승인 대기는 참여 확정이 아니며 자동 만료되지 않습니다. 시작 후 미처리 건은 거절 또는 취소로 정리해 주세요.</p>
      {query.isFetching && <p role="status" className={noticeClassName}>예약 목록을 불러오고 있습니다…</p>}
      {query.isError && (
        <div className="space-y-3">
          <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
            <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
            <p className="min-w-0 [overflow-wrap:anywhere]">{query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
          </div>
          <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className={ghostClassName}>재시도</Button>
        </div>
      )}
      {bookings?.length === 0 && <p className={noticeClassName}>조건에 맞는 예약이 없습니다.</p>}
      {bookings && bookings.length > 0 && (
        <div role="table" aria-label="운영자 예약 목록" className="min-w-0 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] max-[901px]:overflow-visible max-[901px]:rounded-none max-[901px]:bg-transparent max-[901px]:shadow-none">
          <div role="rowgroup" className="max-[901px]:sr-only">
            <div role="row" className={`${gridClassName} bg-[var(--surface-raised)] text-[13px] font-semibold text-[var(--text-muted)]`}>
              {["이름 / 전화번호", "클래스 / 회차", "인원", "예약번호", "상태", "동작"].map((label) => <div role="columnheader" key={label}>{label}</div>)}
            </div>
          </div>
          <div role="rowgroup" className="max-[901px]:grid max-[901px]:gap-3">
            {bookings.map((booking) => <BookingRow key={booking.id} booking={booking} now={now} />)}
          </div>
        </div>
      )}
    </div>
  );
}
