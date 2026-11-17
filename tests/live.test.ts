import { describe, expect, it } from "vitest";
import type { Member } from "../src/core/battle";
import { withCheck } from "../src/core/ean";
import { createLive, LIVE, remaining, stepLive, type LiveEvent, type LiveInput } from "../src/core/live";
import { FLAVORS } from "../src/core/product";
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

/** 最後まで進める。script は「何コマ目にどの操作をするか」。 */
function play(a: Member[], b: Member[], seed: string, cpu: [boolean, boolean], script: Record<number, LiveInput[]> = {}) {
  const state = createLive(a, b, seed, cpu);
  const log: LiveEvent[] = [];
  while (state.winner === null) log.push(...stepLive(state, script[state.tick + 1] ?? []));
  return { state, log };
}

describe("手を出せるバトル", () => {
  it("同じチーム・同じ種・同じ操作なら、同じ試合になる", () => {
    const a = team("a"), b = team("b");
    const script = { 20: [{ side: 0, t: "front", slot: 1 } as const], 90: [{ side: 0, t: "move", slot: 0 } as const] };
    expect(play(a, b, "s", [false, true], script).log).toEqual(play(a, b, "s", [false, true], script).log);
    expect(play(a, b, "s", [false, true], script).log).not.toEqual(play(a, b, "t", [false, true], script).log);
  });

  it("先頭を入れ替えられる。入れ替えた直後は、もう一度は替えられない", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    expect(stepLive(state, [{ side: 0, t: "front", slot: 2 }])).toContainEqual({ t: "front", side: 0, slot: 2, forced: false });
    expect(state.front[0]).toBe(2);
    stepLive(state, [{ side: 0, t: "front", slot: 1 }]);
    expect(state.front[0]).toBe(2);
    for (let i = 0; i < LIVE.swapWait; i++) stepLive(state);
    stepLive(state, [{ side: 0, t: "front", slot: 1 }]);
    expect(state.front[0]).toBe(1);
  });

  it("攻撃は相手の先頭に当たる", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    stepLive(state, [{ side: 1, t: "front", slot: 2 }]);
    const hits: LiveEvent[] = [];
    for (let i = 0; i < 40; i++) hits.push(...stepLive(state).filter((e) => e.t === "hit" && e.side === 0));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.t === "hit" && e.target === 2)).toBe(true);
  });

  it("技はゲージが満タンのときだけ出せて、ふつうの攻撃より強い", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    expect(stepLive(state, [{ side: 0, t: "move", slot: 0 }]).some((e) => e.t === "hit" && e.move)).toBe(false);
    const f = state.fighters[0][0];
    let normal = 0;
    while (f.gauge < LIVE.gaugeMax) for (const e of stepLive(state)) if (e.t === "hit" && e.side === 0 && e.slot === 0) normal = Math.max(normal, e.damage);
    const fired = stepLive(state, [{ side: 0, t: "move", slot: 0 }]).find((e) => e.t === "hit" && e.move);
    expect(fired && fired.t === "hit" && fired.damage).toBeGreaterThan(normal * 2);
    expect(f.gauge).toBeLessThan(LIVE.gaugeMax);
  });

  it("控えにいる間は、少しずつ回復する", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    const back = state.fighters[0][1];
    back.hp = 10;
    for (let i = 0; i < 50; i++) stepLive(state);
    expect(back.hp).toBeGreaterThan(10);
  });

  it("CPU同士でも決着がつき、ほどよい長さで終わる（バランスの目安）", () => {
    let ticks = 0, ko = 0, moves = 0, swaps = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const { state, log } = play(team("A" + i), team("B" + i), "s" + i, [true, true]);
      ticks += state.tick;
      if (state.reason === "ko") ko++;
      moves += log.filter((e) => e.t === "hit" && e.move).length;
      swaps += log.filter((e) => e.t === "front" && !e.forced).length;
      expect(remaining(state, 0) === 0 || remaining(state, 1) === 0 || state.reason === "time").toBe(true);
    }
    const sec = (ticks / n) * (LIVE.tickMs / 1000);
    console.log("平均", sec.toFixed(1), "秒", "KO率", (ko / n).toFixed(2), "技", (moves / n).toFixed(1), "回", "入れ替え", (swaps / n).toFixed(1), "回");
    expect(sec).toBeGreaterThan(30);
    expect(sec).toBeLessThan(75);
    expect(ko / n).toBeGreaterThan(0.8);
  });
});
