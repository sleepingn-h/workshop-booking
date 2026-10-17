import { describe, expect, it } from "vitest";

import {
  formatKstDate,
  formatKstDateTime,
  formatKstTime,
  isoToKstInput,
  kstInputToIso,
} from "./format";

describe("한국 시각 표시", () => {
  it("날짜·요일·오전/오후를 한국어로 표시한다", () => {
    const value = "2025-10-18T05:00:00Z";

    expect(formatKstDateTime(value)).toBe("10월 18일 (토) 오후 2:00");
    expect(formatKstDate(value)).toBe("10월 18일 (토)");
    expect(formatKstTime(value)).toBe("오후 2:00");
  });

  it("UTC 15시는 다음 날 한국 시각 0시로 표시한다", () => {
    const value = "2025-12-31T15:00:00Z";

    expect(formatKstDateTime(value)).toBe("1월 1일 (목) 오전 12:00");
    expect(formatKstDate(value)).toBe("1월 1일 (목)");
    expect(formatKstTime(value)).toBe("오전 12:00");
  });

  it("Date 객체와 오프셋이 포함된 문자열도 같은 한국 시각으로 표시한다", () => {
    const utc = "2025-10-18T05:00:00Z";
    const offset = "2025-10-18T14:00:00+09:00";

    for (const format of [formatKstDateTime, formatKstDate, formatKstTime]) {
      expect(format(new Date(utc))).toBe(format(utc));
      expect(format(offset)).toBe(format(utc));
    }
  });

  it.each(["", "invalid", new Date(Number.NaN)])(
    "잘못된 날짜 %s는 빈 문자열로 표시한다",
    (value) => {
      expect(formatKstDateTime(value)).toBe("");
      expect(formatKstDate(value)).toBe("");
      expect(formatKstTime(value)).toBe("");
    },
  );
});

describe("한국 시각 datetime-local 변환", () => {
  it("UTC에서 연도가 바뀌는 한국 시각 입력값을 만든다", () => {
    expect(isoToKstInput("2025-12-31T15:00:00Z")).toBe("2026-01-01T00:00");
  });

  it("초를 제외하고 자정은 24시 대신 00시로 변환한다", () => {
    expect(isoToKstInput("2025-10-17T15:07:59Z")).toBe("2025-10-18T00:07");
  });

  it.each(["2025-10-18T14:00", "2026-01-01T00:00", "2024-02-29T23:59"])(
    "%s를 한국 시각 오프셋이 있는 ISO 문자열로 변환하고 왕복한다",
    (value) => {
      const iso = kstInputToIso(value);

      expect(iso).toBe(`${value}:00+09:00`);
      expect(isoToKstInput(iso)).toBe(value);
    },
  );

  it.each(["", "invalid", "2025-13-01T00:00:00Z"])(
    "잘못된 ISO 입력 %s는 빈 문자열을 반환한다",
    (value) => {
      expect(isoToKstInput(value)).toBe("");
    },
  );

  it.each([
    "",
    "invalid",
    "2025-10-18",
    "2025-10-18 14:00",
    "2025-1-18T14:00",
    "2025-10-18T1:00",
    "2025-10-18T14:00:00",
    "2025-10-18T14:00Z",
    "2025-10-18T14:00+09:00",
    " 2025-10-18T14:00 ",
    "2025-13-01T14:00",
    "2025-00-01T14:00",
    "2025-10-00T14:00",
    "2025-02-29T14:00",
    "2024-02-30T14:00",
    "2025-04-31T14:00",
    "2025-10-18T24:00",
    "2025-10-18T14:60",
  ])("잘못된 한국 시각 입력 %s는 빈 문자열을 반환한다", (value) => {
    expect(kstInputToIso(value)).toBe("");
  });
});
