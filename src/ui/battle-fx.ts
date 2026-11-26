// バトルの手応え（見た目だけ）。体当たり・縞のはじけ・数字・効き目の文字・揺れ・帯・値札。
// battle-feel ブランチで作った演出を、同時に何体も動く試合でも重ならないよう短くして移した。
// 勝敗や数値はここでは決めない。動きを減らす設定の端末では、どれも何もしない。

import type { Taste } from "../core/creature";
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

/** 数字以外の小さな文字（効き目・回復・ひりひり・ふいた）。color は効き目の色。 */
export function popText(layer: HTMLElement, x: number, y: number, text: string, kind: "effect" | "heal" | "burn" | "wipe", color = "") {
  if (reducedMotion()) return;
  const el = document.createElement("span");
  el.className = "pop";
  el.dataset.kind = kind;
  if (color) el.style.setProperty("--c", color);
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  void play(
    el,
    [
      { transform: "translate(-50%,-50%) scale(.5)", opacity: 0 },
      { transform: "translate(-50%,-80%) scale(1.1)", opacity: 1, offset: 0.2 },
      { transform: "translate(-50%,-100%) scale(1)", opacity: 1, offset: 0.7 },
      { transform: "translate(-50%,-140%) scale(1)", opacity: 0 },
    ],
    kind === "effect" ? 1000 : 750,
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

/** 真ん中に出る値札（技名、飲み干された）。新しいものが来たら入れ替わる。 */
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

// ---- 技の演出 ----

/** 味ごとの小さな形（技が当たったときに飛び散る）。viewBox は -10〜10。 */
const TASTE_SHAPE: Record<Taste, string> = {
  あまい: `<path d="M0 8C-9 1-7-7-2-6c1 0 2 1 2 2 0-1 1-2 2-2 5-1 7 7-2 14Z"/>`, // ハート（あまい）
  からい: `<path d="M0-9c4 5 7 8 7 12A7 7 0 0 1-7 3c0-3 2-5 3-7 1 2 2 3 3 3-1-4 0-7 1-11Z"/>`, // ほのお
  すっぱい: `<circle r="8"/><path d="M0 0V-8M0 0L7 4M0 0L-7 4" stroke="${INK}" stroke-width="1.6" fill="none"/>`, // 輪切り
  にがい: `<path d="M-8 8C-8-2-2-8 8-8 8 2 2 8-8 8Z"/><path d="M-8 8L5-5" stroke="${INK}" stroke-width="1.4"/>`, // 葉っぱ
  しょっぱい: `<rect x="-6" y="-6" width="12" height="12" transform="rotate(20)"/>`, // 塩のつぶ
  うまい: `<path d="M0-9l2.6 5.6 6 .7-4.5 4.1 1.2 6L0 4.4l-5.3 3 1.2-6-4.5-4.1 6-.7Z"/>`, // ほし
};

/** 技を出す子の帯（技名と、その子の絵）。こちらは左から、あいては右から入る。 */
export async function specialBand(layer: HTMLElement, art: string, name: string, color: string, side: number, ms: number) {
  if (reducedMotion()) return;
  const el = document.createElement("div");
  el.className = "sp-band";
  el.dataset.side = String(side);
  el.style.setProperty("--c", color);
  el.innerHTML = `<span class="sp-art">${art}</span><span class="sp-text"><i>技</i><b></b></span>`;
  el.querySelector("b")!.textContent = name;
  layer.appendChild(el);
  const from = side === 0 ? -110 : 110;
  await play(
    el,
    [
      { transform: `translateX(${from}%) skewY(-6deg)` },
      { transform: "translateX(0) skewY(-6deg)", offset: 0.18 },
      { transform: `translateX(${-from * 0.04}%) skewY(-6deg)`, offset: 0.82 },
      { transform: `translateX(${-from}%) skewY(-6deg)` },
    ],
    ms,
    { easing: "cubic-bezier(.2,.8,.3,1)" },
  );
  el.remove();
}

/** 力をためる：味の色の縞が、まわりから体に吸いこまれる。 */
export function gather(layer: HTMLElement, x: number, y: number, color: string, ms: number) {
  if (reducedMotion()) return;
  const n = 12;
  const rays = Array.from({ length: n }, (_, i) => {
    const w = [2, 5, 3, 6][i % 4];
    return `<rect x="${-w / 2}" y="-58" width="${w}" height="22" fill="${i % 2 ? color : INK}" transform="rotate(${(360 / n) * i + 8})"/>`;
  }).join("");
  const el = document.createElement("div");
  el.className = "burst";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = `<svg viewBox="-64 -64 128 128">${rays}</svg>`;
  layer.appendChild(el);
  void play(
    el,
    [
      { transform: "translate(-50%,-50%) scale(1.9) rotate(0)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1.4) rotate(40deg)", opacity: 1, offset: 0.3 },
      { transform: "translate(-50%,-50%) scale(.2) rotate(120deg)", opacity: 1 },
    ],
    ms,
    { easing: "ease-in" },
  ).then(() => el.remove());
}

/** 床に広がる輪（からだの技が叩きつけたところ）。 */
export function shockwave(layer: HTMLElement, x: number, y: number, color: string) {
  if (reducedMotion()) return;
  for (const [i, c] of [color, INK].entries()) {
    const el = document.createElement("i");
    el.className = "sp-wave";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.borderColor = c;
    layer.appendChild(el);
    void play(
      el,
      [
        { transform: "translate(-50%,-50%) scale(.2,.08)", opacity: 1 },
        { transform: `translate(-50%,-50%) scale(${2.6 - i * 0.5},${0.9 - i * 0.15})`, opacity: 0 },
      ],
      520 + i * 120,
      { easing: "cubic-bezier(.1,.7,.3,1)", delay: i * 60 },
    ).then(() => el.remove());
  }
}

/** 味ごとの形が飛び散る。 */
export function confetti(layer: HTMLElement, x: number, y: number, taste: Taste, color: string, n = 10) {
  if (reducedMotion()) return;
  for (let i = 0; i < n; i++) {
    const el = document.createElement("span");
    el.className = "sp-bit";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `<svg viewBox="-10 -10 20 20"><g fill="${color}" stroke="${INK}" stroke-width="1.6">${TASTE_SHAPE[taste]}</g></svg>`;
    layer.appendChild(el);
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const r = 50 + Math.random() * 45;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r * 0.75 - 20;
    const spin = (Math.random() - 0.5) * 540;
    void play(
      el,
      [
        { transform: "translate(-50%,-50%) scale(.3) rotate(0)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.15) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 36}px)) scale(.9) rotate(${spin}deg)`, opacity: 0 },
      ],
      700 + Math.random() * 250,
      { easing: "cubic-bezier(.2,.7,.4,1)" },
    ).then(() => el.remove());
  }
}
