// 生まれる：番号を確かめ、中身を調べ、ロットを記録して、値札の画面へ進む。途中で止めない（読んだらすぐ変身）。

import { normalize } from "../core/ean";
import { beep } from "../device/reader";
import { scan, type ScanResult } from "../store/lots";
import { getProfile } from "../store/profile";
import { navigate } from "./router";

let busy = false;
let birth: ScanResult | null = null;

/** いま生まれたばかりのロットなら、その読み取り結果を1回だけ渡す（変身演出を出す合図）。 */
export function takeBirth(jan: string, index: number): ScanResult | null {
  if (!birth || birth.lot.jan !== jan || birth.lot.index !== index) return null;
  const b = birth;
  birth = null;
  return b;
}

/** どうやって番号を得たか。typed＝数字を打った・試し番号（バーコードを読んでいない）。 */
export type Via = "read" | "typed";

/** 読んだ番号からキャラを生む。say は進み具合とエラーの表示先。 */
export async function hatch(raw: string, via: Via, say: (text: string, tone?: "info" | "error") => void): Promise<void> {
  if (busy) return;
  const jan = normalize(raw);
  if (!jan) {
    say("バーコードの数字として正しくありません。13桁（または8桁・12桁）を確かめてください。", "error");
    return;
  }
  busy = true;
  try {
    say("商品を調べています");
    beep();
    await getProfile(jan); // 中身が分かれば端末に残る。分からなくても先へ進む
    birth = scan(jan, { typed: via === "typed" });
    navigate(`/c/${jan}/${birth.lot.index}`);
  } finally {
    busy = false;
  }
}
