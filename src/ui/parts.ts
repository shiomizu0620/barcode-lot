// 複数の画面で使う部品（HTML文字列を返す）。

import { renderCharacter } from "../art/render";
import { TASTE_RING, type Member } from "../core/battle";
import { lotLook, specFor, type LotLook, type Spec, type Taste } from "../core/creature";
import { bars } from "../core/ean";
import type { ProductProfile } from "../core/product";
import type { Lot } from "../store/lots";
import { storedProfile } from "../store/profile";

/** 味ごとの札の色。キャラの体色とは別で、味を見分けるためだけに使う。 */
export const TASTE_COLOR: Record<Taste, string> = {
  あまい: "#F9B5C8",
  からい: "#F0685A",
  うまい: "#E9C68C",
  すっぱい: "#F2EE6B",
  にがい: "#9FCB86",
  しょっぱい: "#BFE4F2",
};

export interface Character {
  spec: Spec;
  look: LotLook;
}

export function characterOf(jan: string, lotSeed: string, profile?: ProductProfile): Character {
  const spec = specFor(jan, profile);
  return { spec, look: lotLook(spec, lotSeed) };
}

/** 棚にいるロットのキャラ（端末に残した商品プロフィールで決める）。 */
export const characterOfLot = (lot: Lot): Character => characterOf(lot.jan, lot.seed, storedProfile(lot.jan));

export const characterSvg = (c: Character): string => renderCharacter(c.spec, c.look).svg;

/** 味の表示。売り場の色分けのように、色の四角＋文字で出す。 */
export function tasteChip(taste: Taste): string {
  return `<span class="taste"><i style="background:${TASTE_COLOR[taste]}"></i>${taste}</span>`;
}

export function barcodeSvg(jan: string): string {
  const rects = bars(jan)
    .map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="${b.guard ? 26 : 22}"/>`)
    .join("");
  return `<svg class="mini-code" viewBox="0 0 95 26" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

/** 味の輪を1行の並びで出す。▶ の先の味に強い。最後は最初に戻る。 */
export function tasteChainHtml(): string {
  const arrow = `<i class="chain-arrow" aria-hidden="true">▶</i>`;
  const label = TASTE_RING.map((t, i) => `${t}は${TASTE_RING[(i + 1) % TASTE_RING.length]}に強い`).join("、");
  return `<p class="chain" role="img" aria-label="味の輪：${label}">${TASTE_RING.map(tasteChip).join(arrow)}${arrow}<span class="chain-loop">${TASTE_RING[0]}へ戻る</span></p>`;
}

/** 相手チームの並び（棚板の上に立つ）。左が先頭。 */
export function foeStageHtml(members: Member[]): string {
  return `<ol class="foe-stage" aria-label="あいてのチーム（左が先頭）">${members
    .map((m) => {
      const c = characterOf(m.jan, m.lotSeed, m.profile);
      return `<li class="foe"><span class="thumb">${characterSvg(c)}</span><span class="foe-name">${c.spec.name}</span>${tasteChip(c.spec.taste)}</li>`;
    })
    .join("")}</ol>`;
}
