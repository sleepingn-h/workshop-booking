"use client";

import { useMutation } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type JSX } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiFetch } from "@/lib/api";
import { formatKstDate, formatKstTime } from "@/lib/format";
import { MAX_HEADCOUNT, validateBookingInput } from "@/lib/rules";
import {
  ERROR_MESSAGE,
  type BookingInput,
  type CreateBookingResult,
  type FieldErrors,
  type PublicSession,
} from "@/lib/types";

const inputClassName = "min-h-[52px] w-full min-w-0 rounded-[var(--radius-card)] border-2 border-[var(--border-input)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-body)] outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-input-focus)] focus-visible:ring-0 aria-invalid:border-[var(--status-danger)] disabled:bg-[var(--surface-sunk)] md:text-base";
const labelClassName = "text-sm font-semibold text-[var(--text-strong)]";
const fieldErrorClassName = "text-[13px] font-medium text-[var(--status-danger)]";
const noticeClassName = "rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm text-[var(--text-body)]";

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
      setFieldErrors(error.fields ?? {});
      if (["SESSION_FULL", "SESSION_STARTED", "SESSION_CANCELLED", "NOT_FOUND"].includes(error.code)) {
        router.refresh();
      }
    },
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.reset();

    const result = validateBookingInput({ sessionId, headcount, customerName, phone });
    if (!result.ok) {
      setFieldErrors(result.fieldErrors);
      return;
    }
    if (!selectedSession) {
      setFieldErrors({ sessionId: "회차를 선택해 주세요." });
      return;
    }
    if (headcount > selectedSession.remaining) {
      setFieldErrors({ headcount: "남은 자리보다 많은 인원은 신청할 수 없습니다." });
      return;
    }

    setFieldErrors({});
    mutation.mutate(result.value);
  }

  if (sessions.length === 0) {
    return <p className={noticeClassName}>현재 예약 가능한 회차가 없습니다</p>;
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="예약 신청"
      aria-busy={mutation.isPending}
      className="flex min-w-0 flex-col gap-6 rounded-[var(--radius-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)] max-[901px]:pb-32 min-[901px]:sticky min-[901px]:top-[92px] min-[901px]:self-start"
    >
      <div>
        <h2 className="font-heading text-2xl font-bold text-[var(--text-strong)]">예약 신청</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">모든 일정은 한국 시각 기준입니다.</p>
      </div>

      <fieldset
        role="radiogroup"
        aria-labelledby={`${prefix}-sessions-label`}
        aria-describedby={fieldErrors.sessionId ? `${prefix}-session-error` : undefined}
        aria-invalid={Boolean(fieldErrors.sessionId)}
        className="min-w-0"
      >
        <legend id={`${prefix}-sessions-label`} className={`${labelClassName} mb-2`}>회차</legend>
        <div className="flex flex-col gap-2">
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
                  setFieldErrors((errors) => ({ ...errors, sessionId: undefined }));
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-16 min-w-0 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-control)] border-2 border-[var(--border-input)] px-4 py-3 transition-colors duration-120 hover:border-[var(--color-blurple-400)] active:scale-[.98] peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-blurple-50)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] peer-disabled:cursor-not-allowed peer-disabled:border-[var(--surface-raised)] peer-disabled:bg-[var(--surface-raised)] peer-disabled:text-[var(--text-control-disabled)]">
                <span className="min-w-0">
                  <span className="block font-heading text-base font-bold">{formatKstDate(session.startsAt)}</span>
                  <span className="block text-sm">{formatKstTime(session.startsAt)}</span>
                  <span className="block text-xs">정원 {session.capacity}명</span>
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
        <Label htmlFor={`${prefix}-headcount`} className={labelClassName}>인원</Label>
        <select
          id={`${prefix}-headcount`}
          value={headcount}
          onChange={(event) => setHeadcount(Number(event.target.value))}
          disabled={mutation.isPending}
          aria-invalid={Boolean(fieldErrors.headcount)}
          aria-describedby={fieldErrors.headcount ? `${prefix}-headcount-error` : undefined}
          className={inputClassName}
        >
          {Array.from({ length: MAX_HEADCOUNT }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>{count}명</option>
          ))}
        </select>
        {fieldErrors.headcount && <p id={`${prefix}-headcount-error`} className={fieldErrorClassName}>{fieldErrors.headcount}</p>}
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor={`${prefix}-name`} className={labelClassName}>예약자 이름</Label>
        <Input
          id={`${prefix}-name`}
          name="customerName"
          autoComplete="name"
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
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
          id={`${prefix}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={mutation.isPending}
          aria-invalid={Boolean(fieldErrors.phone)}
          aria-describedby={fieldErrors.phone ? `${prefix}-phone-error` : undefined}
          className={inputClassName}
        />
        {fieldErrors.phone && <p id={`${prefix}-phone-error`} className={fieldErrorClassName}>{fieldErrors.phone}</p>}
      </div>

      <div className={`${noticeClassName} space-y-2`}>
        <p>운영자가 확인 후 승인합니다. 신청 후에는 승인 대기 상태이며, 참여 확정이 아닙니다.</p>
        <p>승인 대기는 시작 전까지, 참여 확정은 시작 24시간 전까지 직접 취소할 수 있습니다. 정확히 24시간 전도 포함합니다.</p>
      </div>

      {mutation.isError && (
        <div role="alert" className="flex min-w-0 items-start gap-2 rounded-[var(--radius-control)] bg-[var(--status-danger-bg)] px-3.5 py-3 text-sm font-medium text-[var(--status-danger)]">
          <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
          <p className="min-w-0 break-words">{mutation.error instanceof ApiError ? mutation.error.message : ERROR_MESSAGE.INTERNAL_ERROR}</p>
        </div>
      )}
      {mutation.error instanceof ApiError && mutation.error.code === "SESSION_FULL" && (
        <p role="status" className={noticeClassName}>남은 자리가 바뀌었습니다. 회차와 인원을 다시 확인해 주세요.</p>
      )}

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
    </form>
  );
}
