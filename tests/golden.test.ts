import { describe, expect, it } from "vitest";
import golden from "../fixtures/golden.json";
import { goldenCases } from "./golden-cases";
import { bars, normalize } from "../src/ean";

describe("同じ番号からは、いつでも同じキャラ", () => {
  it("答え合わせ用データと一致する", () => {
    expect(JSON.parse(JSON.stringify(goldenCases()))).toEqual(golden);
  });
});

describe("バーコードの計算", () => {
  it("EAN-13は必ず30本の棒、95モジュールに収まる", () => {
    for (const g of golden.base) {
      const bs = bars(g.jan);
      expect(bs.length).toBe(30);
      const last = bs[bs.length - 1];
      expect(last.x + last.w).toBe(95);
    }
  });
  it("チェック数字が違う番号は弾く", () => {
    expect(normalize("4901234567894")).toBe("4901234567894");
    expect(normalize("4901234567890")).toBeNull();
    expect(normalize("12345")).toBeNull();
  });
});
