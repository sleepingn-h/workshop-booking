import type { Metadata } from "next";

import { AdminClassList } from "@/components/admin-class-list";

export const metadata: Metadata = { title: "클래스 관리 | 공방 클래스 예약" };

export default function AdminClassesPage() {
  return <AdminClassList />;
}
