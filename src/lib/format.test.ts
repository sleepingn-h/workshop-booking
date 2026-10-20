import { describe, expect, it } from "vitest";

import {
  classFacts,
  formatClassListInfo,
  formatDuration,
  formatKstDate,
  formatKstDateTime,
  formatKstTime,
  formatPhone,
  formatPrice,
  formatStartsIn,
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

describe("R-53 클래스 안내 항목 표시", () => {
  const info = {
    place: "가상 도자기 공방, 공방로 1",
    durationMinutes: 120,
    price: 45000,
    paymentMethod: "현장 결제",
    materials: "없음",
    contact: "010-0000-9001",
  };

  it.each([[1, "1분"], [90, "90분"], [1440, "1440분"]])("R-53 소요 시간 %i분을 %s로 표시한다", (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });

  it.each([[0, "무료"], [900, "₩900"], [45000, "₩45,000"], [10_000_000, "₩10,000,000"]])("R-53 비용 %i원을 %s로 표시한다", (price, text) => {
    expect(formatPrice(price)).toBe(text);
  });

  it("R-53 목록 한 줄은 장소·소요 시간·비용 순서로 잇는다", () => {
    expect(formatClassListInfo(info)).toBe("가상 도자기 공방, 공방로 1 · 120분 · ₩45,000");
    expect(formatClassListInfo({ ...info, price: 0 })).toBe("가상 도자기 공방, 공방로 1 · 120분 · 무료");
  });

  it("R-53 상세 안내 항목은 판단에 먼저 쓰는 소요 시간·비용부터 라벨과 함께 나열한다", () => {
    expect(classFacts(info)).toEqual([
      { key: "duration", label: "소요 시간", value: "120분" },
      { key: "price", label: "비용 (1인)", value: "₩45,000" },
      { key: "paymentMethod", label: "결제 방법", value: "현장 결제" },
      { key: "contact", label: "문의처", value: "010-0000-9001" },
      { key: "place", label: "장소", value: "가상 도자기 공방, 공방로 1" },
      { key: "materials", label: "준비물", value: "없음" },
    ]);
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
