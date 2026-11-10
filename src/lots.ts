// ロットの記録（試作では端末内に保存）。
// 同じ商品から新しいロットが出るのは、前のロットから「消費サイクル」の日数が経ってから。

import type { CodeKind } from "./ean";

const KEY = "barcode-lot:lots:v1";
const OFFSET_KEY = "barcode-lot:debug-offset";
const DAY = 24 * 60 * 60 * 1000;

export interface Lot {
  jan: string;
  index: number; // その商品の何体目か（1始まり）
  createdAt: number;
  seed: string;
}

export interface ScanResult {
  lot: Lot;
  isNew: boolean;
  total: number;
  nextAt: number; // 次のロットが出る時刻
}

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

let memory: Record<string, Lot[]> = {};

function load(): Record<string, Lot[]> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw);
  } catch {
    /* 保存できない環境ではメモリだけで動かす */
  }
  return memory;
}
function save(data: Record<string, Lot[]>) {
  memory = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* noop */
  }
}

export function now(): number {
  let off = 0;
  try {
    off = Number(localStorage.getItem(OFFSET_KEY) || 0);
  } catch {
    /* noop */
  }
  return Date.now() + off;
}

export function advanceDays(days: number) {
  try {
    const off = Number(localStorage.getItem(OFFSET_KEY) || 0) + days * DAY;
    localStorage.setItem(OFFSET_KEY, String(off));
  } catch {
    /* noop */
  }
}

export function resetAll() {
  memory = {};
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(OFFSET_KEY);
  } catch {
    /* noop */
  }
}

export function lotNumber(lot: Lot): string {
  const d = new Date(lot.createdAt);
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `L${yy}${mm}${dd}-${String(lot.index).padStart(3, "0")}`;
}

export function scan(jan: string, kind: CodeKind): ScanResult {
  const data = load();
  const list = data[jan] ?? [];
  const t = now();
  const cycle = cycleDays(kind) * DAY;
  const last = list[list.length - 1];
  if (!last || t - last.createdAt >= cycle) {
    const lot: Lot = { jan, index: list.length + 1, createdAt: t, seed: `${list.length + 1}:${Math.floor(t / DAY)}` };
    list.push(lot);
    data[jan] = list;
    save(data);
    return { lot, isNew: true, total: list.length, nextAt: t + cycle };
  }
  return { lot: last, isNew: false, total: list.length, nextAt: last.createdAt + cycle };
}

export function allLots(): Lot[] {
  const data = load();
  return Object.values(data)
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt);
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
