import type { Metadata } from "next";

import { AdminClassForm } from "@/components/admin-class-form";
import { AdminSessionList } from "@/components/admin-session-list";

export const metadata: Metadata = { title: "클래스 편집 | 공방 클래스 예약" };

export default async function EditAdminClassPage({ params }: PageProps<"/admin/classes/[id]">) {
  const { id } = await params;
  return (
    <AdminClassForm classId={id}>
      <AdminSessionList classId={id} />
    </AdminClassForm>
  );
}
