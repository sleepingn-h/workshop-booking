import { CalendarDays, Paintbrush } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { ClassSummaryLine } from "@/components/class-facts";
import { listPublishedClasses } from "@/lib/db";
import { formatKstDateTime } from "@/lib/format";
import type { ClassSummary } from "@/lib/types";

export const metadata: Metadata = {
  title: "공방 클래스 예약 | 나만의 시간을 만드는 클래스",
  description:
    "공방 클래스의 안내와 일정, 남은 자리를 확인하고 회원가입 없이 예약을 신청하세요. 운영자가 확인한 뒤 참여를 확정합니다.",
};

const placeholderTones = [
  "bg-[var(--surface-image-placeholder)]",
  "bg-[var(--color-blurple-100)]",
  "bg-[var(--color-magenta-100)]",
  "bg-[var(--color-green-100)]",
];

function NextSession({ workshop }: { workshop: ClassSummary }) {
  if (!workshop.nextSessionAt || workshop.nextSessionRemaining === null) {
    return <p className="text-[var(--text-muted)]">예약 가능한 회차 없음</p>;
  }
  const remaining = workshop.nextSessionRemaining;
  return (
    <>
      <p className="min-w-0 text-[var(--text-muted)]">
        {remaining === 0 ? "모든 회차 마감" : "다음 회차"}{" "}
        <time dateTime={workshop.nextSessionAt} className="font-semibold text-[var(--text-strong)]">
          {formatKstDateTime(workshop.nextSessionAt)}
        </time>
      </p>
      {remaining > 0 && (
        <p className={`shrink-0 font-semibold ${remaining <= 2 ? "text-[var(--color-magenta-600)]" : "text-[var(--text-muted)]"}`}>
          {remaining}자리 남음
        </p>
      )}
    </>
  );
}

export default async function Home() {
  await connection();
  const classes = await listPublishedClasses();

  return (
    <div className="space-y-10">
      <div className="space-y-3.5">
        <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">
          손으로 만드는 나만의 시간
        </h1>
        <p className="max-w-[56ch] text-lg leading-[1.55] text-[var(--text-body)] max-[641px]:text-base">
          마음에 드는 클래스의 일정과 남은 자리를 확인하고 회원가입 없이 신청해 주세요. 운영자가 확인한 뒤 참여가 확정됩니다.
        </p>
        <p className="text-sm text-[var(--text-muted)]">모든 일정은 한국 시각 기준입니다.</p>
      </div>

      {classes.length === 0 ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-[var(--text-body)]">
          현재 공개된 클래스가 없습니다. 다음 클래스를 준비하고 있습니다.
        </p>
      ) : (
        <ul aria-label="공방 클래스" className="grid grid-cols-3 gap-6 max-[901px]:grid-cols-1">
          {classes.map((workshop, index) => (
            <li key={workshop.id} className="min-w-0">
              <Link
                href={`/classes/${workshop.id}`}
                className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] text-[var(--text-body)] shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[var(--shadow-raised)]"
              >
                <div className={`relative aspect-[4/3] ${placeholderTones[index % placeholderTones.length]}`}>
                  {workshop.imageUrl ? (
                    <Image
                      src={workshop.imageUrl}
                      alt={`${workshop.title} 대표 이미지`}
                      fill
                      sizes="(max-width: 900px) 100vw, (max-width: 1200px) 33vw, 380px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[var(--color-blurple-700)]">
                      <Paintbrush aria-hidden="true" className="size-10" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2.5 px-5 pt-5 pb-[22px]">
                  <h2 className="min-w-0 font-heading text-xl leading-[1.3] font-bold [overflow-wrap:anywhere]">
                    {workshop.title}
                  </h2>
                  <ClassSummaryLine info={workshop} className="text-[var(--text-muted)]" />
                  {workshop.description && <p className="line-clamp-2 text-sm [overflow-wrap:anywhere]">{workshop.description}</p>}
                  <div className="mt-auto flex min-w-0 items-start gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-sm">
                    <CalendarDays aria-hidden="true" className="mt-px size-[18px] shrink-0 text-[var(--text-muted)]" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                      <NextSession workshop={workshop} />
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
