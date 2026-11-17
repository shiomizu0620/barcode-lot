// バトルの進行中に画面をまたいで持つもの：相手、届いた挑戦状、えらんだチーム。

import { dailyChallenger, decodeTeam, encodeTeam, type Member } from "../core/battle";
import { FLAVORS } from "../core/product";
import { dateKey } from "../store/clock";
import { allLots, type Lot } from "../store/lots";
import { storedProfile } from "../store/profile";

export type Mode = "daily" | "letter" | "send";

export interface Opponent {
  kind: "daily" | "letter";
  title: string;
  members: Member[];
  code: string; // 対戦シード用
  date?: string; // 今日の挑戦者の日付
}

export const MAX_TEAM = 3;
export const keyOf = (lot: Lot) => `${lot.jan}:${lot.index}`;
export const memberOf = (lot: Lot): Member => ({ jan: lot.jan, lotSeed: lot.seed, profile: storedProfile(lot.jan) });

export function dailyOpponent(): Opponent {
  const date = dateKey();
  return { kind: "daily", title: "今日の挑戦者", members: dailyChallenger(date, FLAVORS.map((f) => f.id)), code: "daily:" + date, date };
}

// ---- 届いた挑戦状（タブを閉じるまで持つ） ----
const LETTER_KEY = "barcode-lot:letter";
const LETTER_DONE_KEY = "barcode-lot:letter-done";
let letterCode: string | null = null;
let letterDone = false;

/** URLの ?vs= の中身を受け取る。読めない中身なら false。 */
export function receiveLetter(code: string): boolean {
  if (!decodeTeam(code)) return false;
  try {
    sessionStorage.setItem(LETTER_KEY, code);
  } catch {
    /* 保存できなくても、開いている間は変数で持つ */
  }
  letterCode = code;
  letterDone = false;
  try {
    sessionStorage.removeItem(LETTER_DONE_KEY);
  } catch {
    /* noop */
  }
  return true;
}

export function pendingLetter(): Opponent | null {
  let code = letterCode;
  if (!code) {
    try {
      code = sessionStorage.getItem(LETTER_KEY);
    } catch {
      /* noop */
    }
  }
  const members = code ? decodeTeam(code) : null;
  return code && members ? { kind: "letter", title: "挑戦状の相手", members, code: "letter:" + code } : null;
}

export function clearLetter() {
  letterCode = null;
  letterDone = false;
  try {
    sessionStorage.removeItem(LETTER_KEY);
    sessionStorage.removeItem(LETTER_DONE_KEY);
  } catch {
    /* noop */
  }
}

/** 届いた挑戦状と、もう1回は戦ったか（バトルの印を消すため）。 */
export function letterFought(): boolean {
  if (letterDone) return true;
  try {
    return sessionStorage.getItem(LETTER_DONE_KEY) === "1";
  } catch {
    return false;
  }
}
export function markLetterFought() {
  letterDone = true;
  try {
    sessionStorage.setItem(LETTER_DONE_KEY, "1");
  } catch {
    /* noop */
  }
}

// ---- えらんだチーム ----
let picked: string[] = [];

/** 前にえらんだ順番（棚から消えたロットは除く）。 */
export function pickedLots(): Lot[] {
  const all = allLots();
  return picked.map((k) => all.find((l) => keyOf(l) === k)).filter((l): l is Lot => !!l);
}
export function setPicked(keys: string[]) {
  picked = keys;
}

// ---- これから再生する試合 ----
export interface Match {
  mode: Mode;
  opponent: Opponent;
  team: Member[];
}
let match: Match | null = null;
export const currentMatch = () => match;
export function setMatch(m: Match | null) {
  match = m;
}

/** 挑戦状のURL。 */
export function letterUrl(team: Member[]): string {
  return `${location.origin}${location.pathname}?vs=${encodeTeam(team)}`;
}

/** 挑戦状を送る（端末の共有、だめならコピー）。画面に出す文を返す。 */
export async function sendLetter(team: Member[]): Promise<string> {
  const url = letterUrl(team);
  try {
    if (navigator.share) {
      await navigator.share({ title: "挑戦状", text: "バーコードの子で挑戦状。3体で受けて立って", url });
      return "";
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return ""; // 自分でやめた
    /* 共有できない端末はコピーに回す */
  }
  try {
    await navigator.clipboard.writeText(url);
    return "挑戦状のURLをコピーしました。友達に送ってください。";
  } catch {
    return url;
  }
}
