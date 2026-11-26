// 「値札」：キャラ1体の画面。生まれた直後は変身演出つき、棚から開いたときは完成形だけ。

import { drawStill, playMorph } from "../../art/morph";
import { strongAgainst, weakAgainst } from "../../core/battle";
import { STAT_LABEL, type Stats } from "../../core/creature";
import { KIND_LABEL } from "../../core/ean";
import { arrived, lotNumber, lotsOf, nextArrivalAt, remainingText, type Lot, type ScanResult } from "../../store/lots";
import { $, reducedMotion } from "../dom";
import { storedProfile } from "../../store/profile";
import { takeBirth } from "../hatch";
import { barcodeSvg, characterOfLot, tasteChip, type Character } from "../parts";
import { navigate, type View } from "../router";
import { openShareSheet } from "../share-image";

// 能力がバトルで何になるか
const STAT_ROLE: Record<keyof Stats, string> = { naiyo: "体力", koi: "からだ攻撃", kaori: "あじ攻撃", kire: "素早さ", koku: "守り" };

function statusText(res: ScanResult): string {
  if (!res.isNew) return "前と同じロットです";
  return res.total === 1 ? "はじめての品番です" : "新しいロットが入荷しました";
}

function tagHtml({ spec, look }: Character, lot: Lot, res: ScanResult | null): string {
  const fam = spec.family === "cute" ? "かわいい" : "かっこいい";
  // メーカー番号から推測した中身は、言い切らずに「っぽい」と書く（外れることがあるため）
  const guessed = storedProfile(spec.jan)?.source === "maker";
  const flavor = spec.flavorLabel
    ? `${spec.flavorLabel}${guessed ? "っぽい商品" : ""}から生まれた、${fam}系`
    : `${spec.palette.name}色の${fam}系（商品の中身は不明）`;
  const stats = (Object.keys(STAT_LABEL) as (keyof Stats)[])
    .map((k) => {
      const v = look.stats[k];
      const diff = v - spec.base[k];
      const d = diff === 0 ? "±0" : diff > 0 ? `+${diff}` : `${diff}`;
      return `<div class="stat"><dt>${STAT_LABEL[k]}<small>${STAT_ROLE[k]}</small></dt><span class="leader" aria-hidden="true"></span><dd><span class="v">${v}</span><span class="d" data-sign="${Math.sign(diff)}">品番より${d}</span></dd></div>`;
    })
    .join("");
  return `
    <article class="tag">
      <div class="tag-hole" aria-hidden="true"></div>
      ${res ? `<p class="tag-status" data-new="${res.isNew}">${statusText(res)}</p>` : ""}
      <div class="tag-head">${tasteChip(spec.taste)}<span class="tag-kind">${KIND_LABEL[spec.kind]}</span></div>
      <h1 class="tag-name">${spec.name}</h1>
      <p class="tag-flavor">${flavor}</p>
      <p class="tag-move">技 <b>${spec.move}</b></p>
      <p class="tag-ring">${strongAgainst(spec.taste)}に強く、${weakAgainst(spec.taste)}に弱い</p>
      <dl class="tag-stats">${stats}</dl>
      <div class="tag-foot">
        <div class="tag-code">${barcodeSvg(spec.jan)}<span class="digits">${spec.jan}</span></div>
        <p class="tag-lot">ロット ${lotNumber(lot)}（この品番の${lot.index}体目）${lot.typed ? `<span class="typed-mark" title="バーコードを読まずに、数字を打って生んだ子">手入力</span>` : ""}</p>
      </div>
    </article>`;
}

function arrivalHtml(lot: Lot, lots: Lot[]): string {
  const others =
    lots.length > 1
      ? `<p class="arrival-label">この品番のロット（${lots.length}体）</p>
         <div class="lot-list">${lots
           .map((l) => `<a class="chip" href="#/c/${l.jan}/${l.index}"${l.index === lot.index ? ' aria-current="true"' : ""}>${lotNumber(l)}</a>`)
           .join("")}</div>`
      : "";
  const next = arrived(lot.jan)
    ? `<p class="arrival-next" data-arrived="true"><b>入荷しています。</b>もう一度読むと、新しいロットに会えます。</p>`
    : `<p class="arrival-next">次の入荷まで <b>${remainingText(nextArrivalAt(lot.jan))}</b></p>`;
  return `<div class="arrival">${others}${next}</div>`;
}

export const tagView: View = ({ root, params }) => {
  const [jan, index] = params;
  const lots = lotsOf(jan);
  const lot = index ? lots[Number(index) - 1] : lots[lots.length - 1];
  if (!lot) {
    navigate("/shelf", { replace: true });
    return;
  }
  const character = characterOfLot(lot);
  const res = takeBirth(lot.jan, lot.index);

  root.innerHTML = `
    <section class="stage">
      <a class="back" href="#/shelf">棚へ</a>
      <div class="morph"></div>
      ${tagHtml(character, lot, res)}
      ${arrivalHtml(lot, lots)}
      <div class="result-actions">
        <a class="btn primary" href="#/">もう1個読む</a>
        <button type="button" id="save" class="btn">画像にする</button>
      </div>
    </section>`;

  $("#save", root).addEventListener("click", () => openShareSheet(character, lot));

  const host = $(".morph", root);
  if (!res) {
    drawStill(host, character.spec, character.look);
    return;
  }
  // 生まれた直後：変身のあいだ値札は隠し、終わったら出す
  document.body.classList.add("morphing");
  let gone = false;
  playMorph(host, character.spec, character.look, reducedMotion()).then(() => {
    document.body.classList.remove("morphing");
    if (!gone) $<HTMLElement>(".result-actions .btn", root).focus({ preventScroll: true });
  });
  return () => {
    gone = true;
    document.body.classList.remove("morphing");
  };
};
