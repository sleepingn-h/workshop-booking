import { describe, expect, it } from "vitest";

import {
  formatKstDate,
  formatKstDateTime,
  formatKstTime,
  formatPhone,
  formatStartsIn,
  isoToKstInput,
  kstInputToIso,
  parseClassInfo,
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

describe("R-53 클래스 설명의 안내 항목", () => {
  const description = "장소: 가상 도자기 공방, 공방로 1\n소요 시간: 2시간\n비용·결제 방법: 1인 45,000원, 현장 결제\n준비물: 없음\n문의처: 010-0000-9001";

  it("R-53: '라벨: 값' 줄을 정해진 순서의 안내 항목으로 나누고 나머지는 본문으로 남긴다", () => {
    expect(parseClassInfo(`물레로 컵을 만들어요.\n\n${description}\n완성품은 3주 뒤에 찾아가요.`)).toEqual({
      facts: [
        { key: "place", label: "장소", value: "가상 도자기 공방, 공방로 1" },
        { key: "duration", label: "소요 시간", value: "2시간" },
        { key: "price", label: "비용·결제 방법", value: "1인 45,000원, 현장 결제" },
        { key: "materials", label: "준비물", value: "없음" },
        { key: "contact", label: "문의처", value: "010-0000-9001" },
      ],
      body: "물레로 컵을 만들어요.\n\n완성품은 3주 뒤에 찾아가요.",
    });
  });

  it("R-53: 표기가 조금 달라도 같은 항목으로 읽고, 처음 나온 값만 쓴다", () => {
    const parsed = parseClassInfo("문의처 ： 02-123-4567\n비용: 무료\n비용 및 결제 방법: 현장 결제\n소요시간: 90분");

    expect(parsed.facts).toEqual([
      { key: "duration", label: "소요 시간", value: "90분" },
      { key: "price", label: "비용·결제 방법", value: "무료" },
      { key: "contact", label: "문의처", value: "02-123-4567" },
    ]);
    expect(parsed.body).toBe("비용 및 결제 방법: 현장 결제");
  });

  it("R-53: 안내 항목이 없거나 값이 비면 설명 전체를 본문으로 둔다", () => {
    expect(parseClassInfo("  자유롭게 쓴 설명입니다.\n장소:  ")).toEqual({
      facts: [],
      body: "자유롭게 쓴 설명입니다.\n장소:",
    });
  });
});

describe("전화번호 표시", () => {
  it.each([
    ["01012345678", "010-1234-5678"],
    ["0212345678", "02-1234-5678"],
    ["021234567", "02-123-4567"],
    ["0311234567", "031-123-4567"],
    ["010-1234-5678", "010-1234-5678"],
    ["12345", "12345"],
  ])("%s를 %s로 하이픈을 넣어 표시한다", (value, expected) => {
    expect(formatPhone(value)).toBe(expected);
  });
});

describe("시작까지 남은 시간 표시", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  const after = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

  it.each([
    [0.2, "1분 후 시작"],
    [45, "45분 후 시작"],
    [59.4, "59분 후 시작"],
    [60, "1시간 후 시작"],
    [4 * 60 + 20, "4시간 후 시작"],
    [47 * 60 + 29, "47시간 후 시작"],
  ])("고정한 now에서 %s분 뒤 시작은 %s로 표시한다", (minutes, expected) => {
    expect(formatStartsIn(after(minutes), now)).toBe(expected);
  });

  it.each([-1, 0, 48 * 60, 72 * 60])("고정한 now에서 %s분 뒤(시작했거나 이틀 이상 남음)는 표시하지 않는다", (minutes) => {
    expect(formatStartsIn(after(minutes), now)).toBeNull();
  });

  it("잘못된 시각은 표시하지 않는다", () => {
    expect(formatStartsIn("invalid", now)).toBeNull();
  });
});
