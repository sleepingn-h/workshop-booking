"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, X } from "lucide-react";
import { useId, useState, type FormEvent, type JSX } from "react";
import { toast } from "sonner";

import { BookingStatusBadge, Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime } from "@/lib/format";
import { validateLookupInput } from "@/lib/rules";
import { ERROR_MESSAGE, type BookingLookupResult, type FieldErrors } from "@/lib/types";

type LookupInput = { code: string; phoneLast4: string };

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 aria-invalid:border-[var(--status-danger)] disabled:bg-[var(--surface-sunk)] md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const noticeClassName = "rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm text-[var(--text-body)]";
const errorClassName = "flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]";
const rowClassName = "grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-3 py-3 max-[641px]:grid-cols-[80px_minmax(0,1fr)]";

export function BookingLookup({ initialCode = "" }: { initialCode?: string }): JSX.Element {
  const prefix = useId();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(initialCode);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [submitted, setSubmitted] = useState<LookupInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof LookupInput>>({});
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery({
    queryKey: ["booking", submitted?.code ?? "", submitted?.phoneLast4 ?? ""],
    queryFn: () => apiFetch<BookingLookupResult>("/api/bookings/lookup", {
      method: "POST",
      json: submitted,
    }),
    enabled: submitted !== null,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const mutation = useMutation({
    mutationFn: (input: LookupInput) => apiFetch<BookingLookupResult>(`/api/bookings/${encodeURIComponent(input.code)}/cancel`, {
      method: "POST",
      json: { phoneLast4: input.phoneLast4 },
    }),
    onSuccess: async (_result, input) => {
      setDialogOpen(false);
      toast.success("예약이 취소되었습니다");
      await queryClient.invalidateQueries({ queryKey: ["booking", input.code, input.phoneLast4] });
    },
  });

  const busy = query.isFetching || mutation.isPending;
  const booking = query.isSuccess ? query.data : undefined;
  const notFound = query.error instanceof ApiError && query.error.code === "BOOKING_NOT_FOUND";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validateLookupInput({ code, phoneLast4 });
    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    mutation.reset();
    if (submitted?.code === result.value.code && submitted.phoneLast4 === result.value.phoneLast4) {
      void query.refetch();
    } else {
      setSubmitted(result.value);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="예약 조회"
        aria-busy={busy}
        className="flex min-w-0 flex-col gap-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)]"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-code`} className="text-sm font-semibold text-[var(--text-strong)]">예약번호</Label>
          <Input
            id={`${prefix}-code`}
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            aria-invalid={Boolean(fieldErrors.code)}
            aria-describedby={fieldErrors.code ? `${prefix}-code-error` : undefined}
            className={inputClassName}
          />
          {fieldErrors.code && <p id={`${prefix}-code-error`} className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.code}</p>}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${prefix}-phone`} className="text-sm font-semibold text-[var(--text-strong)]">전화번호 뒷자리 4자리</Label>
          <Input
            id={`${prefix}-phone`}
            name="phoneLast4"
            type="text"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            value={phoneLast4}
            onChange={(event) => setPhoneLast4(event.target.value)}
            disabled={busy}
            aria-invalid={Boolean(fieldErrors.phoneLast4)}
            aria-describedby={fieldErrors.phoneLast4 ? `${prefix}-phone-error` : undefined}
            className={inputClassName}
          />
          {fieldErrors.phoneLast4 && <p id={`${prefix}-phone-error`} className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.phoneLast4}</p>}
        </div>

        <Button
          type="submit"
          disabled={busy}
          className={`${buttonClassName} w-full bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`}
        >
          {query.isFetching ? "조회 중…" : "조회하기"}
        </Button>
        <p className="text-sm text-[var(--text-muted)]">예약번호를 분실하셨나요? 공방에 예약자 이름과 전체 전화번호로 문의해 주세요.</p>
      </form>

      {query.isFetching && <p role="status" className={noticeClassName}>예약을 조회하고 있습니다…</p>}

      {query.isError && (
        <div className="space-y-3">
          <div role="alert" className={errorClassName}>
            <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
            <p className="min-w-0 [overflow-wrap:anywhere]">
              {notFound
                ? "예약번호 또는 전화번호 뒷자리를 다시 확인해 주세요"
                : query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}
            </p>
          </div>
          {!notFound && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void query.refetch()} className={ghostClassName}>재시도</Button>
          )}
        </div>
      )}

      {booking && (
        <section aria-labelledby={`${prefix}-result`} className="min-w-0 space-y-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`${prefix}-result`} className="font-heading text-2xl font-bold">예약 상세</h2>
            <BookingStatusBadge status={booking.status} />
          </div>

          <dl className="divide-y divide-[var(--border-subtle)] text-[15px]">
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">예약번호</dt>
              <dd className="min-w-0 font-heading font-extrabold tracking-[.06em] tabular-nums [overflow-wrap:anywhere]">{booking.code}</dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">클래스</dt>
              <dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{booking.class.title}</dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">회차 시작</dt>
              <dd className="min-w-0 space-y-2">
                <p>{formatKstDateTime(booking.session.startsAt)}</p>
                {booking.session.status === "cancelled" && <Tag tone="danger">취소된 회차</Tag>}
              </dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">인원</dt>
              <dd>{booking.headcount}명</dd>
            </div>
          </dl>
          <p className="text-sm text-[var(--text-muted)]">모든 일정과 취소 기한은 한국 시각 기준입니다.</p>

          <div className="space-y-3">
            <h3 className="font-heading text-xl font-bold">클래스 안내·문의처</h3>
            <p className="whitespace-pre-line [overflow-wrap:anywhere]">{booking.class.description}</p>
          </div>

          {booking.status === "pending" && (
            <div className={`${noticeClassName} space-y-2`}>
              <p>승인 대기는 참여 확정이 아닙니다</p>
              {/* pending의 취소 불가는 서버가 요청 시각이 시작 시각 이상임을 판정한 결과다. */}
              {!booking.canCancel && <p className="font-semibold">참여 미확정 — 공방에 문의해 주세요</p>}
            </div>
          )}

          {booking.cancelDeadline && (
            <div className={`${noticeClassName} space-y-2`}>
              <p>직접 취소 기한: {formatKstDateTime(booking.cancelDeadline)}</p>
              <p>{booking.status === "pending"
                ? "회차 시작 시각 전까지 직접 취소할 수 있습니다."
                : "참여 확정은 시작 24시간 전까지 직접 취소할 수 있습니다. 정확히 24시간 전도 포함합니다."}</p>
            </div>
          )}

          {booking.canCancel ? (
            <p className="text-sm text-[var(--text-muted)]">직접 취소 가능합니다. 취소하면 기존 자리는 보장되지 않습니다.</p>
          ) : (booking.status === "pending" || booking.status === "confirmed") ? (
            <p className={noticeClassName}>직접 취소할 수 있는 기한이 지났습니다. 공방에 문의해 주세요. 문의만으로 취소가 완료되지는 않습니다.</p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="ghost" onClick={() => void query.refetch()} disabled={busy} className={ghostClassName}>다시 조회</Button>
            {booking.canCancel && (
              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  if (mutation.isPending) return;
                  if (open) mutation.reset();
                  setDialogOpen(open);
                }}
              >
                <DialogTrigger render={<Button type="button" variant="ghost" disabled={busy} className={ghostClassName} />}>예약 취소</DialogTrigger>
                <DialogPortal>
                  <DialogOverlay className="bg-[var(--overlay-scrim)] supports-backdrop-filter:backdrop-blur-none data-open:animate-none data-closed:animate-none" />
                  <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-[var(--radius-dialog)] bg-[var(--surface-card)] p-10 text-[var(--text-body)] shadow-[var(--shadow-raised)] outline-none max-[641px]:p-6">
                    <DialogTitle className="pr-8 font-heading text-[28px] leading-[1.2] font-extrabold max-[641px]:text-2xl">예약을 취소할까요?</DialogTitle>
                    <DialogDescription className="text-base text-[var(--text-body)]">취소한 예약은 되돌릴 수 없습니다. 다시 신청할 때 기존 자리가 보장되지 않습니다.</DialogDescription>
                    {mutation.isError && (
                      <div role="alert" className={errorClassName}>
                        <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
                        <p className="min-w-0 [overflow-wrap:anywhere]">{mutation.error instanceof ApiError ? mutation.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap justify-end gap-3" aria-busy={mutation.isPending}>
                      <DialogClose render={<Button type="button" variant="ghost" disabled={mutation.isPending} className={ghostClassName} />}>돌아가기</DialogClose>
                      <Button
                        type="button"
                        disabled={mutation.isPending}
                        onClick={() => { if (submitted && !mutation.isPending) mutation.mutate(submitted); }}
                        className={`${buttonClassName} bg-[var(--surface-ink)] text-[var(--text-on-ink)] hover:bg-[var(--surface-ink-raised)]`}
                      >
                        {mutation.isPending ? "취소 중…" : "예약 취소"}
                      </Button>
                    </div>
                    <DialogClose
                      aria-label="닫기"
                      disabled={mutation.isPending}
                      render={<Button type="button" variant="ghost" className="absolute top-2 right-2 size-11 text-[var(--text-strong)] hover:bg-[var(--surface-raised)]" />}
                    >
                      <X aria-hidden="true" className="size-5" />
                    </DialogClose>
                  </DialogPrimitive.Popup>
                </DialogPortal>
              </Dialog>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
