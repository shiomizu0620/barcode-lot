// 試合の結果。レジのレシートで出す（自動の試合と、手を出せる試合の両方で使う）。

import type { Member } from "../core/battle";
import { sendLetter, type Mode } from "./battle-session";
import { $ } from "./dom";
import { navigate } from "./router";

/** 置いておく枠（はじめは隠れている）。 */
export function receiptHtml(): string {
  return `
    <div class="receipt" hidden>
      <div class="receipt-paper">
        <p class="receipt-title"></p>
        <p class="receipt-sub"></p>
        <dl class="receipt-lines"></dl>
        <div class="receipt-actions">
          <button type="button" class="btn primary receipt-again">チームを組み直す</button>
          <button type="button" class="btn receipt-letter">挑戦状を送る</button>
          <a class="btn" href="#/battle">バトルへもどる</a>
        </div>
        <p class="receipt-msg" role="status"></p>
      </div>
    </div>`;
}

export interface Result {
  winner: 0 | 1 | -1; // 0＝こちらの勝ち
  sub: string;
  lines: [string, string][];
  mode: Mode;
  team: Member[];
}

export function showReceipt(root: HTMLElement, r: Result) {
  const el = $(".receipt", root);
  el.dataset.win = String(r.winner);
  $(".receipt-title", el).textContent = r.winner === 0 ? "勝ち！" : r.winner === 1 ? "負け……" : "引き分け";
  $(".receipt-sub", el).textContent = r.sub;
  $(".receipt-lines", el).innerHTML = r.lines.map(([k, v]) => `<div><dt>${k}</dt><span class="leader" aria-hidden="true"></span><dd>${v}</dd></div>`).join("");
  $(".receipt-again", el).addEventListener("click", () => navigate(`/battle/${r.mode}`, { replace: true }));
  $(".receipt-letter", el).addEventListener("click", async () => {
    $(".receipt-msg", el).textContent = await sendLetter(r.team);
  });
  el.hidden = false;
  document.body.classList.add("battle-done");
  $<HTMLButtonElement>(".receipt-again", el).focus({ preventScroll: true });
}

/** 画面を離れるときに呼ぶ。 */
export function clearReceipt() {
  document.body.classList.remove("battle-done");
}
