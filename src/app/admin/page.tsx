import type { Metadata } from "next";

import { AdminBookingList } from "@/components/admin-booking-list";

export const metadata: Metadata = { title: "예약 관리 | 공방 클래스 예약" };

export default function AdminPage() {
  return (
    <div className="min-w-0 space-y-10 max-[641px]:space-y-6">
      <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">예약 관리</h1>
      <AdminBookingList />
    </div>
  );
}
