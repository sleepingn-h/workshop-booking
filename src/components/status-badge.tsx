import type { JSX, ReactNode } from "react";

import { BOOKING_STATUS_LABEL, type BookingStatus } from "@/lib/types";

const bookingStatusStyles: Record<BookingStatus, string> = {
  pending: "bg-[var(--badge-pending-bg)] text-[var(--badge-pending-text)]",
  confirmed: "bg-[var(--badge-confirmed-bg)] text-[var(--badge-confirmed-text)]",
  rejected: "bg-[var(--badge-rejected-bg)] text-[var(--badge-rejected-text)]",
  cancelled: "bg-[var(--badge-cancelled-bg)] text-[var(--badge-cancelled-text)]",
};

const tagToneStyles = {
  success: "bg-[var(--color-green)] text-[var(--text-on-green)]",
  neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
};

export function BookingStatusBadge({
  status,
}: {
  status: BookingStatus;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-card)] px-3 py-1 text-sm font-medium ${bookingStatusStyles[status]}`}
    >
      {BOOKING_STATUS_LABEL[status]}
    </span>
  );
}

export function Tag({
  tone,
  children,
}: {
  tone: "success" | "neutral" | "danger";
  children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-card)] px-2 py-0.5 text-xs font-medium ${tagToneStyles[tone]}`}
    >
      {children}
    </span>
  );
}
