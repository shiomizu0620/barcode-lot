// 手を出せるバトル（リアルタイム）。0.1秒ごとに1コマ進み、そのコマに届いた操作を反映する。
// 同じチーム・同じ種・同じ操作の列なら、必ず同じ試合になる。
// 画面にも通信にも触れないので、あとで対戦用のサーバーでもそのまま動かせる。
//
// 決まり：
// - 3体とも自分の間隔（キレが高いほど短い）で攻撃する。当たるのは相手の「先頭」
// - 先頭は入れ替えられる（入れ替えたあと少しの間は替えられない）。控えは少しずつ回復する
// - 攻撃したり受けたりすると技のゲージがたまり、満タンなら好きな時に技を出せる

import { lineUp, matchup, RING_REASON, type BattleEvent, type Fighter, type Member } from "./battle";
import { Rng } from "./rng";

// ---- 調整用の数値（ここだけ触ればバランスが変わる） ----
export const LIVE = {
  tickMs: 100, // 1コマの長さ
  timeLimit: 900, // 90秒で時間切れ（残りの量の割合で判定）
  damageScale: 0.17,
  defenseBase: 100, // 守り：ダメージ × base / (base + コク)
  strong: 1.5,
  weak: 0.75,
  jitter: [0.9, 1.1] as const,
  intervalBase: 30, // 攻撃の間隔（コマ）＝ base − キレ × perKire
  intervalPerKire: 0.16,
  swapWait: 30, // 入れ替えたあと、次に替えられるまで（3秒）
  gaugeMax: 100,
  gaugeOnAttack: 11,
  gaugeOnHit: 5,
  moveMult: 3, // 技の威力（ふつうの攻撃の何倍か）
  regenEvery: 10, // 控えの回復の間隔（1秒）
  regenRate: 0.012, // 1回で、満タンの量の1.2%
};

export interface LiveFighter extends Fighter {
  interval: number; // 攻撃の間隔（コマ）
  wait: number; // 次の攻撃までの残り（コマ）
  gauge: number; // 技のゲージ（0〜gaugeMax）
}

/** CPUの考えごと（技を出すまでの間、次に入れ替えを考える時刻）。 */
interface CpuMind {
  fireAt: (number | null)[];
  nextLook: number;
}

export interface LiveState {
  tick: number;
  fighters: LiveFighter[][];
  front: [number, number]; // 各チームの先頭（slot）
  swapWait: [number, number]; // 入れ替えられるまでの残り（コマ）
  winner: 0 | 1 | -1 | null; // null＝試合中、-1＝引き分け
  reason: "ko" | "time" | null;
  setup: BattleEvent[]; // 試合前の効果（組み合わせ技、そろい踏み）
  rng: Rng;
  cpu: [CpuMind | null, CpuMind | null];
}

export type LiveInput =
  | { side: 0 | 1; t: "front"; slot: number } // この体を先頭にする
  | { side: 0 | 1; t: "move"; slot: number }; // この体の技を出す

export type LiveEvent =
  | { t: "hit"; side: 0 | 1; slot: number; target: number; damage: number; hpAfter: number; match: "strong" | "weak" | "even"; move?: string; reason?: string }
  | { t: "front"; side: 0 | 1; slot: number; forced: boolean } // forced＝先頭が倒れて繰り上がった
  | { t: "ready"; side: 0 | 1; slot: number } // 技のゲージが満タンになった
  | { t: "down"; side: 0 | 1; slot: number }
  | { t: "end"; winner: 0 | 1 | -1; reason: "ko" | "time" };

const alive = (f: LiveFighter | undefined): f is LiveFighter => !!f && f.hp > 0;
const mult = (m: "strong" | "weak" | "even") => (m === "strong" ? LIVE.strong : m === "weak" ? LIVE.weak : 1);

/** 試合を用意する。cpu[side] が true のチームは、CPUが操作する。 */
export function createLive(teamA: Member[], teamB: Member[], seed: string, cpu: [boolean, boolean] = [false, true]): LiveState {
  const rng = new Rng("live:" + seed);
  const { fighters, events } = lineUp(teamA, teamB);
  const live = fighters.map((team) =>
    team.map((f): LiveFighter => {
      const interval = Math.max(8, Math.round(LIVE.intervalBase - f.spd * LIVE.intervalPerKire));
      return { ...f, interval, wait: 6 + rng.int(0, interval), gauge: 0 }; // 出だしをばらけさせる
    }),
  );
  const mind = (side: 0 | 1): CpuMind | null => (cpu[side] ? { fireAt: live[side].map(() => null), nextLook: 10 } : null);
  return { tick: 0, fighters: live, front: [0, 0], swapWait: [0, 0], winner: null, reason: null, setup: events, rng, cpu: [mind(0), mind(1)] };
}

/** 1コマ進める。state を書き換え、このコマで起きたことを返す。 */
export function stepLive(state: LiveState, inputs: LiveInput[] = []): LiveEvent[] {
  if (state.winner !== null) return [];
  state.tick++;
  const events: LiveEvent[] = [];
  const { fighters, rng } = state;

  const finish = (winner: 0 | 1 | -1, reason: "ko" | "time") => {
    state.winner = winner;
    state.reason = reason;
    events.push({ t: "end", winner, reason });
  };

  const addGauge = (f: LiveFighter, n: number) => {
    const was = f.gauge;
    f.gauge = Math.min(LIVE.gaugeMax, f.gauge + n);
    if (was < LIVE.gaugeMax && f.gauge >= LIVE.gaugeMax) events.push({ t: "ready", side: f.side, slot: f.slot });
  };

  const strike = (f: LiveFighter, move: boolean) => {
    const foe = (1 - f.side) as 0 | 1;
    const target = fighters[foe][state.front[foe]];
    if (!alive(target)) return;
    const m = matchup(f.spec.taste, target.spec.taste);
    const jitter = LIVE.jitter[0] + (LIVE.jitter[1] - LIVE.jitter[0]) * rng.next();
    const base = f.atk * LIVE.damageScale * mult(m) * jitter * (LIVE.defenseBase / (LIVE.defenseBase + target.def));
    const damage = Math.max(1, Math.round(base * (move ? LIVE.moveMult : 1)));
    target.hp = Math.max(0, target.hp - damage);
    events.push({
      t: "hit", side: f.side, slot: f.slot, target: target.slot, damage, hpAfter: target.hp, match: m,
      ...(move ? { move: f.spec.move } : {}),
      ...(m === "strong" ? { reason: RING_REASON[f.spec.taste] } : {}),
    });
    if (!move) addGauge(f, LIVE.gaugeOnAttack);
    if (target.hp > 0) {
      addGauge(target, LIVE.gaugeOnHit);
      return;
    }
    events.push({ t: "down", side: foe, slot: target.slot });
    const next = fighters[foe].find(alive);
    if (!next) {
      finish(f.side, "ko");
      return;
    }
    state.front[foe] = next.slot;
    events.push({ t: "front", side: foe, slot: next.slot, forced: true });
  };

  // 1) 操作（CPUのぶんも同じ形で足す）
  const all = [...inputs];
  for (const side of [0, 1] as const) if (state.cpu[side]) all.push(...think(state, side));
  for (const input of all) {
    if (state.winner !== null) break;
    const f = fighters[input.side]?.[input.slot];
    if (!alive(f)) continue;
    if (input.t === "front") {
      if (state.front[input.side] === f.slot || state.swapWait[input.side] > 0) continue;
      state.front[input.side] = f.slot;
      state.swapWait[input.side] = LIVE.swapWait;
      events.push({ t: "front", side: input.side, slot: f.slot, forced: false });
    } else if (f.gauge >= LIVE.gaugeMax) {
      f.gauge = 0;
      strike(f, true);
    }
  }

  // 2) ふつうの攻撃。同じコマに重なったら、キレの高い順
  for (const side of [0, 1] as const) if (state.swapWait[side] > 0) state.swapWait[side]--;
  const ready: { f: LiveFighter; k: number }[] = [];
  for (const team of fighters) {
    for (const f of team) {
      if (!alive(f)) continue;
      if (--f.wait <= 0) ready.push({ f, k: f.spd + rng.next() });
    }
  }
  ready.sort((a, b) => b.k - a.k);
  for (const { f } of ready) {
    if (state.winner !== null) break;
    if (!alive(f)) continue;
    f.wait = f.interval;
    strike(f, false);
  }

  // 3) 控えは少しずつ回復する
  if (state.winner === null && state.tick % LIVE.regenEvery === 0) {
    for (const side of [0, 1] as const) {
      for (const f of fighters[side]) {
        if (alive(f) && f.slot !== state.front[side]) f.hp = Math.min(f.maxHp, f.hp + Math.max(1, Math.round(f.maxHp * LIVE.regenRate)));
      }
    }
  }

  // 4) 時間切れ：残りの量の割合で判定
  if (state.winner === null && state.tick >= LIVE.timeLimit) {
    const rate = (s: 0 | 1) => fighters[s].reduce((a, f) => a + f.hp / f.maxHp, 0);
    const a = rate(0), b = rate(1);
    finish(Math.abs(a - b) < 1e-9 ? -1 : a > b ? 0 : 1, "time");
  }
  return events;
}

/** 残りの量の合計（ml）。 */
export function remaining(state: LiveState, side: 0 | 1): number {
  return state.fighters[side].reduce((a, f) => a + f.hp, 0);
}

// ---- CPUの操作 ----
function think(state: LiveState, side: 0 | 1): LiveInput[] {
  const mind = state.cpu[side]!;
  const team = state.fighters[side];
  const foes = state.fighters[1 - side].filter(alive);
  const foeFront = state.fighters[1 - side][state.front[1 - side]];
  const out: LiveInput[] = [];
  if (!alive(foeFront)) return out;

  // 技：満タンになってから少し間をおいて出す（人が先に動ける余地）。相性が悪い相手には、さらに少し待つ
  for (const f of team) {
    if (!alive(f) || f.gauge < LIVE.gaugeMax) {
      mind.fireAt[f.slot] = null;
      continue;
    }
    const at = (mind.fireAt[f.slot] ??= state.tick + state.rng.int(15, 45)); // 1.5〜4.5秒おいてから
    if (state.tick < at) continue;
    if (matchup(f.spec.taste, foeFront.spec.taste) !== "weak" || state.tick >= at + 25) out.push({ side, t: "move", slot: f.slot });
  }

  // 入れ替え：ときどき見直す。残りが多く、相手の味に強い体を先頭にする
  if (state.swapWait[side] === 0 && state.tick >= mind.nextLook) {
    mind.nextLook = state.tick + state.rng.int(25, 45);
    const score = (f: LiveFighter) => {
      const incoming = foes.reduce((a, e) => a + mult(matchup(e.spec.taste, f.spec.taste)), 0) / foes.length;
      return f.hp / f.maxHp - 0.45 * incoming + (f.slot === state.front[side] ? 0.12 : 0);
    };
    const front = team[state.front[side]];
    const best = team.filter(alive).sort((a, b) => score(b) - score(a))[0];
    if (best && alive(front) && best !== front && score(best) - score(front) > 0.32) out.push({ side, t: "front", slot: best.slot });
  }
  return out;
}
