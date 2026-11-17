// 「棚」：読んだキャラを品番ごとに並べる。同じ品番のロットは1つにまとめ、値札の画面で切り替える。

import { TASTE_RING } from "../../core/battle";
import type { Taste } from "../../core/creature";
import { arrived, byHinban, nextArrivalAt, remainingShort, type Hinban } from "../../store/lots";
import { on } from "../dom";
import { characterOfLot, characterSvg, TASTE_COLOR } from "../parts";
import type { View } from "../router";

const FILTER_FROM = 7; // これより品番が少ないうちは、絞り込みを出さない
let filter: Taste | null = null;

const COLUMNS = 3;

/** 棚の1マス。キャラが棚板に立ち、その下に値札（プライスカード）が下がる。 */
function slotHtml(h: Hinban): string {
  const c = characterOfLot(h.latest);
  const ready = arrived(h.jan);
  return `<li data-taste="${c.spec.taste}">
    <a class="slot" href="#/c/${h.jan}">
      <span class="thumb">${characterSvg(c)}${ready ? `<span class="seal" aria-hidden="true">入荷</span>` : ""}</span>
      <span class="shelf-tag" style="--taste:${TASTE_COLOR[c.spec.taste]}">
        <span class="shelf-tag-name">${c.spec.name}</span>
        <span class="shelf-tag-row"><span>${c.spec.taste}</span>${h.lots.length > 1 ? `<span aria-label="${h.lots.length}ロット">×${h.lots.length}</span>` : ""}</span>
        <span class="shelf-tag-next"${ready ? ' data-arrived="true"' : ""}>${ready ? "入荷あり" : `入荷まで${remainingShort(nextArrivalAt(h.jan))}`}</span>
      </span>
    </a>
  </li>`;
}

export const shelfView: View = ({ root }) => {
  const items = byHinban();
  if (items.length === 0) {
    root.innerHTML = `
      <section class="shelf">
        <h1 class="page-title">棚</h1>
        <div class="empty">
          <div class="empty-boards" aria-hidden="true"><span></span><span></span><span></span></div>
          <p>まだ空っぽです。</p>
          <a class="btn primary" href="#/">バーコードを読む</a>
        </div>
      </section>`;
    return;
  }

  const lotCount = items.reduce((n, h) => n + h.lots.length, 0);
  const tastes = TASTE_RING.filter((t) => items.some((h) => characterOfLot(h.latest).spec.taste === t));
  if (filter && !tastes.includes(filter)) filter = null;
  const showFilter = items.length >= FILTER_FROM && tastes.length > 1;

  root.innerHTML = `
    <section class="shelf">
      <div class="page-head">
        <h1 class="page-title">棚</h1>
        <p class="page-meta">${items.length}品番・${lotCount}ロット</p>
      </div>
      ${
        showFilter
          ? `<div class="filters" role="group" aria-label="味でしぼる">
               <button type="button" class="filter" data-taste="" aria-pressed="${filter === null}">すべて</button>
               ${tastes.map((t) => `<button type="button" class="filter" data-taste="${t}" aria-pressed="${filter === t}">${t}</button>`).join("")}
             </div>`
          : ""
      }
      <ul class="shelf-list">${items.map(slotHtml).join("")}${`<li class="shelf-blank" aria-hidden="true"></li>`.repeat((COLUMNS - (items.length % COLUMNS)) % COLUMNS)}</ul>
    </section>`;

  const list = root.querySelector(".shelf-list")!;
  const apply = () => {
    for (const li of list.children as HTMLCollectionOf<HTMLElement>) li.hidden = filter !== null && li.dataset.taste !== filter;
    list.classList.toggle("filtered", filter !== null);
    for (const b of root.querySelectorAll<HTMLElement>(".filter")) b.setAttribute("aria-pressed", String((b.dataset.taste || null) === filter));
  };
  apply();
  on(root, "click", ".filter", (b) => {
    filter = (b.dataset.taste || null) as Taste | null;
    apply();
  });
};
