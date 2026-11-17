// バトルの手応え（見た目だけ）。体当たり・縞のはじけ・数字・揺れ・帯・値札。
// battle-feel ブランチで作った演出を、同時に何体も動く試合でも重ならないよう短くして移した。
// 勝敗や数値はここでは決めない。動きを減らす設定の端末では、どれも何もしない。

import { reducedMotion } from "./dom";

const INK = "#1d1d22";

/** アニメーションを1つ流す。動きを減らす設定なら何もしない。 */
export function play(el: Element | null | undefined, kf: Keyframe[], ms: number, opt: KeyframeAnimationOptions = {}): Promise<void> {
  if (!el || ms <= 0 || reducedMotion()) return Promise.resolve();
  return el.animate(kf, { duration: ms, easing: "ease-out", ...opt }).finished.then(
    () => {},
    () => {},
  );
}

/** layer（.fx）の中での、要素の中心。 */
export function centerIn(layer: HTMLElement, el: Element) {
  const r = el.getBoundingClientRect();
  const a = layer.getBoundingClientRect();
  return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top };
}

/** 当たったところで縞がはじける。 */
export function burst(layer: HTMLElement, x: number, y: number, color: string, power: "strong" | "weak" | "even" | "move") {
  if (reducedMotion()) return;
  const n = 14;
  const widths = [2, 4, 2, 6, 3, 2, 5, 2, 3, 4, 2, 6, 3, 2];
  const rays = Array.from({ length: n }, (_, i) => {
    const w = widths[i % widths.length];
    const len = i % 3 === 0 ? 46 : 34;
    return `<rect x="${-w / 2}" y="${-len - 14}" width="${w}" height="${len}" fill="${i % 2 ? color : INK}" transform="rotate(${(360 / n) * i})"/>`;
  }).join("");
  const el = document.createElement("div");
  el.className = "burst";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = `<svg viewBox="-64 -64 128 128">${rays}<circle r="11" fill="#fff" stroke="${INK}" stroke-width="3"/></svg>`;
  layer.appendChild(el);
  const big = power === "move" ? 1.9 : power === "strong" ? 1.3 : power === "weak" ? 0.6 : 0.9;
  void play(
    el,
    [
      { transform: "translate(-50%,-50%) scale(.3) rotate(0)", opacity: 1 },
      { transform: `translate(-50%,-50%) scale(${big}) rotate(18deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(-50%,-50%) scale(${big * 1.1}) rotate(24deg)`, opacity: 0 },
    ],
    power === "move" ? 520 : 340,
  ).then(() => el.remove());
}

/** 減った量の数字。 */
export function damagePop(layer: HTMLElement, x: number, y: number, dmg: number, power: "strong" | "weak" | "even" | "move") {
  if (reducedMotion()) return;
  const el = document.createElement("span");
  el.className = "dmg";
  el.dataset.power = power;
  el.textContent = `-${dmg}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  void play(
    el,
    [
      { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
      { transform: "translate(-50%,-90%) scale(1.3)", opacity: 1, offset: 0.18 },
      { transform: "translate(-50%,-110%) scale(1)", opacity: 1, offset: 0.6 },
      { transform: "translate(-50%,-170%) scale(1)", opacity: 0 },
    ],
    800,
  ).then(() => el.remove());
}

/** 場が揺れる。 */
export function shake(el: HTMLElement, k: number, ms: number) {
  void play(
    el,
    [{ transform: `translate(${k}px,${-k / 2}px)` }, { transform: `translate(${-k}px,${k / 2}px)` }, { transform: `translate(${k / 2}px,0)` }, { transform: "none" }],
    ms,
    { easing: "linear" },
  );
}

/** 画面を横切る帯（開始・組み合わせ技・勝ち負け）。 */
export async function cutin(layer: HTMLElement, text: string, tone = "") {
  if (reducedMotion()) return;
  const el = document.createElement("div");
  el.className = "cutin";
  if (tone) el.dataset.tone = tone;
  el.textContent = text;
  layer.appendChild(el);
  await play(
    el,
    [
      { transform: "translateX(110%) skewX(-12deg)" },
      { transform: "translateX(0) skewX(-12deg)", offset: 0.25 },
      { transform: "translateX(-4%) skewX(-12deg)", offset: 0.75 },
      { transform: "translateX(-115%) skewX(-12deg)" },
    ],
    950,
    { easing: "cubic-bezier(.2,.8,.3,1)" },
  );
  el.remove();
}

/** 真ん中に出る値札（技名、飲み干された、前へ）。新しいものが来たら入れ替わる。 */
export function callout(host: HTMLElement, main: string, sub = "", tone = "", side: number | null = null) {
  host.innerHTML = "";
  const el = document.createElement("div");
  el.className = "callout";
  if (tone) el.dataset.tone = tone;
  if (side !== null) el.dataset.side = String(side);
  el.innerHTML = `<b></b>${sub ? "<small></small>" : ""}`;
  el.querySelector("b")!.textContent = main;
  if (sub) el.querySelector("small")!.textContent = sub;
  host.appendChild(el);
  void play(el, [{ transform: "scale(.6) rotate(-4deg)", opacity: 0 }, { transform: "scale(1.08) rotate(1deg)", opacity: 1, offset: 0.6 }, { transform: "scale(1) rotate(0)", opacity: 1 }], 220);
}
