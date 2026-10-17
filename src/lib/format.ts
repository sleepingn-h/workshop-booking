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
