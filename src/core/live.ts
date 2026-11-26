// 手を出せるバトル（リアルタイム）。0.1秒ごとに1コマ進み、そのコマに届いた操作を反映する。
// 同じチーム・同じ種・同じ操作の列なら、必ず同じ試合になる。
// 画面にも通信にも触れないので、あとで対戦用のサーバーでもそのまま動かせる。
//
// 決まり（くわしくは docs/battle-plan.md）：
// - 3体とも自分の間隔（キレが高いほど短い）で攻撃する。攻撃の前に「ため」（0.4秒）があり、画面に見える
// - 攻撃は2種類。「からだ」（体当たり。濃さで強くなる）と「あじ」（味のしぶき。香りで強くなり、味ごとの効き目が付く）
//   濃さが高い子は「からだ型」、香りが高い子は「あじ型」で、得意なほうをよく使う
// - どちらの攻撃も、相手の誰にでも当たる（先頭はない）
// - 操作：「ねらう」（相手をタップすると、こちらの攻撃がその子に集まる）、
//         「ふく」（効き目が付いた味方を拭いて取る。拭いたあと少し待つ）、
//         「技」（ゲージが満タンなら撃てる。放っておくと少しして勝手に出る）

import { lineUp, matchup, RING_REASON, type BattleEvent, type Fighter, type Member } from "./battle";
import type { Taste } from "./creature";
import { Rng } from "./rng";

// ---- 調整用の数値（ここだけ触ればバランスが変わる） ----
export const LIVE = {
  tickMs: 100, // 1コマの長さ
  timeLimit: 900, // 90秒で時間切れ（残りの量の割合で判定）
  karadaScale: 0.17, // からだ攻撃の強さ
  ajiScale: 0.13, // あじ攻撃の強さ（効き目が付くぶん弱め）
  defenseBase: 100, // 守り：ダメージ × base / (base + コク)
  strong: 1.5,
  weak: 0.75,
  jitter: [0.9, 1.1] as const,
  intervalBase: 30, // 攻撃の間隔（コマ）＝ base − キレ × perKire
  intervalPerKire: 0.16,
  windup: 4, // 攻撃の前の「ため」（0.4秒）
  typeBias: 1.12, // 濃さと香りの片方がもう片方のこれ倍以上なら「型」になる
  typeShare: 0.75, // 型の子が、得意なほうの攻撃を選ぶ割合
  gaugeMax: 100,
  gaugeOnAttack: 11,
  gaugeOnHit: 5,
  moveMult: 3, // 技の威力（ふつうの攻撃の何倍か）
  autoMove: 50, // 技のゲージが満タンのまま放っておくと、これだけたって勝手に出る（5秒）
  // 味ごとの効き目
  effectTicks: 40, // 効き目の長さ（4秒）。かかり直すと最初から
  slowRate: 1.5, // とろける：攻撃の間隔がこれだけ延びる
  burnEvery: 10, // ひりひり：1秒ごとに減る
  burnRate: 0.35, // ひりひり：1回で、当たったときのダメージのこれだけ
  defDown: 0.7, // きゅっ：守りがこれだけになる
  atkDown: 0.72, // しぶい：濃さと香りがこれだけになる
  healRate: 0.6, // うまみ：与えたダメージのこれだけ、いちばん減っている味方が回復する
  wipeWait: 40, // ふいたあと、次に拭けるまで（4秒）
  // CPU（今日の挑戦者）のくせ。強すぎると、何もしない人がまったく勝てなくなる
  cpuFire: [35, 60] as const, // 技が満タンになってから出すまで（コマ）
  cpuWipe: [15, 35] as const, // 味方に効き目が付いてから拭くまで（コマ）
  cpuPickRandom: 0.4, // 攻撃の相手を、考えずに選ぶ割合
};

export type Kind = "karada" | "aji";
export type Style = Kind | "both";
/** 味ごとの効き目（うまみは回復なので、付く効き目ではない）。 */
export type Effect = "toro" | "hiri" | "kyu" | "shibu" | "nodo";

export const EFFECT_OF: Record<Taste, Effect | "umami"> = {
  あまい: "toro",
  からい: "hiri",
  すっぱい: "kyu",
  にがい: "shibu",
  しょっぱい: "nodo",
  うまい: "umami",
};
export const EFFECT_LABEL: Record<Effect | "umami", string> = {
  toro: "とろける",
  hiri: "ひりひり",
  kyu: "きゅっ",
  shibu: "しぶい",
  nodo: "のどがかわく",
  umami: "うまみ",
};

export interface LiveFighter extends Fighter {
  style: Style; // 得意な攻撃
  interval: number; // 攻撃の間隔（コマ）
  wait: number; // 次の「ため」に入るまでの残り（コマ）
  slowAcc: number; // とろけているときの、間隔の進みの端数
  windup: number; // ための残り（コマ）。0 ならためていない
  windupKind: Kind;
  windupTarget: number;
  gauge: number; // 技のゲージ（0〜gaugeMax）
  fullAt: number | null; // 技のゲージが満タンになったコマ
  effects: Partial<Record<Effect, number>>; // 効き目と、残りのコマ
  burn: number; // ひりひりで1回に減る量
}

/** CPUの考えごと。 */
interface CpuMind {
  fireAt: (number | null)[];
  wipeAt: number | null;
}

export interface LiveState {
  tick: number;
  fighters: LiveFighter[][];
  aim: [number | null, number | null]; // 各チームが「ねらう」相手（slot）
  wipeWait: [number, number]; // 次に拭けるまでの残り（コマ）
  winner: 0 | 1 | -1 | null; // null＝試合中、-1＝引き分け
  reason: "ko" | "time" | null;
  setup: BattleEvent[]; // 試合前の効果（組み合わせ技、そろい踏み）
  rng: Rng;
  cpu: [CpuMind | null, CpuMind | null];
}

export type LiveInput =
  | { side: 0 | 1; t: "aim"; slot: number | null } // 相手のこの子をねらう（null でやめる）
  | { side: 0 | 1; t: "wipe"; slot: number } // 味方のこの子の効き目を拭く
  | { side: 0 | 1; t: "move"; slot: number }; // この子の技を出す

export type LiveEvent =
  | { t: "windup"; side: 0 | 1; slot: number; target: number; kind: Kind } // ために入った
  | { t: "hit"; side: 0 | 1; slot: number; target: number; kind: Kind; damage: number; hpAfter: number; match: "strong" | "weak" | "even"; move?: string; reason?: string; effect?: Effect }
  | { t: "heal"; side: 0 | 1; slot: number; amount: number; hpAfter: number } // うまみの回復
  | { t: "burn"; side: 0 | 1; slot: number; damage: number; hpAfter: number } // ひりひりで減った
  | { t: "effect"; side: 0 | 1; slot: number; effect: Effect; on: boolean } // 効き目が付いた・消えた
  | { t: "wipe"; side: 0 | 1; slot: number } // 拭いた
  | { t: "aim"; side: 0 | 1; target: number | null } // ねらう相手が変わった
  | { t: "ready"; side: 0 | 1; slot: number } // 技のゲージが満タンになった
  | { t: "down"; side: 0 | 1; slot: number }
  | { t: "end"; winner: 0 | 1 | -1; reason: "ko" | "time" };

const alive = (f: LiveFighter | undefined): f is LiveFighter => !!f && f.hp > 0;
const mult = (m: "strong" | "weak" | "even") => (m === "strong" ? LIVE.strong : m === "weak" ? LIVE.weak : 1);

/** 濃さと香りのどちらが得意か。 */
export function styleOf(koi: number, kaori: number): Style {
  if (koi >= kaori * LIVE.typeBias) return "karada";
  if (kaori >= koi * LIVE.typeBias) return "aji";
  return "both";
}

/** 技の種類（型の子は得意なほう、どちらもの子は強いほう）。 */
const moveKind = (f: LiveFighter): Kind => (f.style === "both" ? (f.atk >= f.spa ? "karada" : "aji") : f.style);

/** 試合を用意する。cpu[side] が true のチームは、CPUが操作する。 */
export function createLive(teamA: Member[], teamB: Member[], seed: string, cpu: [boolean, boolean] = [false, true]): LiveState {
  const rng = new Rng("live:" + seed);
  const { fighters, events } = lineUp(teamA, teamB);
  const live = fighters.map((team) =>
    team.map((f): LiveFighter => {
      const interval = Math.max(8, Math.round(LIVE.intervalBase - f.spd * LIVE.intervalPerKire));
      return {
        ...f,
        style: styleOf(f.atk, f.spa),
        interval,
        wait: 6 + rng.int(0, interval), // 出だしをばらけさせる
        slowAcc: 0,
        windup: 0,
        windupKind: "karada",
        windupTarget: 0,
        gauge: 0,
        fullAt: null,
        effects: {},
        burn: 0,
      };
    }),
  );
  const mind = (side: 0 | 1): CpuMind | null => (cpu[side] ? { fireAt: live[side].map(() => null), wipeAt: null } : null);
  return { tick: 0, fighters: live, aim: [null, null], wipeWait: [0, 0], winner: null, reason: null, setup: events, rng, cpu: [mind(0), mind(1)] };
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
    if (f.effects.nodo) return; // のどがかわくと、技のゲージがたまらない
    const was = f.gauge;
    f.gauge = Math.min(LIVE.gaugeMax, f.gauge + n);
    if (was < LIVE.gaugeMax && f.gauge >= LIVE.gaugeMax) {
      f.fullAt = state.tick;
      events.push({ t: "ready", side: f.side, slot: f.slot });
    }
  };

  /** 倒れたかを見て、倒れていたら片付ける。 */
  const checkDown = (target: LiveFighter, by: 0 | 1) => {
    if (target.hp > 0 || state.winner !== null) return;
    target.effects = {};
    target.windup = 0;
    events.push({ t: "down", side: target.side, slot: target.slot });
    // ねらっていた相手が倒れたら、ねらうのをやめる
    if (state.aim[by] === target.slot) {
      state.aim[by] = null;
      events.push({ t: "aim", side: by, target: null });
    }
    if (!fighters[target.side].some(alive)) finish(by, "ko");
  };

  const setEffect = (f: LiveFighter, e: Effect) => {
    const had = !!f.effects[e];
    f.effects[e] = LIVE.effectTicks;
    if (!had) events.push({ t: "effect", side: f.side, slot: f.slot, effect: e, on: true });
  };

  /** 攻撃の相手を決める。ねらう相手がいればその子、いなければ相性と残りを見て（ときどき考えずに）選ぶ。 */
  const pickTarget = (f: LiveFighter): number | null => {
    const foe = (1 - f.side) as 0 | 1;
    const foes = fighters[foe].filter(alive);
    if (!foes.length) return null;
    const aimed = state.aim[f.side];
    if (aimed !== null && alive(fighters[foe][aimed])) return aimed;
    if (rng.next() < (state.cpu[f.side] ? LIVE.cpuPickRandom : 0.5)) return rng.pick(foes).slot;
    const score = (t: LiveFighter) => mult(matchup(f.spec.taste, t.spec.taste)) * (2 - t.hp / t.maxHp) + rng.next() * 0.05;
    return foes.sort((a, b) => score(b) - score(a))[0].slot;
  };

  const chooseKind = (f: LiveFighter): Kind => {
    if (f.style === "both") return rng.next() < 0.5 ? "karada" : "aji";
    const other: Kind = f.style === "karada" ? "aji" : "karada";
    return rng.next() < LIVE.typeShare ? f.style : other;
  };

  const strike = (f: LiveFighter, targetSlot: number, kind: Kind, move: boolean) => {
    const foe = (1 - f.side) as 0 | 1;
    const target = fighters[foe][targetSlot];
    if (!alive(target)) return;
    const m = matchup(f.spec.taste, target.spec.taste);
    const jitter = LIVE.jitter[0] + (LIVE.jitter[1] - LIVE.jitter[0]) * rng.next();
    const weaken = f.effects.shibu ? LIVE.atkDown : 1;
    const power = (kind === "karada" ? f.atk * LIVE.karadaScale : f.spa * LIVE.ajiScale) * weaken;
    const def = target.def * (target.effects.kyu ? LIVE.defDown : 1);
    const raw = power * mult(m) * jitter * (LIVE.defenseBase / (LIVE.defenseBase + def));
    const damage = Math.max(1, Math.round(raw * (move ? LIVE.moveMult : 1)));
    target.hp = Math.max(0, target.hp - damage);
    const effect = kind === "aji" ? EFFECT_OF[f.spec.taste] : null;
    events.push({
      t: "hit", side: f.side, slot: f.slot, target: target.slot, kind, damage, hpAfter: target.hp, match: m,
      ...(move ? { move: f.spec.move } : {}),
      ...(m === "strong" ? { reason: RING_REASON[f.spec.taste] } : {}),
      ...(effect && effect !== "umami" && target.hp > 0 ? { effect } : {}),
    });
    if (!move) addGauge(f, LIVE.gaugeOnAttack);
    // あじ攻撃の効き目
    if (effect === "umami") {
      const low = fighters[f.side].filter(alive).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (low && low.hp < low.maxHp) {
        const amount = Math.min(low.maxHp - low.hp, Math.max(1, Math.round(damage * LIVE.healRate)));
        low.hp += amount;
        events.push({ t: "heal", side: low.side, slot: low.slot, amount, hpAfter: low.hp });
      }
    } else if (effect && target.hp > 0) {
      setEffect(target, effect);
      if (effect === "hiri") target.burn = Math.max(1, Math.round(raw * LIVE.burnRate));
    }
    if (target.hp > 0) addGauge(target, LIVE.gaugeOnHit);
    checkDown(target, f.side);
  };

  /** 技を出す（押したとき・放っておいて勝手に出るとき）。 */
  const fireMove = (f: LiveFighter) => {
    const target = pickTarget(f);
    f.gauge = 0;
    f.fullAt = null;
    if (target !== null) strike(f, target, moveKind(f), true);
  };

  // 1) 操作（CPUのぶんも同じ形で足す）
  const all = [...inputs];
  for (const side of [0, 1] as const) if (state.cpu[side]) all.push(...think(state, side));
  for (const input of all) {
    if (state.winner !== null) break;
    if (input.t === "aim") {
      const foe = fighters[1 - input.side];
      const next = input.slot !== null && alive(foe[input.slot]) ? input.slot : null;
      if (state.aim[input.side] !== next) {
        state.aim[input.side] = next;
        events.push({ t: "aim", side: input.side, target: next });
      }
      continue;
    }
    const f = fighters[input.side]?.[input.slot];
    if (!alive(f)) continue;
    if (input.t === "wipe") {
      const had = Object.keys(f.effects) as Effect[];
      if (state.wipeWait[input.side] > 0 || !had.length) continue;
      f.effects = {};
      state.wipeWait[input.side] = LIVE.wipeWait;
      events.push({ t: "wipe", side: f.side, slot: f.slot });
      for (const e of had) events.push({ t: "effect", side: f.side, slot: f.slot, effect: e, on: false });
    } else if (f.gauge >= LIVE.gaugeMax) {
      fireMove(f);
    }
  }

  // 1') 満タンのまま放っておかれた技は、勝手に出る
  for (const team of fighters) {
    for (const f of team) {
      if (state.winner !== null) break;
      if (alive(f) && f.fullAt !== null && state.tick - f.fullAt >= LIVE.autoMove) fireMove(f);
    }
  }

  // 2) ふつうの攻撃：ため → 当たる。同じコマに重なったら、キレの高い順
  for (const side of [0, 1] as const) if (state.wipeWait[side] > 0) state.wipeWait[side]--;
  const ready: { f: LiveFighter; k: number }[] = [];
  for (const team of fighters) {
    for (const f of team) {
      if (!alive(f) || state.winner !== null) continue;
      if (f.windup > 0) {
        if (--f.windup === 0) ready.push({ f, k: f.spd + rng.next() });
        continue;
      }
      // とろけていると、間隔の進みが遅い
      if (f.effects.toro) {
        f.slowAcc += 1 / LIVE.slowRate;
        if (f.slowAcc < 1) continue;
        f.slowAcc -= 1;
      }
      if (--f.wait <= 0) {
        const target = pickTarget(f);
        if (target === null) continue;
        f.windup = LIVE.windup;
        f.windupKind = chooseKind(f);
        f.windupTarget = target;
        events.push({ t: "windup", side: f.side, slot: f.slot, target, kind: f.windupKind });
      }
    }
  }
  ready.sort((a, b) => b.k - a.k);
  for (const { f } of ready) {
    if (state.winner !== null) break;
    if (!alive(f)) continue;
    f.wait = Math.max(1, f.interval - LIVE.windup); // ためのぶんを引いて、攻撃の間隔は変えない
    // ためている間に相手が倒れていたら、ほかの子へ
    const target = alive(fighters[1 - f.side][f.windupTarget]) ? f.windupTarget : pickTarget(f);
    if (target !== null) strike(f, target, f.windupKind, false);
  }

  // 3) 効き目：ひりひりで減る。時間がたつと消える
  for (const team of fighters) {
    for (const f of team) {
      if (!alive(f) || state.winner !== null) continue;
      if (f.effects.hiri && f.effects.hiri % LIVE.burnEvery === 0) {
        f.hp = Math.max(0, f.hp - f.burn);
        events.push({ t: "burn", side: f.side, slot: f.slot, damage: f.burn, hpAfter: f.hp });
        checkDown(f, (1 - f.side) as 0 | 1);
        if (!alive(f)) continue;
      }
      for (const e of Object.keys(f.effects) as Effect[]) {
        if (--f.effects[e]! <= 0) {
          delete f.effects[e];
          events.push({ t: "effect", side: f.side, slot: f.slot, effect: e, on: false });
        }
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
  const out: LiveInput[] = [];

  // 技：満タンになってから少し間をおいて出す（人が先に動ける余地）
  for (const f of team) {
    if (!alive(f) || f.gauge < LIVE.gaugeMax) {
      mind.fireAt[f.slot] = null;
      continue;
    }
    const at = (mind.fireAt[f.slot] ??= state.tick + state.rng.int(LIVE.cpuFire[0], LIVE.cpuFire[1]));
    if (state.tick >= at) out.push({ side, t: "move", slot: f.slot });
  }

  // 拭く：効き目が付いた味方がいたら、少しして拭く（いちばん効き目が多い子）
  const stained = team.filter((f) => alive(f) && Object.keys(f.effects).length > 0);
  if (!stained.length || state.wipeWait[side] > 0) mind.wipeAt = null;
  else {
    mind.wipeAt ??= state.tick + state.rng.int(LIVE.cpuWipe[0], LIVE.cpuWipe[1]);
    if (state.tick >= mind.wipeAt) {
      const worst = stained.sort((a, b) => Object.keys(b.effects).length - Object.keys(a.effects).length || a.hp / a.maxHp - b.hp / b.maxHp)[0];
      out.push({ side, t: "wipe", slot: worst.slot });
      mind.wipeAt = null;
    }
  }
  return out;
}
