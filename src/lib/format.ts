const timeZone = "Asia/Seoul";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  month: "long",
  day: "numeric",
  weekday: "short",
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const inputFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parseDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatKstDateTime(value: string | Date): string {
  const date = parseDate(value);
  return date
    ? `${dateFormatter.format(date)} ${timeFormatter.format(date)}`
    : "";
}

export function formatKstDate(value: string | Date): string {
  const date = parseDate(value);
  return date ? dateFormatter.format(date) : "";
}

export function formatKstTime(value: string | Date): string {
  const date = parseDate(value);
  return date ? timeFormatter.format(date) : "";
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// 이틀 안에 시작하는 회차만 남은 시간을 알린다. 내림해 "60분"·"48시간"처럼 단위가 넘치지 않게 한다.
export function formatStartsIn(startsAt: string | Date, now: Date): string | null {
  const date = parseDate(startsAt);
  const diff = date ? date.getTime() - now.getTime() : Number.NaN;
  if (!(diff > 0) || diff >= 48 * HOUR) return null;
  if (diff < HOUR) return `${Math.max(1, Math.floor(diff / MINUTE))}분 후 시작`;
  return `${Math.floor(diff / HOUR)}시간 후 시작`;
}

export function isoToKstInput(iso: string): string {
  const date = parseDate(iso);
  if (!date) return "";

  const parts = Object.fromEntries(
    inputFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );

  return `${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function kstInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";

  const iso = `${value}:00+09:00`;
  // 달력에 없는 날짜나 24시는 Date가 보정하므로 왕복 값으로 검사한다.
  return isoToKstInput(iso) === value ? iso : "";
}

export type ClassFactKey = "place" | "duration" | "price" | "materials" | "contact";
export type ClassFact = { key: ClassFactKey; label: string; value: string };

// 설명은 하나의 문자열로 저장하므로(R-53) 화면에서만 "라벨: 값" 줄을 안내 항목으로 나눈다.
const classFactLabels: readonly { key: ClassFactKey; label: string; pattern: RegExp }[] = [
  { key: "place", label: "장소", pattern: /^장소$/ },
  { key: "duration", label: "소요 시간", pattern: /^소요시간$/ },
  { key: "price", label: "비용·결제 방법", pattern: /^비용/ },
  { key: "materials", label: "준비물", pattern: /^준비물$/ },
  { key: "contact", label: "문의처", pattern: /^문의처?$/ },
];

export function parseClassInfo(description: string): { facts: ClassFact[]; body: string } {
  const found = new Map<ClassFactKey, string>();
  const bodyLines: string[] = [];

  for (const line of description.split(/\r?\n/)) {
    const match = /^\s*([^:：]{1,20}?)\s*[:：]\s*(\S.*?)\s*$/.exec(line);
    const label = match?.[1].replace(/\s+/g, "");
    const fact = label ? classFactLabels.find(({ pattern }) => pattern.test(label)) : undefined;
    if (match && fact && !found.has(fact.key)) found.set(fact.key, match[2]);
    else bodyLines.push(line);
  }

  return {
    facts: classFactLabels.flatMap(({ key, label }) => {
      const value = found.get(key);
      return value ? [{ key, label, value }] : [];
    }),
    body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.startsWith("02") && digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.startsWith("02") && digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}
