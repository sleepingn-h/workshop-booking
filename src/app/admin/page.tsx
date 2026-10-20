import type { Metadata } from "next";

import { AdminBookingList } from "@/components/admin-booking-list";

export const metadata: Metadata = { title: "예약 관리 | 공방 클래스 예약" };

export default function AdminPage() {
  return <AdminBookingList />;
}
