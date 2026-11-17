// 手を出せるバトルの釣り合いを測る（npm run balance）。
// 遊ぶ人の3つの型で、今日の挑戦者（CPU）とたくさん戦わせて、勝率と試合の長さを出す。
// 目安は docs/battle-plan.md の「数値の調整」。

import { matchup, type Member } from "../src/core/battle";
import { withCheck } from "../src/core/ean";
import { createLive, LIVE, stepLive, type LiveFighter, type LiveInput, type LiveState } from "../src/core/live";
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

type Player = (s: LiveState) => LiveInput[];
const alive = (f: LiveFighter) => f.hp > 0;
const mult = (m: string) => (m === "strong" ? LIVE.strong : m === "weak" ? LIVE.weak : 1);

/** 何もしない。 */
const idle: Player = () => [];

/** 技がたまったらすぐ押すだけ。 */
const masher: Player = (s) => s.fighters[0].filter((f) => alive(f) && f.gauge >= LIVE.gaugeMax).map((f) => ({ side: 0, t: "move", slot: f.slot }));

/** 上手い人：ためを見て、効きにくい体で受ける。技は相手の先頭に効くときに押す。 */
const skilled: Player = (s) => {
  const out: LiveInput[] = [];
  const mine = s.fighters[0];
  const foeFront = s.fighters[1][s.front[1]];
  for (const f of mine) {
    if (alive(f) && f.gauge >= LIVE.gaugeMax && matchup(f.spec.taste, foeFront.spec.taste) !== "weak") out.push({ side: 0, t: "move", slot: f.slot });
  }
  if (s.swapWait[0] > 0) return out;
  const winding = s.fighters[1].filter((e) => alive(e) && e.windup > 0);
  // 受ける側の点：これから来る攻撃に効きにくく、残りが多いほど高い
  const score = (f: LiveFighter) => {
    const attackers = winding.length ? winding : s.fighters[1].filter(alive);
    const incoming = attackers.reduce((a, e) => a + mult(matchup(e.spec.taste, f.spec.taste)), 0) / attackers.length;
    return f.hp / f.maxHp - 0.6 * incoming;
  };
  const front = mine[s.front[0]];
  const best = mine.filter(alive).sort((a, b) => score(b) - score(a))[0];
  if (best && best !== front && score(best) - score(front) > 0.2) out.push({ side: 0, t: "front", slot: best.slot });
  return out;
};

// 数値を試しに変えて測るとき：LIVE_TRY='{"cpuFire":[35,60]}' npx vite-node scripts/balance.ts
if (process.env.LIVE_TRY) Object.assign(LIVE, JSON.parse(process.env.LIVE_TRY));
const N = Number(process.argv[2] ?? 1000);
for (const [name, player] of [["何もしない", idle], ["技だけ押す", masher], ["上手い人", skilled]] as const) {
  let win = 0, time = 0;
  const secs: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = createLive(team("A" + i), team("B" + i), "s" + i, [false, true]);
    while (s.winner === null) stepLive(s, player(s));
    if (s.winner === 0) win++;
    if (s.reason === "time") time++;
    secs.push((s.tick * LIVE.tickMs) / 1000);
  }
  secs.sort((a, b) => a - b);
  console.log(`${name}：勝率 ${Math.round((win / N) * 100)}%／試合の長さ 中央値 ${secs[N >> 1].toFixed(0)}秒／時間切れ ${Math.round((time / N) * 100)}%`);
}
