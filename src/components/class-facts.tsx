import { Clock, CreditCard, MapPin, Package, Phone, Wallet, type LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

import { classFacts, formatDuration, formatPrice, type ClassFact, type ClassFactKey } from "@/lib/format";
import type { ClassInfo, ClassListInfo } from "@/lib/types";

const factIcons: Record<ClassFactKey, LucideIcon> = {
  duration: Clock,
  price: Wallet,
  paymentMethod: CreditCard,
  place: MapPin,
  materials: Package,
  contact: Phone,
};
const wideFacts = new Set<ClassFactKey>(["place", "materials"]);
const iconColors = ["text-[var(--color-green-700)]", "text-[var(--color-magenta-600)]", "text-[var(--color-blurple-600)]"];
const phonePattern = /0\d{1,2}-?\d{3,4}-?\d{4}/;

function FactValue({ fact }: { fact: ClassFact }): ReactNode {
  const phone = fact.key === "contact" ? phonePattern.exec(fact.value) : null;
  if (!phone) return fact.value;
  return <>
    {fact.value.slice(0, phone.index)}
    <a href={`tel:${phone[0].replace(/\D/g, "")}`} className="font-medium text-[var(--color-link)] hover:text-[var(--color-link-hover)]">{phone[0]}</a>
    {fact.value.slice(phone.index + phone[0].length)}
  </>;
}

// 긴 값(장소·준비물)은 한 줄을 다 쓴다.
export function ClassFacts({ info }: { info: ClassInfo }): JSX.Element {
  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 max-[641px]:grid-cols-1">
      {classFacts(info).map((fact, index) => {
        const Icon = factIcons[fact.key];
        return (
          <div key={fact.key} className={`flex min-w-0 items-start gap-2.5 ${wideFacts.has(fact.key) ? "col-span-full" : ""}`}>
            <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${iconColors[index % iconColors.length]}`} />
            <div className="min-w-0">
              <dt className="mb-0.5 text-[13px] leading-[1.4] font-semibold text-[var(--text-muted)]">{fact.label}</dt>
              <dd className="text-[15px] leading-normal text-[var(--text-strong)] [overflow-wrap:anywhere]"><FactValue fact={fact} /></dd>
            </div>
          </div>
        );
      })}
    </dl>
  );
}

// 목록 한 줄에서 긴 장소만 말줄임하고 소요 시간·비용은 항상 보이게 둔다.
export function ClassSummaryLine({ info, className = "" }: { info: ClassListInfo; className?: string }): JSX.Element {
  return (
    <p className={`flex min-w-0 items-baseline text-sm ${className}`}>
      <span className="truncate">{info.place}</span>
      <span aria-hidden="true" className="mx-1.5 shrink-0">·</span>
      <span className="shrink-0">{formatDuration(info.durationMinutes)}</span>
      <span aria-hidden="true" className="mx-1.5 shrink-0">·</span>
      <span className="shrink-0">{formatPrice(info.price)}</span>
    </p>
  );
}

// 고객 목록 카드는 장소·소요 시간·비용을 한 줄씩 두고, 긴 장소는 말줄임한다.
export function ClassListFacts({ info, className = "" }: { info: ClassListInfo; className?: string }): JSX.Element {
  const facts: ClassFact[] = [
    { key: "place", label: "장소", value: info.place },
    { key: "duration", label: "소요 시간", value: formatDuration(info.durationMinutes) },
    { key: "price", label: "비용 (1인)", value: formatPrice(info.price) },
  ];
  return (
    <dl className={`min-w-0 space-y-1.5 text-sm ${className}`}>
      {facts.map((fact) => {
        const Icon = factIcons[fact.key];
        return (
          <div key={fact.key} className="flex min-w-0 items-center gap-2">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-[var(--text-muted)]" />
            <dt className="sr-only">{fact.label}</dt>
            <dd className="truncate">{fact.value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
