import { ArrowLeft, Paintbrush } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { BookingForm } from "@/components/booking-form";
import { ClassFacts } from "@/components/class-facts";
import { getPublishedClass } from "@/lib/db";
import { formatClassListInfo } from "@/lib/format";

export async function generateMetadata(
  { params }: PageProps<"/classes/[id]">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const workshop = await getPublishedClass(id);

  if (!workshop) {
    return {
      title: "클래스를 찾을 수 없습니다 | 공방 클래스 예약",
      robots: { index: false },
    };
  }

  // 소개는 선택 입력이라 비어 있으면 장소·소요 시간·비용을 미리보기 설명으로 쓴다(R-55).
  const description = workshop.description.replace(/\s+/g, " ").trim().slice(0, 120) || formatClassListInfo(workshop);
  const metadataBase = (await parent).metadataBase;
  const imageUrl = workshop.imageUrl
    ? new URL(workshop.imageUrl, metadataBase ?? "http://localhost:3000").href
    : null;

  return {
    title: workshop.title,
    description,
    openGraph: {
      title: workshop.title,
      description,
      images: imageUrl ? [{ url: imageUrl, alt: workshop.title }] : [],
    },
  };
}

export default async function ClassPage({ params }: PageProps<"/classes/[id]">) {
  await connection();
  const { id } = await params;
  const workshop = await getPublishedClass(id);
  if (!workshop) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-[15px] text-[var(--text-muted)] hover:text-[var(--text-strong)]"
      >
        <ArrowLeft aria-hidden="true" className="size-[18px]" />
        클래스 목록
      </Link>

      <div className="grid grid-cols-[minmax(0,1fr)_420px] items-start gap-12 max-[901px]:grid-cols-1 max-[901px]:gap-8">
        <article className="flex min-w-0 flex-col gap-8">
          <div className="relative aspect-video overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-image-placeholder)]">
            {workshop.imageUrl ? (
              <Image
                src={workshop.imageUrl}
                alt={`${workshop.title} 대표 이미지`}
                fill
                priority
                sizes="(max-width: 900px) 100vw, (max-width: 1200px) calc(100vw - 532px), 668px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--color-blurple-700)]">
                <Paintbrush aria-hidden="true" className="size-16" />
              </div>
            )}
          </div>
          <div className="space-y-4">
            <h1 className="font-heading text-[44px] leading-[1.15] font-extrabold tracking-[-.01em] [overflow-wrap:anywhere] max-[641px]:text-[30px]">
              {workshop.title}
            </h1>
            {workshop.description && (
              <p className="max-w-[65ch] text-base leading-relaxed whitespace-pre-line text-[var(--text-body)] [overflow-wrap:anywhere]">
                {workshop.description}
              </p>
            )}
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-8">
            <ClassFacts info={workshop} />
          </div>
        </article>

        <BookingForm
          classId={workshop.id}
          classTitle={workshop.title}
          place={workshop.place}
          durationMinutes={workshop.durationMinutes}
          sessions={workshop.sessions}
        />
      </div>
    </div>
  );
}
