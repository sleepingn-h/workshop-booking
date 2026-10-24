"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleAlert, Pencil, Phone, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type JSX } from "react";
import { toast } from "sonner";

import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime, formatPhone, formatStartsIn, isoToKstInput, kstInputToIso } from "@/lib/format";
import { canChangeCapacity, canChangeStartsAt, canDeleteSession, validateSessionInput, validateSessionPatch } from "@/lib/rules";
import { BOOKING_STATUS_LABEL, ERROR_MESSAGE, type AdminBookingList, type AdminClassDetail, type AdminSession, type FieldErrors } from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-strong)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 disabled:bg-[var(--surface-sunk)] md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const primaryClassName = `${buttonClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`;
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const smallClassName = "h-auto min-h-9 gap-2 rounded-[var(--radius-button-sm)] px-4 py-2 text-sm font-medium whitespace-nowrap transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100 max-[641px]:min-h-11 [&_svg]:size-4";
const smallGhostClassName = `${smallClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
// 행 배치는 화면 폭이 아니라 회차 카드 폭(@container)을 따른다. 동작 열 폭을 고정해 버튼이 없는 행도 칸이 맞는다.
const gridClassName = "grid min-w-0 grid-cols-[minmax(0,1fr)_120px_110px_232px] items-center gap-4 border-t border-[var(--border-subtle)] py-4 @max-[620px]:grid-cols-[minmax(0,1fr)_110px] @max-[620px]:gap-x-3 @max-[620px]:gap-y-2.5";
const fieldsClassName = "grid min-w-0 grid-cols-[minmax(0,1fr)_140px_auto] items-start gap-3 @max-[620px]:grid-cols-1";
// 공개가 막힌 클래스(R-59)를 회차 추가로 안내할 때 쓰는 주소 조각(#add-session)이자 추가 폼 id다.
export const ADD_SESSION_ID = "add-session";
type Fields = { startsAt: string; capacity: string };
type SessionPatch = { startsAt?: string; capacity?: number };
type Change = { type: "save"; patch: SessionPatch } | { type: "delete" } | { type: "cancel"; activeCount: number };

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_MESSAGE.INTERNAL_ERROR;
}

// 회차 추가의 첫 입력(시작 일시)으로 스크롤하고 포커스한다. 추가 폼이 아직 없으면 false다.
export function focusAddSession(): boolean {
  const input = document.getElementById(ADD_SESSION_ID)?.querySelector("input");
  if (!input) return false;
  input.scrollIntoView?.({ behavior: "smooth", block: "center" });
  input.focus({ preventScroll: true });
  return true;
}

function ErrorNotice({ error }: { error: unknown }): JSX.Element {
  return <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]"><CircleAlert aria-hidden="true" className="size-5 shrink-0" /><p className="min-w-0 [overflow-wrap:anywhere]">{messageFor(error)}</p></div>;
}

function SessionFields({ fields, onChange, errors, disabled, timeLocked = false, capacityHint }: {
  fields: Fields; onChange: (fields: Fields) => void; errors: FieldErrors<keyof Fields>; disabled: boolean; timeLocked?: boolean; capacityHint?: string;
}): JSX.Element {
  const prefix = useId();
  return (
    <>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-startsAt`} className="text-sm font-semibold text-[var(--text-strong)]">시작 일시</Label>
        <Input id={`${prefix}-startsAt`} type="datetime-local" value={fields.startsAt} disabled={disabled || timeLocked} onChange={(event) => onChange({ ...fields, startsAt: event.target.value })} aria-invalid={Boolean(errors.startsAt)} aria-describedby={`${timeLocked ? `${prefix}-time-locked ` : ""}${errors.startsAt ? `${prefix}-startsAt-error` : ""}`.trim() || undefined} className={inputClassName} />
        {timeLocked && <p id={`${prefix}-time-locked`} className="text-[13px] text-[var(--text-muted)]">예약 이력이 있어 시각은 바꿀 수 없어요</p>}
        {errors.startsAt && <p id={`${prefix}-startsAt-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{errors.startsAt}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-capacity`} className="text-sm font-semibold text-[var(--text-strong)]">정원</Label>
        <Input id={`${prefix}-capacity`} inputMode="numeric" value={fields.capacity} disabled={disabled} onChange={(event) => onChange({ ...fields, capacity: event.target.value })} aria-invalid={Boolean(errors.capacity)} aria-describedby={`${capacityHint ? `${prefix}-capacity-hint ` : ""}${errors.capacity ? `${prefix}-capacity-error` : ""}`.trim() || undefined} className={inputClassName} />
        {capacityHint && <p id={`${prefix}-capacity-hint`} className="text-[13px] text-[var(--text-muted)]">{capacityHint}</p>}
        {errors.capacity && <p id={`${prefix}-capacity-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{errors.capacity}</p>}
      </div>
    </>
  );
}

function AddSessionForm({ classId }: { classId: string }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Fields>({ startsAt: "", capacity: "6" });
  const [errors, setErrors] = useState<FieldErrors<keyof Fields>>({});
  const mutation = useMutation({
    mutationFn: (input: { startsAt: string; capacity: number }) => apiFetch(`/api/admin/classes/${encodeURIComponent(classId)}/sessions`, { method: "POST", json: input }),
    onSuccess: async () => {
      toast.success("회차를 추가했어요");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      setFields({ startsAt: "", capacity: "6" });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      toast.error(messageFor(error));
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.reset();
    const input = { startsAt: kstInputToIso(fields.startsAt), capacity: Number(fields.capacity) };
    const validated = validateSessionInput(input, new Date());
    if (!validated.ok) { setErrors(validated.fieldErrors); return; }
    setErrors({});
    mutation.mutate(input);
  }

  return (
    <form id={ADD_SESSION_ID} aria-label="회차 추가" aria-busy={mutation.isPending} onSubmit={submit} noValidate className="min-w-0 scroll-mt-[92px] space-y-3">
      {/* 카드가 좁으면 [시작 일시|정원] 아래 줄에 추가 버튼을 꽉 채운다. 버튼은 라벨 높이만큼 내려 입력칸과 맞춘다. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_140px_auto] items-start gap-3 @max-[620px]:grid-cols-[minmax(0,1fr)_110px]">
        <SessionFields fields={fields} onChange={(value) => { setFields(value); setErrors({}); }} errors={errors} disabled={mutation.isPending} />
        <Button type="submit" disabled={mutation.isPending} className={`${primaryClassName} mt-[26px] min-h-[52px] @max-[620px]:col-span-full @max-[620px]:mt-0`}>{!mutation.isPending && <Plus aria-hidden="true" className="size-[18px]" />}{mutation.isPending ? "추가 중…" : "회차 추가"}</Button>
      </div>
      {mutation.isError && <ErrorNotice error={mutation.error} />}
    </form>
  );
}

function SessionRow({ session, now }: { session: AdminSession; now: Date }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<Fields>({ startsAt: "", capacity: "" });
  const [errors, setErrors] = useState<FieldErrors<keyof Fields>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<"delete" | "cancel">("cancel");
  const scheduled = session.status === "scheduled";
  const started = new Date(session.startsAt) <= now;
  const actionable = scheduled && !started;
  const hasHistory = session.bookingCount > 0;
  const startsAt = formatKstDateTime(session.startsAt);
  const filters = { sessionId: session.id, status: "", q: "" };
  // 전체 이력 수·점유 인원과 다른 활성 예약 목록은 기존 예약 API에서 확인한다.
  const activeQuery = useQuery({
    queryKey: ["admin", "bookings", filters],
    queryFn: () => apiFetch<AdminBookingList>(`/api/admin/bookings?${new URLSearchParams({ sessionId: session.id })}`),
    enabled: dialogOpen && dialogAction === "cancel",
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (activeQuery.error instanceof ApiError && activeQuery.error.status === 401) router.replace("/admin/login");
  }, [activeQuery.error, router]);
  const active = activeQuery.data?.bookings.filter((booking) => booking.status === "pending" || booking.status === "confirmed");
  const activeReady = activeQuery.isSuccess && !activeQuery.isFetching && active !== undefined;
  const mutation = useMutation({
    mutationFn: (change: Change) => {
      const path = `/api/admin/sessions/${encodeURIComponent(session.id)}`;
      if (change.type === "save") return apiFetch(path, { method: "PATCH", json: change.patch });
      if (change.type === "delete") return apiFetch(path, { method: "DELETE" });
      return apiFetch(`${path}/cancel`, { method: "POST" });
    },
    onSuccess: async (_result, change) => {
      setDialogOpen(false);
      setEditing(false);
      if (change.type === "cancel") toast.success("회차를 취소했어요", { description: `활성 예약 ${change.activeCount}건도 함께 취소됐어요.` });
      else toast.success(change.type === "save" ? "회차를 수정했어요" : "회차를 삭제했어요");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error, change) => {
      if (change.type === "save" && error instanceof ApiError && error.fields) setErrors(error.fields);
      toast.error(messageFor(error));
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || !actionable) return;
    mutation.reset();
    const patch: SessionPatch = {};
    if (fields.startsAt !== isoToKstInput(session.startsAt)) patch.startsAt = kstInputToIso(fields.startsAt);
    if (Number(fields.capacity) !== session.capacity) patch.capacity = Number(fields.capacity);
    if (Object.keys(patch).length === 0) { setEditing(false); return; }
    const requestTime = new Date();
    const validated = validateSessionPatch(patch, requestTime);
    if (!validated.ok) { setErrors(validated.fieldErrors); return; }
    if (validated.value.capacity !== undefined) {
      const capacity = canChangeCapacity(validated.value.capacity, session.occupied);
      if (!capacity.ok) { setErrors({ capacity: ERROR_MESSAGE[capacity.code] }); return; }
    }
    if (validated.value.startsAt !== undefined) {
      const time = canChangeStartsAt(session.bookingCount, validated.value.startsAt, requestTime);
      if (!time.ok) { setErrors({ startsAt: ERROR_MESSAGE[time.code] }); return; }
    }
    setErrors({});
    mutation.mutate({ type: "save", patch });
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => { if (!mutation.isPending) setDialogOpen(open); }}>
      {editing && actionable ? (
        <div role="row" aria-busy={mutation.isPending} className="min-w-0 border-t border-[var(--border-subtle)] py-4">
          <div role="cell" className="min-w-0">
            <form aria-label="회차 수정" aria-busy={mutation.isPending} onSubmit={submit} noValidate className="min-w-0 space-y-3">
              <div className={fieldsClassName}>
                <SessionFields fields={fields} onChange={(value) => { setFields(value); setErrors({}); }} errors={errors} disabled={mutation.isPending} timeLocked={hasHistory} capacityHint={`최소 ${Math.max(1, session.occupied)}명`} />
                <div className="mt-[26px] flex justify-end gap-2 @max-[620px]:mt-0 @max-[620px]:[&>button]:flex-1">
                  <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => setEditing(false)} className={`${smallGhostClassName} min-h-[52px]`}>닫기</Button>
                  <Button type="submit" disabled={mutation.isPending} className={`${smallClassName} min-h-[52px] bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`}>{mutation.isPending ? "저장 중…" : "저장"}</Button>
                </div>
              </div>
              {mutation.isError && mutation.variables.type === "save" && <ErrorNotice error={mutation.error} />}
            </form>
          </div>
        </div>
      ) : (
        <div role="row" aria-busy={mutation.isPending} className={gridClassName}>
          <div role="cell" className="min-w-0 [overflow-wrap:anywhere]">
            {/* 지난·취소된 회차는 일시를 낮춰 처리할 회차와 구분한다. */}
            <p className={`font-heading leading-[1.3] font-bold ${actionable ? "text-[var(--text-strong)]" : "text-[var(--text-muted)]"} ${scheduled ? "" : "line-through"}`}>{startsAt}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {!scheduled ? <Tag tone="danger">취소된 회차</Tag> : started ? <Tag tone="neutral">지난 회차</Tag> : <span className="text-[13px] text-[var(--text-muted)]">{formatStartsIn(session.startsAt, now) ?? "예정"}</span>}
              {scheduled && session.pendingCount > 0 && <span className="text-[13px] font-semibold text-[var(--color-magenta-600)]">승인 대기 {session.pendingCount}건</span>}
            </div>
          </div>
          <div role="cell" className="min-w-0">
            <p className="text-sm tabular-nums"><b className="font-semibold text-[var(--text-strong)]">{session.occupied}</b> / {session.capacity}명</p>
            <div role="meter" aria-label="차지된 자리" aria-valuemin={0} aria-valuemax={session.capacity} aria-valuenow={session.occupied} aria-valuetext={`${session.occupied} / ${session.capacity}명`} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunk)]">
              <div className="h-full rounded-full bg-[var(--color-green-600)]" style={{ width: `${Math.min(100, session.occupied / session.capacity * 100)}%` }} />
            </div>
          </div>
          <div role="cell" className="min-w-0 text-sm text-[var(--text-muted)]">{!scheduled ? "—" : hasHistory ? "예약 이력 있음" : "예약 없음"}</div>
          <div role="cell" className="flex min-w-0 flex-wrap justify-end gap-2 @max-[620px]:col-span-full @max-[620px]:empty:hidden @max-[620px]:[&>button]:flex-1">
            {/* 이력이 있으면 시각 변경·삭제 대신 정원 수정·회차 취소를, 없으면 수정·삭제를 제시한다(R-41, R-44). */}
            {actionable && <>
              <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => {
                mutation.reset(); setErrors({}); setFields({ startsAt: isoToKstInput(session.startsAt), capacity: String(session.capacity) }); setEditing(true);
              }} className={smallGhostClassName}><Pencil aria-hidden="true" />{hasHistory ? "정원 수정" : "수정"}</Button>
              {canDeleteSession(session.bookingCount).ok
                ? <DialogTrigger onClick={() => { setDialogAction("delete"); mutation.reset(); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={smallGhostClassName} />}><Trash2 aria-hidden="true" />삭제</DialogTrigger>
                : <DialogTrigger onClick={() => { setDialogAction("cancel"); mutation.reset(); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={smallGhostClassName} />}><Ban aria-hidden="true" />회차 취소</DialogTrigger>}
            </>}
          </div>
        </div>
      )}
      <DialogPortal>
        <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
          <DialogTitle className="pr-12 font-heading text-[28px] leading-[1.15] font-extrabold max-[641px]:text-2xl">{dialogAction === "delete" ? "회차를 삭제할까요?" : "이 회차를 취소할까요?"}</DialogTitle>
          {dialogAction === "delete"
            ? <DialogDescription className="text-base text-[var(--text-body)]">{startsAt} 회차를 삭제해요. 되돌릴 수 없어요.</DialogDescription>
            : <>
              <DialogDescription className="text-base text-[var(--text-body)]">
                <b className="font-semibold text-[var(--text-strong)]">{startsAt}</b> 회차의 활성 예약{activeReady && <> <b className="font-semibold text-[var(--text-strong)]">{active.length}건 ({active.reduce((sum, booking) => sum + booking.headcount, 0)}명)</b></>}이 함께 취소돼요. 되돌릴 수 없어요.
              </DialogDescription>
              {activeQuery.isFetching && <p role="status" className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm">활성 예약을 확인하고 있어요…</p>}
              {activeQuery.isError && !activeQuery.isFetching && <><ErrorNotice error={activeQuery.error} /><Button type="button" variant="ghost" onClick={() => void activeQuery.refetch()} className={ghostClassName}>재시도</Button></>}
              {activeReady && active.length > 0 && <>
                <dl className="min-w-0 text-[15px] [overflow-wrap:anywhere]">
                  {active.map((booking) => <div key={booking.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-t border-[var(--border-subtle)] py-3 first:border-t-0 first:pt-0 max-[641px]:grid-cols-[80px_minmax(0,1fr)]"><dt className="text-[var(--text-muted)]">{BOOKING_STATUS_LABEL[booking.status]}</dt><dd className="text-[var(--text-strong)]">{booking.customerName} · {formatPhone(booking.phone)} · {booking.headcount}명</dd></div>)}
                </dl>
                <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm leading-[1.55] text-[var(--text-body)]">
                  <Phone aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--color-primary)]" />
                  <p className="min-w-0">자동 알림이 없어요. 위 예약자에게 직접 연락해 주세요.</p>
                </div>
              </>}
            </>}
          {mutation.isError && mutation.variables.type === dialogAction && <ErrorNotice error={mutation.error} />}
          <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
            <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
            <Button type="button" disabled={mutation.isPending || (dialogAction === "cancel" && !activeReady)} onClick={() => {
              if (mutation.isPending || !actionable) return;
              if (dialogAction === "delete") {
                if (canDeleteSession(session.bookingCount).ok) mutation.mutate({ type: "delete" });
              } else if (activeReady) {
                mutation.mutate({ type: "cancel", activeCount: active.length });
              }
            }} className={`${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}>{mutation.isPending ? "처리 중…" : dialogAction === "delete" ? "삭제하기" : "회차 취소하기"}</Button>
          </div>
          <DialogClose aria-label="닫기" disabled={mutation.isPending} render={<Button type="button" variant="ghost" className="absolute top-9 right-9 size-10 rounded-full bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)] max-[641px]:top-5 max-[641px]:right-5" />}><X aria-hidden="true" className="size-5" /></DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

export function AdminSessionList({ classId }: { classId: string }): JSX.Element {
  const router = useRouter();
  const query = useQuery({
    queryKey: ["admin", "class", classId],
    queryFn: () => apiFetch<AdminClassDetail>(`/api/admin/classes/${encodeURIComponent(classId)}`),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) router.replace("/admin/login");
  }, [query.error, router]);
  // 클래스 목록의 공개 차단 안내에서 왔으면(#add-session) 추가 폼이 그려진 뒤 한 번만 포커스한다.
  const hasData = Boolean(query.data);
  useEffect(() => {
    if (hasData && window.location.hash === `#${ADD_SESSION_ID}`) focusAddSession();
  }, [hasData]);
  const now = new Date();
  const sessions = query.data?.sessions.toSorted((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="@container flex min-w-0 flex-col gap-4 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-7 shadow-[var(--shadow-card)] max-[641px]:p-5">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="font-heading text-xl leading-[1.3] font-bold">회차</h2>
        <p className="min-w-0 text-sm text-[var(--text-muted)]">예약 이력이 있는 회차는 삭제·시각 변경 대신 취소해요.</p>
      </div>
      {query.isPending && <LoadingPlaceholder label="회차를 불러오고 있습니다" rows={3} />}
      {query.isError && <div className="space-y-3"><ErrorNotice error={query.error} /><Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className={ghostClassName}>재시도</Button></div>}
      {query.data && <>
        <AddSessionForm key={classId} classId={classId} />
        {sessions?.length === 0 ? <p className="border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--text-muted)]">등록된 회차가 없어요.</p> : <div role="table" aria-label="회차 목록" className="min-w-0">
          <div role="rowgroup" className="sr-only"><div role="row">{["시작 일시·상태", "차지된 자리 / 정원", "예약 이력", "동작"].map((label) => <div key={label} role="columnheader">{label}</div>)}</div></div>
          <div role="rowgroup">{sessions?.map((session) => <SessionRow key={session.id} session={session} now={now} />)}</div>
        </div>}
      </>}
    </section>
  );
}
