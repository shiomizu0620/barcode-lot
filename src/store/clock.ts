// アプリ内の時刻。試作用に「時間を1日すすめる」ができるよう、ずらし幅を端末に持つ。
// ロットの入荷も、今日の挑戦者の日付も、ここの時刻で決める。

import { readJson, removeKey, writeJson } from "./storage";

const OFFSET_KEY = "barcode-lot:debug-offset";
export const DAY = 24 * 60 * 60 * 1000;

const offset = () => Number(readJson<number>(OFFSET_KEY, 0)) || 0;

export function now(): number {
  return Date.now() + offset();
}

export function advanceDays(days: number) {
  writeJson(OFFSET_KEY, offset() + days * DAY);
}

export function resetClock() {
  removeKey(OFFSET_KEY);
}

/** 端末の時計での日付（例 2026-11-15）。今日の挑戦者の切り替わりに使う。 */
export function dateKey(t = now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
