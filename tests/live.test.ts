import { describe, expect, it } from "vitest";
import type { Member } from "../src/core/battle";
import { withCheck } from "../src/core/ean";
import { createLive, LIVE, remaining, stepLive, styleOf, type LiveEvent, type LiveInput, type LiveState } from "../src/core/live";
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
/** 3体とも同じ味（Flavor.id）のチーム。 */
const tasted = (flavor: string, seed = flavor): Member[] =>
  team(seed).map((m) => ({ ...m, profile: { flavor, source: "off" as const } }));

/** 最後まで進める。script は「何コマ目にどの操作をするか」。 */
function play(a: Member[], b: Member[], seed: string, cpu: [boolean, boolean], script: Record<number, LiveInput[]> = {}) {
  const state = createLive(a, b, seed, cpu);
  const log: LiveEvent[] = [];
  while (state.winner === null) log.push(...stepLive(state, script[state.tick + 1] ?? []));
  return { state, log };
}
/** 条件を満たす出来事が出るまで進める（最大 limit コマ）。 */
function until(state: LiveState, test: (e: LiveEvent) => boolean, limit = 400, inputs: LiveInput[] = []): LiveEvent | undefined {
  for (let i = 0; i < limit && state.winner === null; i++) {
    const hit = stepLive(state, i === 0 ? inputs : []).find(test);
    if (hit) return hit;
  }
  return undefined;
}

describe("手を出せるバトル（からだ・あじ）", () => {
  it("同じチーム・同じ種・同じ操作なら、同じ試合になる", () => {
    const a = team("a"), b = team("b");
    const script: Record<number, LiveInput[]> = { 20: [{ side: 0, t: "aim", slot: 2 }], 90: [{ side: 0, t: "move", slot: 0 }], 150: [{ side: 0, t: "wipe", slot: 1 }] };
    expect(play(a, b, "s", [false, true], script).log).toEqual(play(a, b, "s", [false, true], script).log);
    expect(play(a, b, "s", [false, true], script).log).not.toEqual(play(a, b, "t", [false, true], script).log);
  });

  it("濃さと香りで、得意な攻撃（型）が決まる", () => {
    expect(styleOf(80, 50)).toBe("karada");
    expect(styleOf(50, 80)).toBe("aji");
    expect(styleOf(60, 62)).toBe("both");
  });

  it("ねらうと、こちらの攻撃がその子に集まる", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    stepLive(state, [{ side: 0, t: "aim", slot: 2 }]);
    const targets: number[] = [];
    for (let i = 0; i < 80; i++) for (const e of stepLive(state)) if (e.t === "hit" && e.side === 0) targets.push(e.target);
    expect(targets.length).toBeGreaterThan(2);
    expect(new Set(targets)).toEqual(new Set([2]));
  });

  it("ねらわないときは、相手の誰にでも当たる", () => {
    const { log } = play(team("a"), team("b"), "s", [false, false]);
    const targets = new Set(log.flatMap((e) => (e.t === "hit" && e.side === 0 ? [e.target] : [])));
    expect(targets.size).toBeGreaterThan(1);
  });

  it("あじ攻撃には味ごとの効き目が付き、少しすると消える", () => {
    const state = createLive(tasted("lemon"), team("b"), "s", [false, false]); // すっぱい → きゅっ
    const hit = until(state, (e) => e.t === "hit" && e.side === 0 && e.kind === "aji");
    expect(hit && hit.t === "hit" && hit.effect).toBe("kyu");
    if (hit?.t !== "hit") return;
    expect(state.fighters[1][hit.target].effects.kyu).toBeGreaterThan(0);
    // かかり直さないよう、こちらの攻撃を止めて待つ
    for (const f of state.fighters[0]) Object.assign(f, { wait: 9999, windup: 0, gauge: 0, fullAt: null });
    state.queue = state.queue.filter((q) => q.side !== 0);
    if (state.act?.side === 0) state.act = null;
    const off = until(state, (e) => e.t === "effect" && e.side === 1 && e.slot === hit.target && e.effect === "kyu" && !e.on, LIVE.effectTicks + 2);
    expect(off).toBeDefined();
  });

  it("からい子のあじ攻撃は、ひりひり（1秒ごとに減る）", () => {
    const state = createLive(tasted("habanero"), team("b"), "s", [false, false]);
    const hit = until(state, (e) => e.t === "hit" && e.side === 0 && e.kind === "aji" && !!e.effect);
    expect(hit && hit.t === "hit" && hit.effect).toBe("hiri");
    const burn = until(state, (e) => e.t === "burn" && e.side === 1, LIVE.burnEvery + 2);
    expect(burn && burn.t === "burn" && burn.damage).toBeGreaterThan(0);
  });

  it("うまい子のあじ攻撃は、減っている味方を回復する", () => {
    const state = createLive(tasted("soy"), team("b"), "s", [false, false]); // うまい
    state.fighters[0][1].hp = 10;
    for (const f of state.fighters[1]) f.wait = 9999; // 相手には殴らせない
    const heal = until(state, (e) => e.t === "heal" && e.side === 0);
    expect(heal && heal.t === "heal" && heal.slot).toBe(1);
    expect(state.fighters[0][1].hp).toBeGreaterThan(10);
  });

  it("ふくと効き目が取れる。拭いたあと少しは拭けない", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    state.fighters[0][0].effects = { hiri: 30, kyu: 30 };
    state.fighters[0][1].effects = { toro: 30 };
    const ev = stepLive(state, [{ side: 0, t: "wipe", slot: 0 }]);
    expect(ev).toContainEqual({ t: "wipe", side: 0, slot: 0 });
    expect(state.fighters[0][0].effects).toEqual({});
    stepLive(state, [{ side: 0, t: "wipe", slot: 1 }]);
    expect(state.fighters[0][1].effects.toro).toBeGreaterThan(0);
    for (let i = 0; i < LIVE.wipeWait; i++) stepLive(state);
    state.fighters[0][1].effects = { toro: 30 };
    stepLive(state, [{ side: 0, t: "wipe", slot: 1 }]);
    expect(state.fighters[0][1].effects).toEqual({});
  });

  it("技はゲージが満タンのときだけ出せて、ふつうの攻撃より強い。放っておくと勝手に出る", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    expect(stepLive(state, [{ side: 0, t: "move", slot: 0 }]).some((e) => e.t === "hit" && e.move)).toBe(false);
    const f = state.fighters[0][0];
    let normal = 0;
    while (f.gauge < LIVE.gaugeMax && state.winner === null) for (const e of stepLive(state)) if (e.t === "hit" && e.side === 0 && e.slot === 0) normal = Math.max(normal, e.damage);
    const fired = until(state, (e) => e.t === "hit" && e.side === 0 && !!e.move, 30, [{ side: 0, t: "move", slot: 0 }]);
    expect(fired && fired.t === "hit" && fired.damage).toBeGreaterThan(normal * 1.5);
    // もう一度満タンにして、今度は放っておく（ためるのを待つと試合が終わることがあるので、直接満たす）
    expect(state.winner).toBeNull();
    for (const x of state.fighters[1]) x.hp = x.maxHp;
    f.gauge = LIVE.gaugeMax;
    f.fullAt = state.tick;
    const auto = until(state, (e) => e.t === "hit" && e.side === 0 && e.slot === 0 && !!e.move, LIVE.autoMove + 30);
    expect(auto).toBeDefined();
  });

  it("攻撃は1つずつ：ためている子がいる間、ほかの子はために入らず、当たるのは1コマに1つまで", () => {
    const { log, state } = play(team("a"), team("b"), "s", [true, true]);
    expect(state.winner).not.toBeNull();
    // 1コマずつ並べ直して確かめる
    const s2 = createLive(team("a"), team("b"), "s", [true, true]);
    let last = -99;
    while (s2.winner === null) {
      const ev = stepLive(s2);
      expect(ev.filter((e) => e.t === "hit").length).toBeLessThanOrEqual(1);
      expect(ev.filter((e) => e.t === "windup").length).toBeLessThanOrEqual(1);
      expect(s2.fighters.flat().filter((f) => f.hp > 0 && f.windup > 0).length).toBeLessThanOrEqual(1);
      if (ev.some((e) => e.t === "hit")) {
        expect(s2.tick - last).toBeGreaterThanOrEqual(LIVE.recover);
        last = s2.tick;
      }
    }
    expect(log.some((e) => e.t === "hit")).toBe(true);
  });

  it("押した技は列に割り込み、今の攻撃が終わったら出る", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    const f = state.fighters[0][2];
    f.gauge = LIVE.gaugeMax;
    f.fullAt = state.tick;
    let waited = 0;
    const hit = until(state, (e) => { waited++; return e.t === "hit" && !!e.move; }, 30, [{ side: 0, t: "move", slot: 2 }]);
    expect(hit && hit.t === "hit" && hit.slot).toBe(2);
    expect(waited).toBeLessThanOrEqual(LIVE.windup + LIVE.recover + 1);
  });

  it("ねらっていた子が倒れたら、ねらうのをやめる", () => {
    const state = createLive(team("a"), team("b"), "s", [false, false]);
    stepLive(state, [{ side: 0, t: "aim", slot: 1 }]);
    state.fighters[1][1].hp = 1;
    const ev = until(state, (e) => e.t === "aim" && e.side === 0 && e.target === null);
    expect(ev).toBeDefined();
    expect(state.aim[0]).toBeNull();
  });

  it("CPU同士でも決着がつき、ほどよい長さで終わる（バランスの目安）", () => {
    let ticks = 0, ko = 0, aji = 0, karada = 0, effects = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const { state, log } = play(team("A" + i), team("B" + i), "s" + i, [true, true]);
      ticks += state.tick;
      if (state.reason === "ko") ko++;
      for (const e of log) {
        if (e.t === "hit") e.kind === "aji" ? aji++ : karada++;
        if (e.t === "effect" && e.on) effects++;
      }
      expect(remaining(state, 0) === 0 || remaining(state, 1) === 0 || state.reason === "time").toBe(true);
    }
    const sec = (ticks / n) * (LIVE.tickMs / 1000);
    console.log("平均", sec.toFixed(1), "秒", "KO率", (ko / n).toFixed(2), "からだ", karada, "あじ", aji, "効き目", (effects / n).toFixed(1), "回/試合");
    expect(sec).toBeGreaterThan(30);
    expect(sec).toBeLessThan(75);
    expect(ko / n).toBeGreaterThan(0.8);
    expect(aji / (aji + karada)).toBeGreaterThan(0.25); // あじ攻撃もちゃんと出る
  });
});
