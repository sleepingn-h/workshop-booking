import { Clock, MapPin, Package, Phone, Wallet, type LucideIcon } from "lucide-react";
import type { JSX, ReactNode } from "react";

import type { ClassFact, ClassFactKey } from "@/lib/format";

// 판단에 먼저 쓰는 소요 시간·비용을 앞에 두고, 긴 값(장소·준비물)은 한 줄을 다 쓴다.
const factOrder: readonly ClassFactKey[] = ["duration", "price", "place", "materials", "contact"];
const factIcons: Record<ClassFactKey, LucideIcon> = {
  duration: Clock,
  price: Wallet,
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

export function ClassFacts({ facts }: { facts: ClassFact[] }): JSX.Element | null {
  if (facts.length === 0) return null;
  const sorted = factOrder.flatMap((key) => facts.filter((fact) => fact.key === key));

  return (
    <dl className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-5 max-[641px]:grid-cols-1">
      {sorted.map((fact, index) => {
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
