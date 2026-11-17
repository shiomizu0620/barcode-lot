// 今日の挑戦者との結果（端末内）。その日の分だけ持つ。

import { readJson, removeKey, writeJson } from "./storage";

const KEY = "barcode-lot:daily:v1";

export type DailyResult = "win" | "lose" | "draw";
interface Saved {
  date: string;
  result: DailyResult;
}

export function dailyResult(date: string): DailyResult | undefined {
  const s = readJson<Saved | null>(KEY, null);
  return s && s.date === date ? s.result : undefined;
}

/** 一度勝った日は、あとで負けても「勝ち」のまま残す。 */
export function recordDaily(date: string, result: DailyResult) {
  if (dailyResult(date) === "win") return;
  writeJson(KEY, { date, result } satisfies Saved);
}

export function resetDaily() {
  removeKey(KEY);
}
