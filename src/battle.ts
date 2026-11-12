// バトルの計算。3体対3体の自動バトル。
// 同じ入力（両チーム＋シード）なら必ず同じ結果になる。挑戦状URLでも同じ試合が再生される。

import { lotLook, specFor, type LotLook, type Spec, type Taste } from "./creature";
import type { ProductProfile } from "./product";
import { Rng } from "./rng";

// ---- 調整用の数値（ここだけ触ればバランスが変わる） ----
export const TUNE = {
  hpPerNaiyo: 3, // 内容量1あたりの体力（ml）
  damageScale: 1.7,
  defenseBase: 100, // 守り：ダメージ × base / (base + コク)
  strong: 1.5, // 相性で有利
  weak: 0.75, // 相性で不利
  comboAtk: 1.25, // 組み合わせ技に入った体の攻撃倍率
  trioDef: 1.2, // 3体とも同じ味のときの守り倍率
  maxRounds: 12,
  jitter: [0.9, 1.1] as const,
};

// 味の輪：それぞれ次の味に強い
const RING: Taste[] = ["あまい", "からい", "うまい", "すっぱい", "にがい", "しょっぱい"];
const RING_REASON: Record<Taste, string> = {
  あまい: "甘さが辛さをまろやかにした",
  からい: "辛さがうまみをかき消した",
  うまい: "うまみが酸味を包みこんだ",
  すっぱい: "酸味が苦みをさっぱり流した",
  にがい: "苦みが塩気を押さえこんだ",
  しょっぱい: "塩気が甘さを引きしめた",
};

export function matchup(att: Taste, def: Taste): "strong" | "weak" | "even" {
  const i = RING.indexOf(att), j = RING.indexOf(def);
  if ((i + 1) % RING.length === j) return "strong";
  if ((j + 1) % RING.length === i) return "weak";
  return "even";
}

// ---- 組み合わせ技（買い合わせ） ----
export interface Combo {
  id: string;
  name: string;
  flavors: string[][]; // それぞれの枠に入れる味（どれか1つ）。2枠なら2体の組み合わせ
}

export const COMBOS: Combo[] = [
  { id: "banshaku", name: "晩酌コンボ", flavors: [["beer"], ["salty", "seaweed", "soy", "miso"]] },
  { id: "oyatsu", name: "おやつタイム", flavors: [["coffee", "blacktea", "greentea", "matcha"], ["chocolate", "sweets", "strawberry"]] },
  { id: "junk", name: "ジャンクの誘惑", flavors: [["cola", "soda"], ["salty", "noodle"]] },
  { id: "maroyaka", name: "まろやか救済", flavors: [["curry", "habanero", "wasabi"], ["milk", "sweets"]] },
  { id: "ichigomilk", name: "いちごミルク", flavors: [["strawberry"], ["milk"]] },
  { id: "squash", name: "レモンスカッシュ", flavors: [["lemon", "citrus"], ["soda", "water"]] },
  { id: "onigiri", name: "おにぎり定食", flavors: [["seaweed"], ["miso", "soy", "noodle", "greentea"]] },
  { id: "fruits", name: "フルーツポンチ", flavors: [["grape", "muscat", "peach", "melon", "apple", "pineapple"], ["grape", "muscat", "peach", "melon", "apple", "pineapple", "citrus", "lemon", "soda"]] },
];

export interface Member {
  jan: string;
  lotSeed: string;
  profile?: ProductProfile;
}

export interface Fighter {
  side: 0 | 1;
  slot: number;
  spec: Spec;
  look: LotLook;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export type BattleEvent =
  | { t: "combo"; side: 0 | 1; name: string; slots: number[] }
  | { t: "trio"; side: 0 | 1; taste: Taste }
  | { t: "round"; n: number }
  | { t: "hit"; side: 0 | 1; slot: number; target: number; move: string; damage: number; hpAfter: number; match: "strong" | "weak" | "even"; reason?: string }
  | { t: "down"; side: 0 | 1; slot: number }
  | { t: "end"; winner: 0 | 1 | -1; reason: "ko" | "judge" };

export interface BattleResult {
  fighters: Fighter[][]; // 開始時点の状態（hpは満タン）
  events: BattleEvent[];
  winner: 0 | 1 | -1;
}

function makeFighter(m: Member, side: 0 | 1, slot: number): Fighter {
  const spec = specFor(m.jan, m.profile);
  const look = lotLook(spec, m.lotSeed);
  const hp = look.stats.naiyo * TUNE.hpPerNaiyo;
  return { side, slot, spec, look, maxHp: hp, hp, atk: look.stats.koi, def: look.stats.koku, spd: look.stats.kire };
}

function findCombos(team: Fighter[]): { combo: Combo; slots: number[] }[] {
  const out: { combo: Combo; slots: number[] }[] = [];
  for (const c of COMBOS) {
    // 2枠の組み合わせ。別々の体で満たす
    for (const a of team) {
      if (!a.spec.flavor || !c.flavors[0].includes(a.spec.flavor)) continue;
      const b = team.find((x) => x !== a && x.spec.flavor && c.flavors[1].includes(x.spec.flavor));
      if (b) {
        out.push({ combo: c, slots: [a.slot, b.slot] });
        break;
      }
    }
  }
  return out;
}

export function simulate(teamA: Member[], teamB: Member[], seed: string): BattleResult {
  const r = new Rng("battle:" + seed);
  const fighters: Fighter[][] = [teamA.map((m, i) => makeFighter(m, 0, i)), teamB.map((m, i) => makeFighter(m, 1, i))];
  const events: BattleEvent[] = [];

  // 試合前の効果
  for (const side of [0, 1] as const) {
    const team = fighters[side];
    for (const { combo, slots } of findCombos(team)) {
      for (const s of slots) team[s].atk = Math.round(team[s].atk * TUNE.comboAtk);
      events.push({ t: "combo", side, name: combo.name, slots });
    }
    if (team.length === 3 && team.every((f) => f.spec.taste === team[0].spec.taste)) {
      for (const f of team) f.def = Math.round(f.def * TUNE.trioDef);
      events.push({ t: "trio", side, taste: team[0].spec.taste });
    }
  }

  const snapshot = fighters.map((t) => t.map((f) => ({ ...f })));
  const alive = (side: 0 | 1) => fighters[side].filter((f) => f.hp > 0);
  let winner: 0 | 1 | -1 = -1;
  let reason: "ko" | "judge" = "judge";

  for (let n = 1; n <= TUNE.maxRounds && winner === -1; n++) {
    events.push({ t: "round", n });
    const order = [...fighters[0], ...fighters[1]]
      .filter((f) => f.hp > 0)
      .map((f) => ({ f, k: f.spd + r.next() }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.f);
    for (const f of order) {
      if (f.hp <= 0) continue;
      const foe = (1 - f.side) as 0 | 1;
      const target = alive(foe)[0];
      if (!target) break;
      const m = matchup(f.spec.taste, target.spec.taste);
      const mult = m === "strong" ? TUNE.strong : m === "weak" ? TUNE.weak : 1;
      const jitter = TUNE.jitter[0] + (TUNE.jitter[1] - TUNE.jitter[0]) * r.next();
      const dmg = Math.max(5, Math.round(f.atk * TUNE.damageScale * mult * jitter * (TUNE.defenseBase / (TUNE.defenseBase + target.def))));
      target.hp = Math.max(0, target.hp - dmg);
      events.push({
        t: "hit", side: f.side, slot: f.slot, target: target.slot, move: f.spec.move, damage: dmg, hpAfter: target.hp, match: m,
        ...(m === "strong" ? { reason: RING_REASON[f.spec.taste] } : {}),
      });
      if (target.hp === 0) {
        events.push({ t: "down", side: foe, slot: target.slot });
        if (alive(foe).length === 0) {
          winner = f.side;
          reason = "ko";
          break;
        }
      }
    }
  }
  if (winner === -1) {
    // 判定：残り体力の割合
    const rate = (s: 0 | 1) => fighters[s].reduce((a, f) => a + f.hp / f.maxHp, 0);
    const a = rate(0), b = rate(1);
    winner = Math.abs(a - b) < 1e-9 ? -1 : a > b ? 0 : 1;
  }
  events.push({ t: "end", winner, reason });
  return { fighters: snapshot, events, winner };
}

// ---- 今日の挑戦者（CPU） ----
export function dailyChallenger(dateKey: string, flavorIds: string[]): Member[] {
  const r = new Rng("daily:" + dateKey);
  return [0, 1, 2].map(() => {
    let first12 = "49";
    for (let i = 0; i < 10; i++) first12 += r.int(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
    const jan = first12 + ((10 - (sum % 10)) % 10);
    return { jan, lotSeed: `cpu:${dateKey}:${r.int(1, 9999)}`, profile: { flavor: r.pick(flavorIds), source: "none" } };
  });
}

// ---- 挑戦状（URL） ----
export function encodeTeam(team: Member[]): string {
  const raw = team.map((m) => [m.jan, m.lotSeed, m.profile?.flavor ?? ""].join("~")).join("|");
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeTeam(code: string): Member[] | null {
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const raw = decodeURIComponent(escape(atob(b64)));
    const team = raw.split("|").map((p) => {
      const [jan, lotSeed, flavor] = p.split("~");
      if (!/^\d{13}$/.test(jan) || !lotSeed) throw new Error("bad");
      return { jan, lotSeed, profile: flavor ? { flavor, source: "none" as const } : undefined };
    });
    return team.length >= 1 && team.length <= 3 ? team : null;
  } catch {
    return null;
  }
}
