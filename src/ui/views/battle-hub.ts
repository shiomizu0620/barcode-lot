// 「バトル」の入口：今日の挑戦者、挑戦状、味の輪。

import { dailyResult } from "../../store/daily";
import { allLots } from "../../store/lots";
import { clearLetter, dailyOpponent, letterFought, pendingLetter } from "../battle-session";
import { on } from "../dom";
import { foeStageHtml, tasteChainHtml } from "../parts";
import { refresh, type View } from "../router";

const DAILY_STAMP = { win: "勝ち", lose: "負け", draw: "引き分け" } as const;

export const battleHubView: View = ({ root }) => {
  const hasTeam = allLots().length > 0;
  const daily = dailyOpponent();
  const letter = pendingLetter();
  const result = dailyResult(daily.date!);
  const [, month, day] = daily.date!.split("-").map(Number);

  const fought = letterFought();
  const start = (href: string, label: string) => (hasTeam ? `<a class="btn primary" href="${href}">${label}</a>` : `<a class="btn primary" href="#/">まず1体生む</a>`);

  root.innerHTML = `
    <section class="hub">
      <h1 class="page-title">バトル</h1>

      ${
        letter
          ? `<article class="letter">
               <h2 class="letter-spine">挑戦状</h2>
               <div class="letter-body">
                 ${fought ? `<span class="stamp">対戦ずみ</span>` : ""}
                 ${foeStageHtml(letter.members)}
                 <div class="letter-actions">
                   ${start("#/battle/letter", fought ? "もう一度戦う" : "受けて立つ")}
                   <button type="button" id="letter-drop" class="btn">${fought ? "片付ける" : "受けない"}</button>
                 </div>
               </div>
             </article>`
          : ""
      }

      <article class="flyer">
        <header class="flyer-head">
          <h2>今日の挑戦者</h2>
          <p class="flyer-date"><b>${month}/${day}</b>限り</p>
        </header>
        <div class="flyer-body">
          ${result ? `<span class="stamp">${DAILY_STAMP[result]}</span>` : ""}
          ${foeStageHtml(daily.members)}
          ${start("#/battle/daily", result ? "もう一度挑む" : "チームを組んで挑む")}
        </div>
      </article>

      ${hasTeam ? `<a class="btn hub-send" href="#/battle/send">友達に挑戦状を送る</a>` : ""}

      <div class="aisho">
        <h2>味の輪</h2>
        ${tasteChainHtml()}
        <p>▶ の先の味には1.5倍。逆向きは0.75倍。</p>
      </div>
    </section>`;

  on(root, "click", "#letter-drop", () => {
    clearLetter();
    refresh();
  });
};
