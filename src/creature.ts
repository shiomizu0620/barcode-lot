// キャラの決まり方。
// 品番（JAN）で姿・縞・味・技が決まり、全国共通で変わらない。
// ロットで表情・色味・ポーズ・能力の伸びが少しだけ変わる。

import { Rng } from "./rng";
import { kindOf, type CodeKind } from "./ean";
import { flavorById, type ProductProfile } from "./product";

export type Taste = "あまい" | "しょっぱい" | "すっぱい" | "にがい" | "からい" | "うまい";
export type Family = "cute" | "cool";

export interface Palette {
  name: string;
  body: string;
  shade: string;
}

const PALETTES: Record<Taste, Palette[]> = {
  あまい: [
    { name: "いちごミルク", body: "#F6B3C7", shade: "#D9728F" },
    { name: "はちみつ", body: "#FFD36B", shade: "#D99A2B" },
    { name: "ぶどう", body: "#C3AAEC", shade: "#7F5FC0" },
  ],
  しょっぱい: [
    { name: "しお", body: "#E6EDF2", shade: "#9AAAB8" },
    { name: "うすくち", body: "#F0D7B0", shade: "#BF935D" },
    { name: "うめ", body: "#F2A0A6", shade: "#C9525E" },
  ],
  すっぱい: [
    { name: "レモン", body: "#F2EE6B", shade: "#B7AE25" },
    { name: "ラムネ", body: "#9BDCF5", shade: "#3E97CB" },
    { name: "ライム", body: "#B9E58A", shade: "#6BAE34" },
  ],
  にがい: [
    { name: "抹茶", body: "#9FCB86", shade: "#4F8A40" },
    { name: "コーヒー", body: "#8C6B56", shade: "#4E382A" },
    { name: "夜", body: "#4A5178", shade: "#262A47" },
  ],
  からい: [
    { name: "とうがらし", body: "#EF5D4E", shade: "#A92D24" },
    { name: "カレー", body: "#F3A63D", shade: "#BE6A12" },
    { name: "わさび", body: "#C5E07A", shade: "#7FA02C" },
  ],
  うまい: [
    { name: "だし", body: "#E9C68C", shade: "#AE8443" },
    { name: "しょうゆ", body: "#A65E40", shade: "#62301D" },
    { name: "のり", body: "#3F6E5C", shade: "#203F33" },
  ],
};

const TASTES: Taste[] = ["あまい", "しょっぱい", "すっぱい", "にがい", "からい", "うまい"];

const MOVES: Record<Taste, string[]> = {
  あまい: ["とろけるハグ", "シュガーコート", "ふわふわ包み"],
  しょっぱい: ["ひとつまみ", "しおからスプラッシュ", "うす塩ガード"],
  すっぱい: ["キュッと酸っぱ", "炭酸はじけ", "ビネガーショット"],
  にがい: ["深煎りの目覚め", "大人の一撃", "ほろにがバリア"],
  からい: ["激辛ストレート", "ひりひり連打", "火吹きスパイス"],
  うまい: ["だし巻きタックル", "うまみ爆発", "とろみロック"],
};

// 名前の音。「〜モン」系にならないよう、モは入れない。
const HEAD = ["ピ", "ポ", "ラ", "ム", "ネ", "コ", "ザ", "ギ", "バ", "ル", "ド", "メ", "キ", "ト", "リ", "ス", "ノ", "パ", "ジ", "ク", "フ", "ヌ", "チ", "ガ"];
const MID = ["ル", "ロ", "ッ", "ン", "ラ", "リ", "パ", "ム", "ボ", "シ", "ズ", "タ"];
const TAIL = ["コ", "ル", "ポ", "ン", "チ", "ス", "ロ", "ブ", "ド", "ナ", "ジ", "ゴ"];

export interface Spec {
  jan: string;
  flavor?: string; // 商品の中身から決まった味（Flavor.id）。分からなければ無し
  flavorLabel?: string;
  kind: CodeKind;
  name: string;
  taste: Taste;
  family: Family;
  palette: Palette;
  move: string;
  body: { w: number; h: number; n: number; taper: number };
  ears: "round" | "antenna" | "leaf" | "horn" | "blade" | "none";
  stripe: "belly" | "full" | "band" | "back";
  crest: "tuft" | "fan";
  eyes: "big" | "dot" | "smile" | "sharp" | "visor" | "slit";
  mouth: "w" | "open" | "o" | "line" | "fang" | "smirk";
  arms: boolean;
  base: Stats;
}

export interface Stats {
  naiyo: number; // 内容量
  koi: number; // 濃さ
  kire: number; // キレ
  koku: number; // コク
}

export const STAT_LABEL: Record<keyof Stats, string> = {
  naiyo: "内容量",
  koi: "濃さ",
  kire: "キレ",
  koku: "コク",
};

function makeName(r: Rng): string {
  const len = r.chance(0.55) ? 3 : 2;
  let s = r.pick(HEAD);
  if (len === 3) s += r.pick(MID);
  s += r.pick(TAIL);
  if (r.chance(0.18)) s += "ー";
  // 小さい「ッ」「ン」で終わらないように
  return s.replace(/[ッン]$/, "ル");
}

/**
 * 品番からキャラを決める。商品プロフィールがあれば、味・色・技をそちらで上書きする。
 * 乱数の引く順番は変えない（プロフィールの有無で他の部位が変わらないように）。
 */
export function specFor(jan: string, profile?: ProductProfile): Spec {
  const r = new Rng("hinban:" + jan);
  const family: Family = r.chance(0.5) ? "cute" : "cool";
  let taste = r.pick(TASTES);
  let palette = r.pick(PALETTES[taste]);
  const cute = family === "cute";
  const name = makeName(r);
  let move = r.pick(MOVES[taste]);
  const fl = flavorById(profile?.flavor);
  if (fl) {
    taste = fl.taste;
    palette = fl.palette;
    move = fl.moves[Number(jan[12]) % fl.moves.length];
  }
  return {
    jan,
    ...(fl ? { flavor: fl.id, flavorLabel: fl.label } : {}),
    kind: kindOf(jan),
    name,
    taste,
    family,
    palette,
    move,
    body: {
      w: r.range(cute ? 150 : 132, cute ? 176 : 160),
      h: r.range(cute ? 118 : 132, cute ? 142 : 156),
      n: cute ? r.range(2.1, 2.8) : r.range(3.2, 5.2),
      taper: r.range(-0.12, cute ? 0.16 : 0.08),
    },
    ears: cute ? r.pick(["round", "antenna", "leaf", "none"] as const) : r.pick(["horn", "blade", "none"] as const),
    stripe: r.pick(["belly", "full", "band", "back"] as const),
    crest: cute ? "tuft" : "fan",
    eyes: cute ? r.pick(["big", "dot", "smile"] as const) : r.pick(["sharp", "visor", "slit"] as const),
    mouth: cute ? r.pick(["w", "open", "o"] as const) : r.pick(["line", "fang", "smirk"] as const),
    arms: r.chance(0.6),
    base: {
      naiyo: r.int(40, 88),
      koi: r.int(40, 88),
      kire: r.int(40, 88),
      koku: r.int(40, 88),
    },
  };
}

export interface LotLook {
  hue: number; // 色味のずれ（度）
  tilt: number; // 首のかしげ方（度）
  sparkle: boolean; // キラ目
  blush: boolean;
  sticker: "none" | "star" | "dot";
  stats: Stats;
}

/** ロットの個体差。品番の姿は崩さず、小さな差だけ付ける。 */
export function lotLook(spec: Spec, lotSeed: string): LotLook {
  const r = new Rng("lot:" + spec.jan + ":" + lotSeed);
  const d = () => r.int(-8, 8);
  const clamp = (v: number) => Math.max(1, Math.min(99, v));
  return {
    hue: r.range(-9, 9),
    tilt: r.range(-6, 6),
    sparkle: r.chance(0.3),
    blush: spec.family === "cute" ? r.chance(0.85) : r.chance(0.25),
    sticker: r.chance(0.22) ? r.pick(["star", "dot"] as const) : "none",
    stats: {
      naiyo: clamp(spec.base.naiyo + d()),
      koi: clamp(spec.base.koi + d()),
      kire: clamp(spec.base.kire + d()),
      koku: clamp(spec.base.koku + d()),
    },
  };
}
