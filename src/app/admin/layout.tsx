import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminHeader } from "@/components/admin-header";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminHeader />
      <main className="mx-auto w-full min-w-0 max-w-[1200px] flex-1 px-8 pt-10 pb-24 max-[641px]:px-4 max-[641px]:pt-6 max-[641px]:pb-[72px]">{children}</main>
    </>
  );
}
