// キャラと値札を1枚の画像（1080×1350のPNG）にして、保存用のシートで見せる。

import { bars } from "../core/ean";
import { lotNumber, type Lot } from "../store/lots";
import { $ } from "./dom";
import { characterSvg, type Character } from "./parts";

async function draw({ spec, look }: Character, lot: Lot): Promise<string> {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  try {
    await Promise.all([document.fonts.load('80px "Dela Gothic One"'), document.fonts.load('36px "Zen Kaku Gothic New"')]);
  } catch {
    /* フォントが無くても描く */
  }
  ctx.fillStyle = "#F3F5F2";
  ctx.fillRect(0, 0, W, H);
  // キャラ
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(characterSvg({ spec, look }));
  await img.decode();
  ctx.drawImage(img, 120, 40, 840, 840);
  // 値札
  const tx = 90, ty = 860, tw = 900, th = 420;
  ctx.fillStyle = "#FFD83D";
  ctx.strokeStyle = "#1D1D22";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 36);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1D1D22";
  ctx.font = '96px "Dela Gothic One", sans-serif';
  ctx.fillText(spec.name, tx + 56, ty + 140);
  ctx.font = '700 40px "Zen Kaku Gothic New", sans-serif';
  ctx.fillText(`${spec.flavorLabel ? spec.flavorLabel + "の子　" : ""}${spec.taste}　技「${spec.move}」`, tx + 60, ty + 210);
  ctx.font = '500 34px "Zen Kaku Gothic New", sans-serif';
  ctx.fillText(`ロット ${lotNumber(lot)}`, tx + 60, ty + 270);
  // バーコード
  const bx = tx + 60, by = ty + 300, mw = 4.2;
  for (const b of bars(spec.jan)) ctx.fillRect(bx + b.x * mw, by, b.w * mw, b.guard ? 82 : 70);
  ctx.font = "500 30px ui-monospace, Menlo, monospace";
  ctx.fillText(spec.jan, bx + 95 * mw + 30, by + 62);
  return c.toDataURL("image/png");
}

/** 画像を作って、保存用のシートを開く。 */
export async function openShareSheet(character: Character, lot: Lot) {
  const url = await draw(character, lot);
  $<HTMLImageElement>("#share-img").src = url;
  $<HTMLDialogElement>("#share").showModal();
}

export function initShareSheet() {
  $("#share-close").addEventListener("click", () => $<HTMLDialogElement>("#share").close());
}
