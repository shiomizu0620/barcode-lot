// 変身演出：読んだバーコードの棒がはがれて飛び、キャラの縞とクレストに組み上がる。

import { bars } from "./ean";
import { CX, GROUND, INK, renderCharacter, type Slot } from "./render";
import type { LotLook, Spec } from "./creature";

const NS = "http://www.w3.org/2000/svg";
const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  back: (t: number) => {
    const c1 = 1.9, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function setSlot(el: SVGRectElement, s: Slot) {
  el.setAttribute("x", String(s.bx - s.w / 2));
  el.setAttribute("y", String(s.by - s.h));
  el.setAttribute("width", String(Math.max(0.5, s.w)));
  el.setAttribute("height", String(Math.max(0.5, s.h)));
  el.setAttribute("transform", `rotate(${s.rot} ${s.bx} ${s.by})`);
}

/** 完成形だけを描く（演出なし）。 */
export function drawStill(host: HTMLElement, spec: Spec, look: LotLook) {
  host.innerHTML = renderCharacter(spec, look).svg;
}

export function playMorph(host: HTMLElement, spec: Spec, look: LotLook, reduced: boolean): Promise<void> {
  const r = renderCharacter(spec, look);
  host.innerHTML = r.svg;
  if (reduced) return Promise.resolve();

  const svg = host.querySelector("svg")!;
  const q = (p: string) => svg.querySelector(`[data-part="${p}"]`) as SVGGElement;
  const charG = q("char"), form = q("form"), stripes = q("stripes"), crest = q("crest"), face = q("face"), sticker = q("sticker"), shadow = q("shadow");

  // 完成形の位置を測ってから、最初の状態に戻す
  const faceBox = face.getBBox();
  const faceC = { x: faceBox.x + faceBox.width / 2, y: faceBox.y + faceBox.height / 2 };
  const stickerBox = sticker.getBBox();
  const stickerC = { x: stickerBox.x + stickerBox.width / 2, y: stickerBox.y + stickerBox.height / 2 };
  const finalTilt = look.tilt;
  charG.setAttribute("transform", "rotate(0 120 212)");
  for (const g of [form, stripes, crest, face, sticker, shadow]) g.style.opacity = "0";

  // 値札ラベル（読んだバーコード）
  const label = document.createElementNS(NS, "g");
  label.innerHTML =
    `<rect x="12" y="58" width="216" height="152" rx="12" fill="#fff" stroke="${INK}" stroke-width="3"/>` +
    `<text x="120" y="198" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="15" letter-spacing="2.5" fill="${INK}">${spec.jan[0]} ${spec.jan.slice(1, 7)} ${spec.jan.slice(7)}</text>`;
  const laser = document.createElementNS(NS, "rect");
  laser.setAttribute("x", "4");
  laser.setAttribute("y", "124");
  laser.setAttribute("width", "232");
  laser.setAttribute("height", "3");
  laser.setAttribute("rx", "1.5");
  laser.setAttribute("fill", "#E63B2E");
  laser.style.opacity = "0";
  charG.appendChild(label);

  // 飛ぶ棒
  const flyG = document.createElementNS(NS, "g");
  charG.appendChild(flyG);
  charG.appendChild(laser);
  const all = bars(spec.jan);
  let pi = 0, gi = 0;
  const flyers = all.map((bar, i) => {
    const h = bar.guard ? 112 : 100;
    const from: Slot = { bx: 22.5 + (bar.x + bar.w / 2) * 2, by: 72 + h, w: bar.w * 2, h, rot: 0 };
    const to = bar.guard ? r.crestSlots[gi++] : r.stripeSlots[pi++];
    const el = document.createElementNS(NS, "rect") as SVGRectElement;
    el.setAttribute("fill", INK);
    if (bar.guard) {
      el.setAttribute("rx", spec.family === "cute" ? "4" : "1.5");
    }
    setSlot(el, from);
    flyG.appendChild(el);
    // 中央から外へ広がる順に飛ばす
    const order = Math.abs(bar.x - 47) / 47;
    return { el, from, to, delay: 800 + order * 380 + (bar.guard ? 120 : 0) + (i % 3) * 18, guard: bar.guard };
  });

  return new Promise((resolve) => {
    const start = performance.now();
    const END = 2900;
    const frame = (nowT: number) => {
      const t = nowT - start;

      // ピッ（レーザーが2回光る）
      laser.style.opacity = t < 90 ? "1" : t < 170 ? "0" : t < 330 ? "1" : "0";

      // ラベルがはがれる
      const peel = ease.out(seg(t, 480, 820));
      label.style.opacity = String(1 - peel);
      label.setAttribute("transform", `translate(0 ${peel * 10})`);

      // 棒が飛ぶ
      for (const fl of flyers) {
        const lift = ease.out(seg(t, 520, 800));
        const k = ease.inOut(seg(t, fl.delay, fl.delay + 780));
        const s: Slot = {
          bx: lerp(fl.from.bx, fl.to.bx, k),
          by: lerp(fl.from.by - lift * 8, fl.to.by, k),
          w: lerp(fl.from.w, fl.to.w, k),
          h: lerp(fl.from.h, fl.to.h, k),
          rot: lerp(0, fl.to.rot, k) + Math.sin(k * Math.PI) * (fl.guard ? 25 : 8),
        };
        setSlot(fl.el, s);
      }

      // 体がふくらむ
      const grow = seg(t, 1250, 1850);
      const sc = 0.15 + 0.85 * ease.back(grow);
      form.style.opacity = String(Math.min(1, grow * 3));
      form.setAttribute("transform", `translate(${CX} ${GROUND}) scale(${sc}) translate(${-CX} ${-GROUND})`);

      // 棒が体の模様に変わる
      const settle = seg(t, 1950, 2200);
      flyG.style.opacity = String(1 - settle);
      stripes.style.opacity = String(settle);
      crest.style.opacity = String(settle);

      // 顔が出る
      const pop = seg(t, 2100, 2400);
      const fs = ease.back(pop);
      face.style.opacity = String(Math.min(1, pop * 4));
      face.setAttribute("transform", `translate(${faceC.x} ${faceC.y}) scale(${Math.max(0.001, fs)}) translate(${-faceC.x} ${-faceC.y})`);

      // ぴょんと跳ねて、首をかしげる
      const hop = seg(t, 2350, 2800);
      const y = -Math.sin(hop * Math.PI) * 12;
      const tilt = finalTilt * ease.back(seg(t, 2450, 2850));
      charG.setAttribute("transform", `translate(0 ${y}) rotate(${tilt} ${CX} ${GROUND})`);
      shadow.style.opacity = String(seg(t, 2200, 2500));
      const st = ease.back(seg(t, 2550, 2850));
      sticker.style.opacity = String(seg(t, 2550, 2650));
      sticker.setAttribute("transform", `translate(${stickerC.x} ${stickerC.y}) scale(${Math.max(0.001, st)}) translate(${-stickerC.x} ${-stickerC.y})`);

      if (t < END) requestAnimationFrame(frame);
      else {
        // 最終状態に戻す
        label.remove();
        flyG.remove();
        laser.remove();
        for (const g of [form, stripes, crest, face, sticker, shadow]) {
          g.style.opacity = "";
          g.removeAttribute("transform");
        }
        charG.setAttribute("transform", `rotate(${finalTilt} ${CX} ${GROUND})`);
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
