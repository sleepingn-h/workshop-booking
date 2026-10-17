import { ArrowUpRight, CalendarDays, Paintbrush } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { listPublishedClasses } from "@/lib/db";
import { formatKstDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "공방 클래스 예약 | 나만의 시간을 만드는 클래스",
  description:
    "공방 클래스의 안내와 일정, 남은 자리를 확인하고 회원가입 없이 예약을 신청하세요. 운영자가 확인한 뒤 참여를 확정합니다.",
};

export default async function Home() {
  await connection();
  const classes = await listPublishedClasses();

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] max-[641px]:text-[30px]">
          손으로 만드는 나만의 시간
        </h1>
        <p className="max-w-[56ch] text-lg leading-[1.55] text-[var(--text-body)] max-[641px]:text-base">
          마음에 드는 공방 클래스를 찾아보세요. 일정과 남은 자리를 확인하고 회원가입 없이 신청할 수 있어요.
        </p>
      </div>

      {classes.length === 0 ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-4 py-3.5 text-[var(--text-body)]">
          현재 공개된 클래스가 없습니다. 다음 클래스를 준비하고 있어요.
        </p>
      ) : (
        <ul aria-label="공방 클래스" className="grid grid-cols-3 gap-6 max-[901px]:grid-cols-1">
          {classes.map((workshop) => (
            <li key={workshop.id} className="min-w-0">
              <Link
                href={`/classes/${workshop.id}`}
                className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[var(--shadow-raised)]"
              >
                <div className="relative aspect-[4/3] bg-[var(--surface-image-placeholder)]">
                  {workshop.imageUrl ? (
                    <Image
                      src={workshop.imageUrl}
                      alt={`${workshop.title} 대표 이미지`}
                      fill
                      sizes="(max-width: 900px) 100vw, (max-width: 1200px) 33vw, 380px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[var(--color-blurple-600)]">
                      <Paintbrush aria-hidden="true" className="size-12" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2.5 px-5 pt-5 pb-[22px]">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 font-heading text-xl leading-[1.3] font-bold [overflow-wrap:anywhere]">
                      {workshop.title}
                    </h2>
                    <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-[var(--color-link)]" />
                  </div>
                  <p className="truncate text-sm text-[var(--text-muted)]">
                    {workshop.description.trim().split(/\r?\n/)[0]}
                  </p>
                  <div className="mt-auto flex items-start gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-sm text-[var(--text-muted)]">
                    <CalendarDays aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">다음 회차</p>
                      {workshop.nextSessionAt ? (
                        <time dateTime={workshop.nextSessionAt}>
                          {formatKstDateTime(workshop.nextSessionAt)} (한국 시각)
                        </time>
                      ) : (
                        <p>예약 가능한 회차 없음</p>
                      )}
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
