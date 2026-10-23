import type { ClassInfo, ClassListInfo } from "./types";

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

// 회차 일시는 시작 시각에 소요 시간을 더한 종료 시각까지 잇는다. 날짜가 바뀌면 종료 날짜도 쓴다(R-33).
export function formatKstSchedule(startsAt: string | Date, durationMinutes: number): string {
  const start = parseDate(startsAt);
  if (!start) return "";
  const end = new Date(start.getTime() + durationMinutes * MINUTE);
  const endText = formatKstDate(end) === formatKstDate(start) ? formatKstTime(end) : formatKstDateTime(end);
  return `${formatKstDateTime(start)}–${endText}`;
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

export type ClassFactKey = "duration" | "price" | "paymentMethod" | "contact" | "place" | "materials";
export type ClassFact = { key: ClassFactKey; label: string; value: string };

export function formatDuration(minutes: number): string {
  return `${minutes}분`;
}

// 비용이 0원이면 무료로 안내한다(PLAN 5절).
export function formatPrice(price: number): string {
  return price === 0 ? "무료" : `₩${price.toLocaleString("ko-KR")}`;
}

export function formatClassListInfo(info: ClassListInfo): string {
  return [info.place, formatDuration(info.durationMinutes), formatPrice(info.price)].join(" · ");
}

// 판단에 먼저 쓰는 소요 시간·비용을 앞에 두고, 긴 값(장소·준비물)은 뒤에 둔다.
export function classFacts(info: ClassInfo): ClassFact[] {
  return [
    { key: "duration", label: "소요 시간", value: formatDuration(info.durationMinutes) },
    { key: "price", label: "비용 (1인)", value: formatPrice(info.price) },
    { key: "paymentMethod", label: "결제 방법", value: info.paymentMethod },
    { key: "contact", label: "문의처", value: info.contact },
    { key: "place", label: "장소", value: info.place },
    { key: "materials", label: "준비물", value: info.materials },
  ];
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.startsWith("02") && digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.startsWith("02") && digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

// 고객 조회에 쓰는 신청자 이름은 첫·마지막 글자만 남긴다. 두 글자면 첫 글자만, 한 글자면 모두 가린다(R-33).
export function maskName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length <= 1) return "*".repeat(chars.length);
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

// 하이픈으로 나뉘는 전화번호는 가운데 자리를, 나뉘지 않으면 뒷자리 4자리 외를 가린다(R-33).
export function maskPhone(phone: string): string {
  const parts = formatPhone(phone).split("-");
  if (parts.length === 3) return [parts[0], "*".repeat(parts[1].length), parts[2]].join("-");
  const digits = phone.replace(/\D/g, "");
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
