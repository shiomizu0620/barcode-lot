import { describe, expect, it } from "vitest";
import { combosOf, dailyChallenger, decodeTeam, encodeTeam, matchup, simulate, strongAgainst, TASTE_RING, weakAgainst, type Member } from "../src/core/battle";
import { specFor } from "../src/core/creature";
import { FLAVORS } from "../src/core/product";
import { withCheck } from "../src/core/ean";
import { Rng } from "../src/core/rng";

const ids = FLAVORS.map((f) => f.id);
const team = (seed: string): Member[] => {
  const r = new Rng(seed);
  return [0, 1, 2].map(() => ({
    jan: withCheck("49" + String(r.int(0, 9999999999)).padStart(10, "0")),
    lotSeed: `1:${r.int(1, 99999)}`,
    profile: r.chance(0.7) ? { flavor: r.pick(ids), source: "off" as const } : undefined,
  }));
};

describe("バトル", () => {
  it("同じ入力なら同じ結果", () => {
    const a = team("a"), b = team("b");
    expect(simulate(a, b, "s1")).toEqual(simulate(a, b, "s1"));
  });
  it("味の輪", () => {
    expect(matchup("あまい", "からい")).toBe("strong");
    expect(matchup("からい", "あまい")).toBe("weak");
    expect(matchup("しょっぱい", "あまい")).toBe("strong");
    expect(matchup("あまい", "うまい")).toBe("even");
  });
  it("強い相手・苦手な相手は、味の輪のとなり同士", () => {
    for (const t of TASTE_RING) {
      expect(matchup(t, strongAgainst(t))).toBe("strong");
      expect(matchup(t, weakAgainst(t))).toBe("weak");
    }
  });
  it("チーム選びの予告と、試合で出る組み合わせ技は同じ", () => {
    for (let i = 0; i < 200; i++) {
      const a = team("combo" + i);
      const shown = combosOf(a.map((m) => specFor(m.jan, m.profile).flavor)).map((c) => c.name);
      const played = simulate(a, team("x" + i), "s").events.flatMap((e) => (e.t === "combo" && e.side === 0 ? [e.name] : []));
      expect(shown).toEqual(played);
    }
  });
  it("晩酌コンボが出る", () => {
    const a: Member[] = [
      { jan: withCheck("490000000001"), lotSeed: "1:1", profile: { flavor: "beer", source: "off" } },
      { jan: withCheck("490000000002"), lotSeed: "1:1", profile: { flavor: "salty", source: "off" } },
      { jan: withCheck("490000000003"), lotSeed: "1:1" },
    ];
    const res = simulate(a, team("x"), "s");
    expect(res.events.some((e) => e.t === "combo" && e.name === "晩酌コンボ" && e.side === 0)).toBe(true);
  });
  it("挑戦状は往復できる", () => {
    const a = team("c");
    const back = decodeTeam(encodeTeam(a))!;
    expect(back.map((m) => [m.jan, m.lotSeed, m.profile?.flavor])).toEqual(a.map((m) => [m.jan, m.lotSeed, m.profile?.flavor]));
    expect(decodeTeam("こわれた")).toBeNull();
  });
  it("今日の挑戦者は日付で決まる", () => {
    expect(dailyChallenger("2026-11-12", ids)).toEqual(dailyChallenger("2026-11-12", ids));
    expect(dailyChallenger("2026-11-12", ids)).not.toEqual(dailyChallenger("2026-11-13", ids));
  });
  it("ほどよい長さで決着する（バランスの目安）", () => {
    let hits = 0, ko = 0, n = 400;
    for (let i = 0; i < n; i++) {
      const res = simulate(team("A" + i), team("B" + i), "s" + i);
      hits += res.events.filter((e) => e.t === "hit").length;
      if (res.events.some((e) => e.t === "end" && e.reason === "ko")) ko++;
    }
    const avg = hits / n;
    console.log("平均攻撃回数", avg.toFixed(1), "KO率", (ko / n).toFixed(2));
    expect(avg).toBeGreaterThan(10);
    expect(avg).toBeLessThan(30);
    expect(ko / n).toBeGreaterThan(0.9);
  });
});
