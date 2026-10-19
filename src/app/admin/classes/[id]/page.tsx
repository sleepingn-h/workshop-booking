import type { Metadata } from "next";

import { AdminClassForm } from "@/components/admin-class-form";
import { AdminSessionList } from "@/components/admin-session-list";

export const metadata: Metadata = { title: "클래스 편집 | 공방 클래스 예약" };

export default async function EditAdminClassPage({ params }: PageProps<"/admin/classes/[id]">) {
  const { id } = await params;
  return (
    <div className="min-w-0 space-y-6">
      <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">클래스 편집</h1>
      <AdminClassForm classId={id} />
      <section aria-labelledby="sessions-heading" className="min-w-0 space-y-6 pt-4">
        <h2 id="sessions-heading" className="font-heading text-[28px] leading-[1.2] font-bold max-[641px]:text-2xl">회차</h2>
        <AdminSessionList classId={id} />
      </section>
    </div>
  );
}
