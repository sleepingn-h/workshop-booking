"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CircleAlert, RotateCw, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type JSX } from "react";
import { toast } from "sonner";

import { LoadingPlaceholder } from "@/components/loading-placeholder";
import { BookingStatusBadge, Tag } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDateTime, formatKstSchedule, formatPrice } from "@/lib/format";
import { validateLookupInput } from "@/lib/rules";
import { ERROR_MESSAGE, type BookingLookupResult, type FieldErrors } from "@/lib/types";

type LookupInput = { code: string; phoneLast4: string };

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 aria-invalid:border-[var(--status-danger)] disabled:bg-[var(--surface-sunk)] md:text-base";
const buttonClassName = "h-auto min-h-11 rounded-[var(--radius-card)] px-5 py-3 text-base font-medium whitespace-normal transition-[color,background-color,transform] duration-200 active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const ghostClassName = `${buttonClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`;
const softClassName = `${buttonClassName} bg-[var(--color-blurple-100)] text-[var(--color-blurple-600)] hover:bg-[var(--color-blurple-50)] hover:text-[var(--color-blurple-700)]`;
const noticeClassName = "rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm text-[var(--text-body)]";
const errorClassName = "flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]";
const rowClassName = "grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-4 py-3 max-[641px]:grid-cols-[80px_minmax(0,1fr)]";
const lostCodeMessage = "예약번호를 분실하셨나요? 공방에 예약자 이름과 전체 전화번호로 문의해 주세요.";

function statusMeaning(booking: BookingLookupResult): string {
  if (booking.status === "pending") return "승인 대기는 참여 확정이 아닙니다.";
  if (booking.status === "confirmed") return "참여가 확정되었습니다. 회차 시작 시각에 맞춰 방문해 주세요.";
  if (booking.status === "rejected") return "이번 신청은 확정되지 않았습니다. 다른 회차로 다시 신청해 주세요.";
  return booking.session.status === "cancelled"
    ? "공방 사정으로 회차가 취소되어 예약도 취소되었습니다."
    : "취소된 예약입니다. 다시 참여하려면 새로 신청해 주세요.";
}

function lookupQuery(input: LookupInput | null) {
  return queryOptions({
    queryKey: ["booking", input?.code ?? "", input?.phoneLast4 ?? ""],
    queryFn: () => apiFetch<BookingLookupResult>("/api/bookings/lookup", {
      method: "POST",
      json: input,
    }),
    retry: false,
  });
}

export function BookingLookup({ initialCode = "" }: { initialCode?: string }): JSX.Element {
  const prefix = useId();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(initialCode);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [submitted, setSubmitted] = useState<LookupInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof LookupInput>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const query = useQuery({
    ...lookupQuery(submitted),
    enabled: submitted !== null,
    refetchOnMount: false,
    retryOnMount: false,
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
  // 뒷자리는 주소에 없으므로 결과 주소여도 메모리에 조회 결과가 있을 때만 결과 화면을 보여준다.
  const resultView = searchParams.get("view") === "result" && query.data !== undefined;
  const booking = query.isSuccess ? query.data : undefined;
  const notFound = query.error instanceof ApiError && query.error.code === "BOOKING_NOT_FOUND";
  const active = booking?.status === "pending" || booking?.status === "confirmed";

  useEffect(() => {
    if (!resultView) return;
    window.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [resultView]);

  async function lookup(input: LookupInput) {
    setSubmitted(input);
    try {
      await queryClient.fetchQuery(lookupQuery(input));
    } catch {
      return; // 실패 사유는 useQuery 상태로 폼 화면에 표시한다.
    }
    const url = `?${new URLSearchParams({ code: input.code, view: "result" })}`;
    // 결과 주소를 새로 연 경우 기록을 추가하면 뒤로 가기가 같은 결과 화면에 머문다.
    if (searchParams.get("view") === "result") window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const result = validateLookupInput({ code, phoneLast4 });
    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      (result.fieldErrors.code ? codeRef : phoneRef).current?.focus();
      return;
    }

    setFieldErrors({});
    mutation.reset();
    void lookup(result.value);
  }

  function retry() {
    if (resultView) void query.refetch();
    else if (submitted) void lookup(submitted);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {resultView ? (
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] text-[var(--text-muted)] hover:text-[var(--text-strong)]">
          <ArrowLeft aria-hidden="true" className="size-[18px]" />
          클래스 목록
        </Link>
      ) : <>
        <div className="mb-4 space-y-4">
          <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">예약 조회</h1>
          <p className="text-lg leading-[1.55] max-[641px]:text-base">예약번호와 전화번호 뒷자리 4자리로 신청 결과를 확인하고, 기한 내에 예약을 취소할 수 있습니다.</p>
        </div>
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
              ref={codeRef}
              id={`${prefix}-code`}
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              placeholder="예: BK-AB12CD"
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
              ref={phoneRef}
              id={`${prefix}-phone`}
              name="phoneLast4"
              type="text"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={phoneLast4}
              placeholder="숫자 4자리"
              onChange={(event) => setPhoneLast4(event.target.value)}
              disabled={busy}
              aria-invalid={Boolean(fieldErrors.phoneLast4)}
              aria-describedby={fieldErrors.phoneLast4 ? `${prefix}-phone-error` : undefined}
              className={inputClassName}
            />
            {fieldErrors.phoneLast4 && <p id={`${prefix}-phone-error`} className="text-[13px] font-medium text-[var(--status-danger)]">{fieldErrors.phoneLast4}</p>}
          </div>
  
          {notFound && <>
            <div role="alert" className={errorClassName}>
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              <p className="min-w-0 [overflow-wrap:anywhere]">예약번호 또는 전화번호 뒷자리를 다시 확인해 주세요</p>
            </div>
            <p className="-mt-3 text-sm text-[var(--text-muted)]">{lostCodeMessage}</p>
          </>}
          <Button
            type="submit"
            disabled={busy}
            className={`${buttonClassName} w-full bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`}
          >
            {query.isFetching ? "조회 중…" : "조회하기"}
          </Button>
          {!notFound && <p className="text-sm text-[var(--text-muted)]">{lostCodeMessage}</p>}
        </form>
      </>}

      {/* 결과 화면의 다시 조회는 이전 결과를 유지한 채 버튼 문구로 진행을 알린다. */}
      {query.isFetching && !(resultView && booking) && <LoadingPlaceholder label="예약을 조회하고 있습니다…" rows={3} />}

      {query.isError && (resultView || !notFound) && !query.isFetching && (
        <div className="space-y-3">
          <div role="alert" className={errorClassName}>
            <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
            <p className="min-w-0 [overflow-wrap:anywhere]">
              예약을 불러오지 못했습니다. {query.error instanceof ApiError ? query.error.message : ERROR_MESSAGE.INTERNAL_ERROR}
            </p>
          </div>
          <Button type="button" variant="ghost" disabled={busy} onClick={retry} className={ghostClassName}>재시도</Button>
        </div>
      )}

      {resultView && booking && (
        <section aria-labelledby={`${prefix}-result`} className="min-w-0 space-y-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-7 shadow-[var(--shadow-card)] max-[641px]:p-6">
          {/* pending의 취소 불가는 서버가 요청 시각이 시작 시각 이상임을 판정한 결과다. */}
          {booking.status === "pending" && !booking.canCancel && (
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-magenta-100)] px-4 py-3.5 font-semibold text-[var(--color-magenta-600)]">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>참여 미확정 — 공방에 문의해 주세요</span>
            </p>
          )}
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col items-start gap-2.5">
              <BookingStatusBadge status={booking.status} />
              <h1 ref={titleRef} id={`${prefix}-result`} tabIndex={-1} className="font-heading text-[28px] leading-[1.2] font-bold outline-none [overflow-wrap:anywhere] max-[641px]:text-2xl">{booking.class.title}</h1>
            </div>
            {booking.class.id && (
              <Link href={`/classes/${booking.class.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-[var(--color-link)] hover:text-[var(--color-link-hover)]">
                클래스 상세 보기
                <ArrowRight aria-hidden="true" className="size-[18px]" />
              </Link>
            )}
          </div>

          <dl className="divide-y divide-[var(--border-subtle)] text-[15px]">
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">신청자</dt>
              <dd className="min-w-0 text-[var(--text-strong)] [overflow-wrap:anywhere]">{booking.customer.name} · {booking.customer.phone}</dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">일시</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-2 text-[var(--text-strong)]">
                {formatKstSchedule(booking.session.startsAt, booking.class.durationMinutes)}
                {booking.session.status === "cancelled" && <Tag tone="danger">취소된 회차</Tag>}
              </dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">장소</dt>
              <dd className="min-w-0 text-[var(--text-strong)] [overflow-wrap:anywhere]">{booking.class.place}</dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">인원</dt>
              {/* 예상 비용은 현재 1인 비용에 인원을 곱한 값이다(R-33). */}
              <dd className="text-[var(--text-strong)]">{booking.headcount}명 (예상 비용 {formatPrice(booking.class.price * booking.headcount)})</dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">결제 방법</dt>
              <dd className="min-w-0 text-[var(--text-strong)] [overflow-wrap:anywhere]">{booking.class.paymentMethod}</dd>
            </div>
            <div className={rowClassName}>
              <dt className="text-[var(--text-muted)]">문의처</dt>
              <dd className="min-w-0 text-[var(--text-strong)] [overflow-wrap:anywhere]"><ContactValue value={booking.class.contact} /></dd>
            </div>
          </dl>
          {/* 상태 안내는 첫 줄(취소 기한·기한 경과) 다음, 보조 안내 앞에 같은 글씨로 둔다. */}
          <div className={`${noticeClassName} space-y-2`}>
            {active && booking.canCancel && booking.cancelDeadline && (
              <p className="font-semibold text-[var(--color-blurple-600)]">직접 취소 기한 {formatKstDateTime(booking.cancelDeadline)}까지</p>
            )}
            {active && !booking.canCancel && <p>직접 취소할 수 있는 기한이 지났습니다. 공방에 문의해 주세요. 문의만으로 취소가 완료되지는 않습니다.</p>}
            <p className="text-[var(--text-muted)]">{statusMeaning(booking)}</p>
            {active && booking.canCancel && <p className="text-[var(--text-muted)]">{booking.status === "pending"
              ? "승인 대기는 회차 시작 시각 전까지 직접 취소할 수 있습니다."
              : "참여 확정은 시작 24시간 전까지 직접 취소할 수 있습니다. 정확히 24시간 전도 포함합니다."}</p>}
          </div>

          {/* 예약 취소·다른 회차 신청하기는 왼쪽, 다시 조회는 오른쪽 끝에 두어 잘못 누르지 않게 떨어뜨린다. */}
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-5">
            {!active && (
              <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] bg-[var(--color-primary)] px-5 py-3 font-medium text-[var(--text-on-ink)] transition-[background-color,transform] duration-200 hover:bg-[var(--color-primary-press)] active:scale-[.97]">
                다른 회차 신청하기
                <ArrowRight aria-hidden="true" className="size-[18px]" />
              </Link>
            )}
            {active && !booking.canCancel && <Button type="button" variant="ghost" disabled title="직접 취소할 수 있는 기한이 지났습니다" className={ghostClassName}><X aria-hidden="true" className="size-[18px]" />예약 취소</Button>}
            {active && booking.canCancel && (
              <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                  if (mutation.isPending) return;
                  if (open) mutation.reset();
                  setDialogOpen(open);
                }}
              >
                <DialogTrigger render={<Button type="button" variant="ghost" disabled={busy} className={ghostClassName} />}><X aria-hidden="true" className="size-[18px]" />예약 취소</DialogTrigger>
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
            <Button type="button" onClick={() => void query.refetch()} disabled={busy} className={`${softClassName} ml-auto gap-2`}>
              <RotateCw aria-hidden="true" className="size-[18px]" />
              {query.isFetching ? "조회 중…" : "다시 조회"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function ContactValue({ value }: { value: string }): JSX.Element {
  const phone = /0\d{1,2}-?\d{3,4}-?\d{4}/.exec(value);
  if (!phone) return <>{value}</>;
  return <>
    {value.slice(0, phone.index)}
    <a href={`tel:${phone[0].replace(/\D/g, "")}`} className="font-medium text-[var(--color-link)] hover:text-[var(--color-link-hover)]">{phone[0]}</a>
    {value.slice(phone.index + phone[0].length)}
  </>;
}
