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

  return (
    <div className="mx-auto flex min-w-0 max-w-[640px] flex-col gap-10">
      <div className="space-y-4">
        <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">예약 조회</h1>
        <p className="text-lg leading-[1.55] max-[641px]:text-base">예약번호와 전화번호 뒷자리 4자리로 신청 결과를 확인하고, 기한 내에 예약을 취소할 수 있습니다.</p>
      </div>
      <BookingLookup initialCode={typeof code === "string" ? code : undefined} />
    </div>
  );
}
