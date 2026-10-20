import type { Metadata } from "next";

import { AdminClassForm } from "@/components/admin-class-form";

export const metadata: Metadata = { title: "새 클래스 | 공방 클래스 예약" };

export default function NewAdminClassPage() {
  return <AdminClassForm />;
}
