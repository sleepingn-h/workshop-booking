import type { Metadata } from "next";

import { BookingLookup } from "@/components/booking-lookup";

export const metadata: Metadata = {
  title: "예약 조회 | 공방 클래스 예약",
  robots: { index: false, follow: false },
};

export default async function BookingLookupPage({
  searchParams,
}: PageProps<"/bookings/lookup">) {
  const { code } = await searchParams;

  // 제목·안내는 조회 결과 화면에서 바뀌므로 BookingLookup이 그린다.
  return (
    <div className="mx-auto min-w-0 max-w-[640px]">
      <BookingLookup initialCode={typeof code === "string" ? code : undefined} />
    </div>
  );
}
