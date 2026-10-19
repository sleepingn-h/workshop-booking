"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type JSX } from "react";
import { toast } from "sonner";

import { Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime, isoToKstInput, kstInputToIso } from "@/lib/format";
import { canChangeCapacity, canChangeStartsAt, canDeleteSession, validateSessionInput, validateSessionPatch } from "@/lib/rules";
import { ERROR_MESSAGE, type AdminBookingList, type AdminClassDetail, type AdminSession, type FieldErrors } from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 disabled:bg-[var(--surface-sunk)] md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const primaryClassName = `${buttonClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`;
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const noticeClassName = "rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm text-[var(--text-body)]";
const gridClassName = "grid min-w-0 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_112px_minmax(0,1.2fr)] items-center gap-4 px-5 py-4 max-[901px]:grid-cols-1 max-[901px]:gap-3";
type Fields = { startsAt: string; capacity: string };
type SessionPatch = { startsAt?: string; capacity?: number };
type Change = { type: "save"; patch: SessionPatch } | { type: "delete" | "cancel" };

function messageFor(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_MESSAGE.INTERNAL_ERROR;
}

function ErrorNotice({ error }: { error: unknown }): JSX.Element {
  return <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]"><CircleAlert aria-hidden="true" className="size-5 shrink-0" /><p className="min-w-0 [overflow-wrap:anywhere]">{messageFor(error)}</p></div>;
}

function SessionFields({ fields, onChange, errors, disabled, timeLocked = false }: {
  fields: Fields; onChange: (fields: Fields) => void; errors: FieldErrors<keyof Fields>; disabled: boolean; timeLocked?: boolean;
}): JSX.Element {
  const prefix = useId();
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 max-[641px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-startsAt`} className="text-sm font-semibold text-[var(--text-strong)]">시작 시각 (한국 시각)</Label>
        <Input id={`${prefix}-startsAt`} type="datetime-local" value={fields.startsAt} disabled={disabled || timeLocked} onChange={(event) => onChange({ ...fields, startsAt: event.target.value })} aria-invalid={Boolean(errors.startsAt)} aria-describedby={`${timeLocked ? `${prefix}-time-locked ` : ""}${errors.startsAt ? `${prefix}-startsAt-error` : ""}`.trim() || undefined} className={inputClassName} />
        {timeLocked && <p id={`${prefix}-time-locked`} className="text-sm text-[var(--text-muted)]">예약 이력이 있는 회차는 시간을 바꿀 수 없어요. 회차를 취소하고 새로 만들어 주세요</p>}
        {errors.startsAt && <p id={`${prefix}-startsAt-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{errors.startsAt}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-capacity`} className="text-sm font-semibold text-[var(--text-strong)]">정원</Label>
        <Input id={`${prefix}-capacity`} type="number" min="1" step="1" inputMode="numeric" value={fields.capacity} disabled={disabled} onChange={(event) => onChange({ ...fields, capacity: event.target.value })} aria-invalid={Boolean(errors.capacity)} aria-describedby={errors.capacity ? `${prefix}-capacity-error` : undefined} className={inputClassName} />
        {errors.capacity && <p id={`${prefix}-capacity-error`} role="alert" className="text-[13px] font-medium text-[var(--status-danger)]">{errors.capacity}</p>}
      </div>
    </div>
  );
}

function AddSessionForm({ classId }: { classId: string }): JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<Fields>({ startsAt: "", capacity: "1" });
  const [errors, setErrors] = useState<FieldErrors<keyof Fields>>({});
  const mutation = useMutation({
    mutationFn: (input: { startsAt: string; capacity: number }) => apiFetch(`/api/admin/classes/${encodeURIComponent(classId)}/sessions`, { method: "POST", json: input }),
    onSuccess: async () => {
      toast.success("회차를 추가했습니다");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      setFields({ startsAt: "", capacity: "1" });
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
    <form aria-label="회차 추가" aria-busy={mutation.isPending} onSubmit={submit} noValidate className="min-w-0 space-y-5 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-8 shadow-[var(--shadow-card)] max-[641px]:p-6">
      <h3 className="font-heading text-xl font-bold">회차 추가</h3>
      <SessionFields fields={fields} onChange={(value) => { setFields(value); setErrors({}); }} errors={errors} disabled={mutation.isPending} />
      {mutation.isError && <ErrorNotice error={mutation.error} />}
      <Button type="submit" disabled={mutation.isPending} className={primaryClassName}>{mutation.isPending ? "추가 중…" : "회차 추가"}</Button>
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
  const filters = { sessionId: session.id, status: "", q: "" };
  // 전체 이력 수·점유 인원과 다른 활성 예약 건수는 기존 예약 API에서 확인한다.
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
  const activeCount = activeQuery.data?.bookings.filter((booking) => booking.status === "pending" || booking.status === "confirmed").length;
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
      toast.success(change.type === "save" ? "회차를 수정했습니다" : change.type === "delete" ? "회차를 삭제했습니다" : "회차를 취소했습니다");
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error, change) => {
      if (change.type === "save" && error instanceof ApiError && error.fields) setErrors(error.fields);
      toast.error(messageFor(error));
      if (error instanceof ApiError && error.status === 401) router.replace("/admin/login");
    },
  });
  const changedTime = fields.startsAt !== isoToKstInput(session.startsAt);
  const changedCapacity = Number(fields.capacity) !== session.capacity;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending || !scheduled) return;
    mutation.reset();
    const patch: SessionPatch = {};
    if (changedTime) patch.startsAt = kstInputToIso(fields.startsAt);
    if (changedCapacity) patch.capacity = Number(fields.capacity);
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
      <div role="row" aria-busy={mutation.isPending} className={`${gridClassName} border-t border-[var(--border-subtle)] max-[901px]:rounded-[var(--radius-card)] max-[901px]:border-0 max-[901px]:shadow-[var(--shadow-card)] ${started || !scheduled ? "bg-[var(--surface-muted-row)]" : "bg-[var(--surface-card)]"}`}>
        <div role="cell" className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
          <p className="font-semibold">{formatKstDateTime(session.startsAt)}</p>
          <Tag tone={scheduled ? "neutral" : "danger"}>{!scheduled ? "취소" : started ? "지난 회차" : "예정"}</Tag>
        </div>
        <div role="cell" className="min-w-0 space-y-2">
          <p className="text-sm tabular-nums">차지 {session.occupied} / 정원 {session.capacity}</p>
          <div role="meter" aria-label="차지된 자리" aria-valuemin={0} aria-valuemax={session.capacity} aria-valuenow={session.occupied} aria-valuetext={`차지 ${session.occupied} / 정원 ${session.capacity}`} className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunk)]">
            <div className="h-full bg-[var(--color-green-600)]" style={{ width: `${Math.min(100, session.occupied / session.capacity * 100)}%` }} />
          </div>
        </div>
        <div role="cell" className="text-sm tabular-nums">예약 이력 {session.bookingCount}건</div>
        <div role="cell" className="min-w-0 space-y-2">
          {scheduled && <>
            <div className="flex flex-wrap gap-2 [&>button]:flex-1">
              {!editing && <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => {
                mutation.reset(); setErrors({}); setFields({ startsAt: isoToKstInput(session.startsAt), capacity: String(session.capacity) }); setEditing(true);
              }} className={`${ghostClassName} px-3 py-2 text-sm`}>수정</Button>}
              <DialogTrigger onClick={() => { setDialogAction("cancel"); mutation.reset(); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={`${ghostClassName} px-3 py-2 text-sm`} />}>회차 취소</DialogTrigger>
              {canDeleteSession(session.bookingCount).ok && <DialogTrigger onClick={() => { setDialogAction("delete"); mutation.reset(); }} render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={`${ghostClassName} px-3 py-2 text-sm`} />}>삭제</DialogTrigger>}
            </div>
            {!canDeleteSession(session.bookingCount).ok && <p className="text-xs text-[var(--text-muted)]">예약 이력이 있는 회차는 삭제할 수 없어요. 회차를 취소해 주세요.</p>}
          </>}
        </div>
        {scheduled && editing && <div role="cell" className="col-span-full min-w-0 border-t border-[var(--border-subtle)] pt-4">
          <form aria-label="회차 수정" aria-busy={mutation.isPending} onSubmit={submit} noValidate className="min-w-0 space-y-4">
            <SessionFields fields={fields} onChange={(value) => { setFields(value); setErrors({}); }} errors={errors} disabled={mutation.isPending} timeLocked={session.bookingCount > 0} />
            {mutation.isError && mutation.variables.type === "save" && <ErrorNotice error={mutation.error} />}
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={() => setEditing(false)} className={ghostClassName}>돌아가기</Button>
              <Button type="submit" disabled={mutation.isPending || (!changedTime && !changedCapacity)} title={!changedTime && !changedCapacity ? "변경할 회차 정보를 입력해 주세요" : undefined} className={primaryClassName}>{mutation.isPending ? "저장 중…" : "저장"}</Button>
            </div>
          </form>
        </div>}
      </div>
      <DialogPortal>
        <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
          <DialogTitle className="pr-8 font-heading text-[28px] leading-[1.2] font-extrabold max-[641px]:text-2xl">회차를 {dialogAction === "delete" ? "삭제" : "취소"}할까요?</DialogTitle>
          <p className="text-sm text-[var(--text-muted)]">{formatKstDateTime(session.startsAt)} · 한국 시각</p>
          <DialogDescription className="text-base text-[var(--text-body)] [overflow-wrap:anywhere]">
            {dialogAction === "delete" ? "회차를 삭제하면 되돌릴 수 없습니다." : activeQuery.isSuccess && !activeQuery.isFetching ? `승인 대기·참여 확정 예약 ${activeCount}건이 함께 취소됩니다. 고객에게 직접 연락해 주세요` : "함께 취소할 예약 건수를 확인해 주세요."}
          </DialogDescription>
          {dialogAction === "cancel" && <>
            {activeQuery.isFetching && <p role="status" className={noticeClassName}>활성 예약을 확인하고 있습니다…</p>}
            {activeQuery.isError && <><ErrorNotice error={activeQuery.error} /><Button type="button" variant="ghost" onClick={() => void activeQuery.refetch()} disabled={activeQuery.isFetching} className={ghostClassName}>재시도</Button></>}
          </>}
          {mutation.isError && mutation.variables.type === dialogAction && <ErrorNotice error={mutation.error} />}
          <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
            <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
            <Button type="button" disabled={mutation.isPending || (dialogAction === "cancel" && (!activeQuery.isSuccess || activeQuery.isFetching))} onClick={() => {
              if (mutation.isPending || !scheduled) return;
              if (dialogAction === "delete" && !canDeleteSession(session.bookingCount).ok) return;
              if (dialogAction === "cancel" && (!activeQuery.isSuccess || activeQuery.isFetching)) return;
              mutation.mutate({ type: dialogAction });
            }} className={`${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}>{mutation.isPending ? "처리 중…" : dialogAction === "delete" ? "삭제하기" : "회차 취소하기"}</Button>
          </div>
          <DialogClose aria-label="닫기" disabled={mutation.isPending} render={<Button type="button" variant="ghost" className="absolute top-2 right-2 size-11 text-[var(--text-strong)] hover:bg-[var(--surface-raised)]" />}><X aria-hidden="true" className="size-5" /></DialogClose>
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
  const now = new Date();
  const sessions = query.data?.sessions.toSorted((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return (
    <div className="min-w-0 space-y-6">
      <p className="text-sm text-[var(--text-muted)]">일정과 시각 입력은 한국 시각(Asia/Seoul) 기준입니다. 예약 이력이 있는 회차의 일정 변경은 기존 회차 취소 후 새 회차 생성으로 진행해 주세요.</p>
      {query.isPending && <p role="status" className={noticeClassName}>회차를 불러오고 있습니다…</p>}
      {query.isError && <div className="space-y-3"><ErrorNotice error={query.error} /><Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching} className={ghostClassName}>재시도</Button></div>}
      {query.data && <>
        {sessions?.length === 0 ? <p className={noticeClassName}>아직 등록된 회차가 없습니다.</p> : <div role="table" aria-label="회차 목록" className="min-w-0 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] max-[901px]:overflow-visible max-[901px]:rounded-none max-[901px]:bg-transparent max-[901px]:shadow-none">
          <div role="rowgroup" className="max-[901px]:sr-only"><div role="row" className={`${gridClassName} bg-[var(--surface-raised)] text-[13px] font-semibold text-[var(--text-muted)]`}>{["시작 시각 / 상태", "정원", "예약 이력", "동작"].map((label) => <div key={label} role="columnheader">{label}</div>)}</div></div>
          <div role="rowgroup" className="max-[901px]:grid max-[901px]:gap-3">{sessions?.map((session) => <SessionRow key={session.id} session={session} now={now} />)}</div>
        </div>}
        <AddSessionForm key={classId} classId={classId} />
      </>}
    </div>
  );
}
