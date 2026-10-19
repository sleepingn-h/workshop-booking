import type { Metadata } from "next";

import { AdminClassForm } from "@/components/admin-class-form";

export const metadata: Metadata = { title: "새 클래스 | 공방 클래스 예약" };

export default function NewAdminClassPage() {
  return (
    <div className="min-w-0 space-y-6">
      <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">새 클래스</h1>
      <AdminClassForm />
    </div>
  );
}
