// ロットの記録（試作では端末内に保存）。
// 同じ商品から新しいロットが出るのは、前のロットから「消費サイクル」の日数が経ってから。

import { kindOf, type CodeKind } from "../core/ean";
import { DAY, now } from "./clock";
import { readJson, removeKey, writeJson } from "./storage";

const KEY = "barcode-lot:lots:v1";

export interface Lot {
  jan: string;
  index: number; // その商品の何体目か（1始まり）
  createdAt: number;
  seed: string;
  typed?: true; // 数字を打って（または試し番号で）生んだ。バーコードを読んでいない
}

export interface ScanResult {
  lot: Lot;
  isNew: boolean;
  total: number;
  nextAt: number; // 次のロットが出る時刻
}

/** 品番ごとのまとまり。棚はこの単位で並べる。 */
export interface Hinban {
  jan: string;
  lots: Lot[]; // 古い順
  latest: Lot;
}

type Book = Record<string, Lot[]>;
const load = () => readJson<Book>(KEY, {});

/** 試作ではカテゴリが取れないので、バーコードの種類でざっくり決める。 */
export function cycleDays(kind: CodeKind): number {
  switch (kind) {
    case "store":
      return 1; // 惣菜などはすぐ食べる
    case "magazine":
    case "book":
      return 7;
    default:
      return 3;
  }
}

const cycleOf = (jan: string) => cycleDays(kindOf(jan)) * DAY;

/** 読み取り1回ぶん。消費サイクルが過ぎていれば新しいロットを作り、まだなら前のロットを返す。 */
export function scan(jan: string, opts: { typed?: boolean } = {}): ScanResult {
  const data = load();
  const list = data[jan] ?? [];
  const t = now();
  const cycle = cycleOf(jan);
  const last = list[list.length - 1];
  if (!last || t - last.createdAt >= cycle) {
    const lot: Lot = { jan, index: list.length + 1, createdAt: t, seed: `${list.length + 1}:${Math.floor(t / DAY)}`, ...(opts.typed ? { typed: true as const } : {}) };
    list.push(lot);
    data[jan] = list;
    writeJson(KEY, data);
    return { lot, isNew: true, total: list.length, nextAt: t + cycle };
  }
  return { lot: last, isNew: false, total: list.length, nextAt: last.createdAt + cycle };
}

/** すべてのロット（新しい順）。 */
export function allLots(): Lot[] {
  return Object.values(load())
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** その品番のロット（古い順）。 */
export function lotsOf(jan: string): Lot[] {
  return load()[jan] ?? [];
}

/** 品番ごとにまとめる（最後に読んだ品番が先）。 */
export function byHinban(): Hinban[] {
  return Object.entries(load())
    .filter(([, lots]) => lots.length > 0)
    .map(([jan, lots]) => ({ jan, lots, latest: lots[lots.length - 1] }))
    .sort((a, b) => b.latest.createdAt - a.latest.createdAt);
}

/** その品番の次のロットが出る時刻。 */
export function nextArrivalAt(jan: string): number {
  const lots = lotsOf(jan);
  const last = lots[lots.length - 1];
  return last ? last.createdAt + cycleOf(jan) : now();
}

/** もう一度読めば新しいロットが出るか。 */
export function arrived(jan: string): boolean {
  return nextArrivalAt(jan) <= now();
}

export function resetLots() {
  removeKey(KEY);
}

export function lotNumber(lot: Lot): string {
  const d = new Date(lot.createdAt);
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `L${yy}${mm}${dd}-${String(lot.index).padStart(3, "0")}`;
}

export function remainingText(nextAt: number): string {
  const ms = nextAt - now();
  if (ms <= 0) return "入荷しました";
  const totalHours = Math.ceil(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `あと${hours}時間`;
  return hours > 0 ? `あと${days}日${hours}時間` : `あと${days}日`;
}

/** 棚の札に出す短い残り時間（例「2日」「5時間」）。 */
export function remainingShort(nextAt: number): string {
  const hours = Math.max(1, Math.ceil((nextAt - now()) / (60 * 60 * 1000)));
  return hours >= 24 ? `${Math.ceil(hours / 24)}日` : `${hours}時間`;
}
