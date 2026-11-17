import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { advanceDays, dateKey, resetClock } from "../src/store/clock";
import { dailyResult, recordDaily, resetDaily } from "../src/store/daily";
import { allLots, arrived, byHinban, lotsOf, resetLots, scan } from "../src/store/lots";
import { getProfile, storedProfile } from "../src/store/profile";
import { withCheck } from "../src/core/ean";

const product = withCheck("490000001234"); // 商品：3日
const store = withCheck("200000123456"); // お店のラベル：1日

beforeEach(() => {
  resetLots();
  resetClock();
  resetDaily();
});

describe("ロットと消費サイクル", () => {
  it("はじめて読むと1体目のロットができる", () => {
    const r = scan(product);
    expect(r.isNew).toBe(true);
    expect(r.total).toBe(1);
    expect(r.lot.index).toBe(1);
  });
  it("消費サイクルの間は、同じロットのまま", () => {
    const first = scan(product);
    advanceDays(2);
    const again = scan(product);
    expect(again.isNew).toBe(false);
    expect(again.lot).toEqual(first.lot);
    expect(arrived(product)).toBe(false);
  });
  it("消費サイクルが過ぎると入荷し、読むと新しいロットが出る", () => {
    scan(product);
    advanceDays(3);
    expect(arrived(product)).toBe(true);
    const next = scan(product);
    expect(next.isNew).toBe(true);
    expect(next.lot.index).toBe(2);
    expect(lotsOf(product).map((l) => l.index)).toEqual([1, 2]);
  });
  it("お店のラベルは1日で入荷する", () => {
    scan(store);
    advanceDays(1);
    expect(scan(store).lot.index).toBe(2);
  });
  it("棚は品番ごとにまとまり、最後に読んだ品番が先に並ぶ", () => {
    scan(product);
    advanceDays(3);
    scan(store);
    advanceDays(1);
    scan(product);
    const shelf = byHinban();
    expect(shelf.map((h) => [h.jan, h.lots.length])).toEqual([[product, 2], [store, 1]]);
    expect(shelf[0].latest.index).toBe(2);
    expect(allLots()).toHaveLength(3);
  });
});

describe("今日の挑戦者の結果", () => {
  it("その日の分だけ覚える。一度勝った日は勝ちのまま", () => {
    const today = dateKey();
    expect(dailyResult(today)).toBeUndefined();
    recordDaily(today, "lose");
    expect(dailyResult(today)).toBe("lose");
    recordDaily(today, "win");
    recordDaily(today, "lose");
    expect(dailyResult(today)).toBe("win");
    advanceDays(1);
    expect(dailyResult(dateKey())).toBeUndefined();
  });
});

describe("手入力の印", () => {
  it("数字を打って生んだロットには印が付き、読んだロットには付かない", () => {
    expect(scan(product, { typed: true }).lot.typed).toBe(true);
    advanceDays(3);
    expect(scan(product).lot.typed).toBeUndefined();
    expect(lotsOf(product).map((l) => !!l.typed)).toEqual([true, false]);
  });
});

describe("商品の中身（端末側）", () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  const serve = (handler: () => Response | Promise<Response>) => {
    calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return handler();
    }) as typeof fetch;
  };
  const ok = (o: unknown) => new Response(JSON.stringify(o));
  let n = 0;
  const freshJan = () => withCheck("4500000" + String(++n).padStart(5, "0"));
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("サーバーで決まった中身を端末に残し、次からは聞かない", async () => {
    const jan = freshJan();
    serve(() => ok({ flavor: "grape", source: "off" }));
    expect(await getProfile(jan)).toEqual({ flavor: "grape", source: "off" });
    expect(await getProfile(jan)).toEqual({ flavor: "grape", source: "off" });
    expect(calls).toBe(1);
  });

  it("「中身なし」も答えとして残す", async () => {
    const jan = freshJan();
    serve(() => ok({ source: "none" }));
    expect(await getProfile(jan)).toEqual({ source: "none" });
    expect(storedProfile(jan)).toEqual({ source: "none" });
  });

  it("サーバーに届かないとき（オフライン・混雑）は、残さずに品番だけで進む", async () => {
    const jan = freshJan();
    serve(() => {
      throw new Error("offline");
    });
    expect(await getProfile(jan)).toBeUndefined();
    serve(() => new Response("{}", { status: 503 }));
    expect(await getProfile(jan)).toBeUndefined();
    expect(storedProfile(jan)).toBeUndefined();
  });
});
