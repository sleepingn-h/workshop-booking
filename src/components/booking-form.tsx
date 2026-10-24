"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, Info, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDate, formatKstTime } from "@/lib/format";
import { MAX_HEADCOUNT, MIN_HEADCOUNT, validateBookingInput } from "@/lib/rules";
import {
  ERROR_MESSAGE,
  type BookingInput,
  type CreateBookingResult,
  type FieldErrors,
  type PublicSession,
} from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none transition-[border-color,box-shadow] duration-120 focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 aria-invalid:border-[var(--status-danger)] disabled:bg-[var(--surface-sunk)] md:text-base";
const labelClassName = "text-sm font-semibold text-[var(--text-strong)]";
const fieldErrorClassName = "text-[13px] font-medium text-[var(--status-danger)]";
const hintClassName = "text-[13px] font-medium text-[var(--text-muted)]";
const noticeClassName = "flex min-w-0 items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm leading-[1.55] text-[var(--text-body)]";
const stepperClassName = "size-11 shrink-0 rounded-full transition-[background-color,transform] duration-200 active:translate-y-0 active:scale-[.92] disabled:cursor-not-allowed disabled:bg-[var(--surface-raised)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100";
const seatErrorMessage = "남은 자리보다 많은 인원은 신청할 수 없습니다.";
const fieldOrder = ["sessionId", "headcount", "customerName", "phone"] as const;

// 상세는 예정 회차가 있는 클래스만 렌더링하므로(R-59) sessions는 비어 있지 않다.
export function BookingForm({
  classId,
  sessions,
}: {
  classId: string;
  sessions: PublicSession[];
}): JSX.Element {
  const router = useRouter();
  const uniqueId = useId();
  const prefix = `booking-${classId}-${uniqueId}`;
  const [sessionId, setSessionId] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<keyof BookingInput>>({});
  const sessionsRef = useRef<HTMLDivElement>(null);
  const decreaseRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  function focusField(field: keyof BookingInput) {
    if (field === "sessionId") {
      const radios = [...sessionsRef.current?.querySelectorAll<HTMLInputElement>("input[type=radio]:not(:disabled)") ?? []];
      (radios.find((radio) => radio.checked) ?? radios[0])?.focus();
    } else if (field === "headcount") {
      decreaseRef.current?.focus();
    } else {
      (field === "customerName" ? nameRef : phoneRef).current?.focus();
    }
  }

  // 오류를 그린 뒤(제출 중 비활성이 풀린 뒤) 첫 오류 칸으로 포커스를 옮긴다.
  const pendingFocus = useRef<keyof BookingInput | null>(null);
  function showErrors(errors: FieldErrors<keyof BookingInput>) {
    setFieldErrors(errors);
    pendingFocus.current = fieldOrder.find((field) => errors[field]) ?? null;
  }

  const mutation = useMutation({
    mutationFn: (input: BookingInput) => apiFetch<CreateBookingResult>("/api/bookings", {
      method: "POST",
      json: input,
    }),
    onSuccess: ({ code }) => {
      router.push(`/bookings/complete?code=${encodeURIComponent(code)}`);
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      showErrors(error.code === "INVALID_HEADCOUNT" && !error.fields
        ? { headcount: error.message }
        : error.fields ?? {});
      if (["SESSION_FULL", "SESSION_STARTED", "SESSION_CANCELLED", "NOT_FOUND"].includes(error.code)) {
        router.refresh();
      }
    },
  });

  useEffect(() => {
    if (!pendingFocus.current || mutation.isPending) return;
    focusField(pendingFocus.current);
    pendingFocus.current = null;
  });

  const selectedSession = sessions.find((session) => session.id === sessionId);
  // 갱신된 props에서 선택이 무효해지면 다른 입력은 유지하고 선택만 비운다.
  if (sessionId && (!selectedSession || selectedSession.remaining === 0)) {
    setSessionId("");
    setFieldErrors({
      ...fieldErrors,
      sessionId: "선택한 회차에 신청할 수 없습니다. 회차를 다시 선택해 주세요.",
    });
  }
  // 남은 자리보다 많은 인원은 제출 전에 그 자리에서 알린다.
  const headcountError = selectedSession && headcount > selectedSession.remaining
    ? seatErrorMessage
    : fieldErrors.headcount;
  const errorCode = mutation.error instanceof ApiError ? mutation.error.code : null;

  function validateField(field: "customerName" | "phone", value: string) {
    if (!value) return;
    const result = validateBookingInput({ sessionId, headcount, customerName, phone, [field]: value });
    setFieldErrors((errors) => ({ ...errors, [field]: result.ok ? undefined : result.fieldErrors[field] }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.reset();

    const result = validateBookingInput({ sessionId, headcount, customerName, phone });
    if (!result.ok) {
      showErrors(result.fieldErrors);
      return;
    }
    if (!selectedSession) {
      showErrors({ sessionId: "회차를 선택해 주세요." });
      return;
    }
    if (headcount > selectedSession.remaining) {
      showErrors({ headcount: seatErrorMessage });
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.value);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="예약 신청"
      aria-busy={mutation.isPending}
      className="flex min-w-0 flex-col gap-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-7 shadow-[var(--shadow-card)] max-[901px]:pb-32 max-[641px]:p-6 max-[641px]:pb-32 min-[901px]:sticky min-[901px]:top-[92px] min-[901px]:self-start"
    >
      <h2 className="font-heading text-xl font-bold text-[var(--text-strong)]">예약 신청</h2>

      {errorCode === "SESSION_FULL" && (
        <p role="status" className={noticeClassName}>남은 자리가 바뀌었습니다. 회차와 인원을 다시 확인해 주세요.</p>
      )}

      <fieldset
        role="radiogroup"
        aria-labelledby={`${prefix}-sessions-label`}
        aria-describedby={fieldErrors.sessionId ? `${prefix}-session-error` : undefined}
        aria-invalid={Boolean(fieldErrors.sessionId)}
        className="min-w-0"
      >
        <legend id={`${prefix}-sessions-label`} className={`${labelClassName} float-left mb-2`}>회차</legend>
        <div ref={sessionsRef} className="clear-both flex flex-col gap-2">
          {sessions.map((session) => (
            <label key={session.id} className="block min-w-0">
              <input
                type="radio"
                name={`${prefix}-session`}
                value={session.id}
                checked={sessionId === session.id}
                disabled={session.remaining === 0 || mutation.isPending}
                onChange={() => {
                  setSessionId(session.id);
                  setFieldErrors((errors) => ({ ...errors, sessionId: undefined, headcount: undefined }));
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-16 min-w-0 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border-2 border-[var(--border-input)] px-4 py-3 text-[var(--text-strong)] transition-[border-color,background-color,transform] duration-120 peer-enabled:hover:border-[var(--color-blurple-400)] active:scale-[.98] peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-blurple-50)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] peer-disabled:cursor-not-allowed peer-disabled:border-[var(--surface-raised)] peer-disabled:bg-[var(--surface-raised)] peer-disabled:text-[var(--text-control-disabled)]">
                <span className="min-w-0">
                  <span className="block font-heading text-base leading-[1.3] font-bold">{formatKstDate(session.startsAt)}</span>
                  <span className="mt-0.5 block text-sm text-[var(--text-muted)] peer-disabled:text-inherit">{formatKstTime(session.startsAt)}</span>
                </span>
                <span className={`shrink-0 text-sm font-semibold ${session.remaining === 0
                  ? "text-[var(--text-control-disabled)]"
                  : session.remaining <= 2
                    ? "text-[var(--color-magenta-600)]"
                    : "text-[var(--text-muted)]"}`}>
                  {session.remaining === 0 ? "마감" : `${session.remaining}자리 남음`}
                </span>
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.sessionId && <p id={`${prefix}-session-error`} className={`${fieldErrorClassName} mt-1.5`}>{fieldErrors.sessionId}</p>}
      </fieldset>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div
          role="group"
          aria-labelledby={`${prefix}-headcount-label`}
          aria-describedby={headcountError ? `${prefix}-headcount-error` : undefined}
          className="flex min-w-0 items-center justify-between gap-4"
        >
          <span id={`${prefix}-headcount-label`} className="text-base font-semibold text-[var(--text-strong)]">인원</span>
          <div className="flex items-center gap-3">
            <Button
              ref={decreaseRef}
              type="button"
              variant="ghost"
              aria-label="인원 줄이기"
              disabled={headcount <= MIN_HEADCOUNT || mutation.isPending}
              onClick={() => setHeadcount((count) => Math.max(MIN_HEADCOUNT, count - 1))}
              className={`${stepperClassName} bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-sunk)]`}
            >
              <Minus aria-hidden="true" className="size-5" />
            </Button>
            <output aria-live="polite" className="min-w-14 text-center font-heading text-[22px] leading-none font-extrabold text-[var(--text-strong)] tabular-nums">{headcount}명</output>
            <Button
              type="button"
              aria-label="인원 늘리기"
              disabled={headcount >= MAX_HEADCOUNT || mutation.isPending}
              onClick={() => setHeadcount((count) => Math.min(MAX_HEADCOUNT, count + 1))}
              className={`${stepperClassName} bg-[var(--color-primary)] text-[var(--text-on-ink)] hover:bg-[var(--color-primary-press)]`}
            >
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          </div>
        </div>
        {headcountError
          ? <p id={`${prefix}-headcount-error`} className={fieldErrorClassName}>{headcountError}</p>
          : <p className={hintClassName}>최대 {MAX_HEADCOUNT}명까지 신청 가능</p>}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-name`} className={labelClassName}>예약자 이름</Label>
        <Input
          ref={nameRef}
          id={`${prefix}-name`}
          name="customerName"
          autoComplete="name"
          value={customerName}
          onChange={(event) => {
            setCustomerName(event.target.value);
            setFieldErrors((errors) => ({ ...errors, customerName: undefined }));
          }}
          onBlur={(event) => validateField("customerName", event.target.value)}
          disabled={mutation.isPending}
          aria-invalid={Boolean(fieldErrors.customerName)}
          aria-describedby={fieldErrors.customerName ? `${prefix}-name-error` : undefined}
          className={inputClassName}
        />
        {fieldErrors.customerName && <p id={`${prefix}-name-error`} className={fieldErrorClassName}>{fieldErrors.customerName}</p>}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-phone`} className={labelClassName}>전화번호</Label>
        <Input
          ref={phoneRef}
          id={`${prefix}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-1234-5678"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            setFieldErrors((errors) => ({ ...errors, phone: undefined }));
          }}
          onBlur={(event) => validateField("phone", event.target.value)}
          disabled={mutation.isPending}
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={`${prefix}-phone-${fieldErrors.phone ? "error" : "hint"}`}
          className={inputClassName}
        />
        {fieldErrors.phone
          ? <p id={`${prefix}-phone-error`} className={fieldErrorClassName}>{fieldErrors.phone}</p>
          : <p id={`${prefix}-phone-hint`} className={hintClassName}>하이픈 없이 입력해도 됩니다. 결과 조회 때 뒷자리 4자리를 사용합니다.</p>}
      </div>

      {mutation.isError && (
        <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          <div className="min-w-0 space-y-1.5 break-words">
            <p>{mutation.error instanceof ApiError ? mutation.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
            {errorCode === "DUPLICATE_BOOKING" && (
              <Link href="/bookings/lookup" className="inline-flex min-h-11 items-center gap-1 font-semibold text-[var(--color-link)] underline-offset-4 hover:underline">
                예약 조회로 이동
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className={noticeClassName}>
          <Info aria-hidden="true" className="mt-0.5 size-[18px] shrink-0 text-[var(--color-magenta-600)]" />
          <div className="min-w-0 space-y-1 break-words">
            <p>운영자가 확인 후 승인합니다.</p>
            <p>신청 후에는 승인 대기 상태이며 참여 확정이 아닙니다.</p>
            <p>결과는 예약 조회에서 직접 확인해 주세요.</p>
            <p>취소 기한: 승인 대기는 시작 전까지, 참여 확정은 시작 24시간 전까지(정각 포함) 예약 조회에서 직접 취소할 수 있습니다.</p>
          </div>
        </div>
        <div className="max-[901px]:fixed max-[901px]:inset-x-0 max-[901px]:bottom-0 max-[901px]:z-20 max-[901px]:border-t max-[901px]:border-[var(--border-subtle)] max-[901px]:bg-[var(--surface-card)] max-[901px]:px-4 max-[901px]:pt-3 max-[901px]:pb-[max(20px,env(safe-area-inset-bottom))]">
          <Button
            type="submit"
            size="lg"
            disabled={mutation.isPending}
            className="h-14 w-full rounded-[var(--radius-control)] bg-[var(--color-green)] px-6 text-lg font-medium text-[var(--text-on-green)] transition-[color,background-color,transform] duration-200 hover:bg-[var(--color-green-hover)] active:translate-y-0 active:scale-[.97] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunk)] disabled:text-[var(--text-control-disabled)] disabled:opacity-100"
          >
            {mutation.isPending ? "신청 중…" : "예약 신청하기"}
          </Button>
        </div>
      </div>
    </form>
  );
}
