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

/** 上手い人：相性が良くて減っている相手をねらい、効き目はすぐ拭き、技はねらった相手に効くときに押す。 */
const skilled: Player = (s) => {
  const out: LiveInput[] = [];
  const mine = s.fighters[0].filter(alive);
  const foes = s.fighters[1].filter(alive);
  if (!foes.length) return out;
  // ねらう：こちら全員から見た相性の合計 × 減り具合
  const value = (t: LiveFighter) => mine.reduce((a, f) => a + mult(matchup(f.spec.taste, t.spec.taste)), 0) * (2 - t.hp / t.maxHp);
  const best = foes.sort((a, b) => value(b) - value(a))[0];
  if (s.aim[0] !== best.slot) out.push({ side: 0, t: "aim", slot: best.slot });
  for (const f of mine) {
    if (f.gauge >= LIVE.gaugeMax && matchup(f.spec.taste, best.spec.taste) !== "weak") out.push({ side: 0, t: "move", slot: f.slot });
  }
  // 拭く：効き目がいちばん多い味方
  if (s.wipeWait[0] === 0) {
    const stained = mine.filter((f) => Object.keys(f.effects).length).sort((a, b) => Object.keys(b.effects).length - Object.keys(a.effects).length);
    if (stained.length) out.push({ side: 0, t: "wipe", slot: stained[0].slot });
  }
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
