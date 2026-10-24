"use client";

import { useSyncExternalStore, type JSX } from "react";

import { BookingStatusBadge } from "@/components/status-badge";
import { formatKstSchedule } from "@/lib/format";
import type { BookingReceipt } from "@/lib/types";

const rowClassName = "grid min-w-0 grid-cols-[96px_minmax(0,1fr)] gap-4 py-3 max-[641px]:grid-cols-[80px_minmax(0,1fr)]";
const valueClassName = "min-w-0 text-[var(--text-strong)] [overflow-wrap:anywhere]";

function storageKey(code: string): string {
  return `booking-receipt:${code}`;
}

export function saveBookingReceipt(receipt: BookingReceipt): void {
  try {
    sessionStorage.setItem(storageKey(receipt.code), JSON.stringify(receipt));
  } catch {
    // 저장소를 쓸 수 없으면 완료 화면은 신청 내용 없이 보인다.
  }
}

function readStored(code: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(code));
  } catch {
    return null;
  }
}

function isReceipt(value: unknown): value is BookingReceipt {
  if (typeof value !== "object" || value === null) return false;
  const receipt = value as Record<string, unknown>;
  const customer = receipt.customer as Record<string, unknown> | null | undefined;
  return receipt.status === "pending"
    && ["code", "classTitle", "place", "startsAt"].every((key) => typeof receipt[key] === "string")
    && ["durationMinutes", "headcount"].every((key) => typeof receipt[key] === "number")
    && typeof customer?.name === "string"
    && typeof customer.phone === "string";
}

function parseReceipt(raw: string | null, code: string): BookingReceipt | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isReceipt(value) && value.code === code ? value : null;
  } catch {
    return null;
  }
}

// 같은 탭의 저장소는 이 화면에서 바뀌지 않으므로 구독하지 않는다. 서버 렌더링에서는 비워 두고 하이드레이션 뒤 읽는다.
const subscribe = () => () => {};

export function BookingReceiptDetails({ code }: { code: string }): JSX.Element | null {
  const raw = useSyncExternalStore(subscribe, () => readStored(code), () => null);
  const receipt = parseReceipt(raw, code);
  if (!receipt) return null;

  return (
    <dl aria-label="신청 내용" className="min-w-0 divide-y divide-[var(--border-subtle)] rounded-[var(--radius-card)] bg-[var(--surface-card)] px-7 py-2 text-[15px] shadow-[var(--shadow-card)] max-[641px]:px-6">
      <div className={`${rowClassName} items-center`}>
        <dt className="text-[var(--text-muted)]">상태</dt>
        <dd><BookingStatusBadge status={receipt.status} /></dd>
      </div>
      <div className={rowClassName}>
        <dt className="text-[var(--text-muted)]">클래스</dt>
        <dd className={valueClassName}>{receipt.classTitle}</dd>
      </div>
      <div className={rowClassName}>
        <dt className="text-[var(--text-muted)]">신청자</dt>
        <dd className={valueClassName}>{receipt.customer.name} · {receipt.customer.phone}</dd>
      </div>
      <div className={rowClassName}>
        <dt className="text-[var(--text-muted)]">일시</dt>
        <dd className={valueClassName}>{formatKstSchedule(receipt.startsAt, receipt.durationMinutes)}</dd>
      </div>
      <div className={rowClassName}>
        <dt className="text-[var(--text-muted)]">장소</dt>
        <dd className={valueClassName}>{receipt.place}</dd>
      </div>
      <div className={rowClassName}>
        <dt className="text-[var(--text-muted)]">인원</dt>
        <dd className={valueClassName}>{receipt.headcount}명</dd>
      </div>
    </dl>
  );
}
