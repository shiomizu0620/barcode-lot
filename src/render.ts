// キャラのSVGを組み立てる。
// 縞は本物のバーコードの棒そのもの。体の模様に24本、頭の飾り（クレスト）に長い6本を使う。

import { bars, type Bar } from "./ean";
import type { LotLook, Spec } from "./creature";

export const INK = "#1D1D22";
const WHITE = "#FFFFFF";
const BLUSH = "#FF8FA3";
const POP_RED = "#E63B2E";
const POP_YELLOW = "#FFD83D";

export const CX = 120;
export const GROUND = 212;
export const VIEW = 240;

/** 棒の置き場所。下辺の中心（bx, by）を基準に、幅・高さ・回転で表す。 */
export interface Slot {
  bx: number;
  by: number;
  w: number;
  h: number;
  rot: number;
}

export interface Rendered {
  svg: string;
  stripeSlots: Slot[]; // 普通の棒（24本）の行き先
  crestSlots: Slot[]; // 長い棒（6本）の行き先
  stripeColor: string;
  stripeOpacity: number;
  crestColor: string;
}

// ---- 色 ----
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}
function shift(hex: string, deg: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + deg, s, l);
}
function lighten(hex: string, amt: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(1, l + amt));
}
function luminance(hex: string): number {
  return hexToHsl(hex)[2];
}

// ---- 形 ----
const f = (v: number) => Math.round(v * 10) / 10;

function bodyPath(a: number, b: number, cy: number, n: number, taper: number): string {
  const N = 96;
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const t = (Math.PI * 2 * i) / N;
    const c = Math.cos(t), s = Math.sin(t);
    const x0 = a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y0 = b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const k = 1 + taper * (y0 / b);
    pts.push(`${f(CX + x0 * k)} ${f(cy + y0)}`);
  }
  return "M" + pts.join("L") + "Z";
}

/** 体の上下の端（x位置ごと）。テーパーは近似。 */
function bodyExtent(x: number, a: number, b: number, cy: number, n: number, taper: number, top: boolean): number {
  const k = top ? 1 - taper : 1 + taper;
  const u = Math.min(0.999, Math.abs(x - CX) / (a * k));
  const yy = b * Math.pow(1 - Math.pow(u, n), 1 / n);
  return top ? cy - yy : cy + yy;
}

function star(cx: number, cy: number, r: number, fill: string): string {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const t = -Math.PI / 2 + (i * Math.PI) / 5;
    p.push(`${f(cx + rr * Math.cos(t))} ${f(cy + rr * Math.sin(t))}`);
  }
  return `<path d="M${p.join("L")}Z" fill="${fill}"/>`;
}
function spark(cx: number, cy: number, r: number, fill: string): string {
  return `<path d="M${f(cx)} ${f(cy - r)}Q${f(cx + r * 0.18)} ${f(cy - r * 0.18)} ${f(cx + r)} ${f(cy)}Q${f(cx + r * 0.18)} ${f(cy + r * 0.18)} ${f(cx)} ${f(cy + r)}Q${f(cx - r * 0.18)} ${f(cy + r * 0.18)} ${f(cx - r)} ${f(cy)}Q${f(cx - r * 0.18)} ${f(cy - r * 0.18)} ${f(cx)} ${f(cy - r)}Z" fill="${fill}"/>`;
}

function slotRect(s: Slot, fill: string, rx: number, extra = ""): string {
  return `<rect x="${f(s.bx - s.w / 2)}" y="${f(s.by - s.h)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(rx)}" fill="${fill}" transform="rotate(${f(s.rot)} ${f(s.bx)} ${f(s.by)})"${extra}/>`;
}

let uid = 0;

export function renderCharacter(spec: Spec, look: LotLook): Rendered {
  const id = "c" + (++uid).toString(36);
  const cute = spec.family === "cute";
  const a = spec.body.w / 2;
  const b = spec.body.h / 2;
  const cy = GROUND - b;
  const { n, taper } = spec.body;
  const top = (x: number) => bodyExtent(x, a, b, cy, n, taper, true);
  const bot = (x: number) => bodyExtent(x, a, b, cy, n, taper, false);

  const body = shift(spec.palette.body, look.hue);
  const shade = shift(spec.palette.shade, look.hue);
  const dark = luminance(body) < 0.38;
  const stroke = `stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;

  const allBars = bars(spec.jan);
  const plain = allBars.filter((x) => !x.guard);
  const guards = allBars.filter((x) => x.guard);

  // ---- 縞（体の模様） ----
  let stripeColor = dark ? lighten(body, 0.22) : shade;
  let stripeOpacity = 0.55;
  let x0 = CX - a * 0.96, x1 = CX + a * 0.96;
  let yTop = cy - b, yBot = cy + b;
  let patch = "";
  let clipExtra = "";
  const patchCx = CX, patchCy = cy + b * 0.5, patchRx = a * 0.58, patchRy = b * 0.34;
  if (spec.stripe === "belly") {
    stripeColor = INK;
    stripeOpacity = 1;
    x0 = patchCx - patchRx * 0.78;
    x1 = patchCx + patchRx * 0.78;
    yTop = patchCy - patchRy * 0.55;
    yBot = patchCy + patchRy * 0.55;
    patch = `<ellipse cx="${f(patchCx)}" cy="${f(patchCy)}" rx="${f(patchRx)}" ry="${f(patchRy)}" fill="${WHITE}" stroke="${INK}" stroke-width="2.5"/>`;
    clipExtra = `<clipPath id="${id}-p"><ellipse cx="${f(patchCx)}" cy="${f(patchCy)}" rx="${f(patchRx - 2)}" ry="${f(patchRy - 2)}"/></clipPath>`;
  } else if (spec.stripe === "band") {
    stripeOpacity = 0.85;
    yTop = cy + b * 0.08;
    yBot = cy + b * 0.5;
  } else if (spec.stripe === "back") {
    stripeOpacity = 0.75;
    yBot = cy - b * 0.42;
  }
  const mw = (x1 - x0) / 95;
  const stripeSlots: Slot[] = plain.map((bar: Bar) => {
    const xm = x0 + (bar.x + bar.w / 2) * mw;
    let t = yTop, btm = yBot;
    if (spec.stripe === "belly") {
      const u = Math.min(0.999, Math.abs(xm - patchCx) / patchRx);
      const half = patchRy * Math.sqrt(1 - u * u);
      t = Math.max(t, patchCy - half);
      btm = Math.min(btm, patchCy + half);
    } else {
      t = Math.max(t, top(xm));
      btm = Math.min(btm, bot(xm));
    }
    return { bx: xm, by: btm, w: Math.max(1.2, bar.w * mw), h: Math.max(2, btm - t), rot: 0 };
  });

  // ---- クレスト（長い棒6本） ----
  const crestColor = cute ? shade : INK;
  const angles = cute ? [-26, -15, -5, 5, 15, 26] : [-56, -34, -12, 12, 34, 56];
  const crestSlots: Slot[] = guards.map((_, i) => {
    const ang = angles[i];
    const px = CX + Math.sin((ang * Math.PI) / 180) * a * (cute ? 0.32 : 0.55);
    const py = top(px) + 7;
    const digit = Number(spec.jan[(i * 2 + 1) % 13]);
    const len = cute ? 13 + digit * 0.9 + (i === 2 || i === 3 ? 5 : 0) : 20 + digit * 1.8;
    return { bx: px, by: py, w: cute ? 8 : 9, h: len, rot: ang * (cute ? 1.1 : 1) };
  });
  const crest = crestSlots.map((s) => slotRect(s, crestColor, cute ? 4 : 1.5, ` ${stroke}`)).join("");

  // ---- 耳・腕・足 ----
  let ears = "";
  const ex = a * 0.6;
  const earTop = (x: number) => top(x) + 6;
  switch (spec.ears) {
    case "round":
      for (const sx of [-1, 1]) {
        const x = CX + sx * ex, y = earTop(x);
        ears += `<circle cx="${f(x)}" cy="${f(y)}" r="19" fill="${body}" ${stroke}/><circle cx="${f(x)}" cy="${f(y)}" r="9" fill="${shade}" opacity=".6"/>`;
      }
      break;
    case "leaf":
      for (const sx of [-1, 1]) {
        const x = CX + sx * ex * 0.95, y = earTop(x) - 8;
        ears += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="11" ry="22" fill="${shade}" ${stroke} transform="rotate(${sx * 32} ${f(x)} ${f(y)})"/>`;
      }
      break;
    case "antenna": {
      const x = CX + a * 0.42, y = earTop(x);
      ears += `<path d="M${f(x)} ${f(y)}Q${f(x + 6)} ${f(y - 22)} ${f(x + 20)} ${f(y - 34)}" fill="none" ${stroke}/><circle cx="${f(x + 20)}" cy="${f(y - 34)}" r="7.5" fill="${shade}" ${stroke}/>`;
      break;
    }
    case "horn":
      for (const sx of [-1, 1]) {
        const x = CX + sx * ex, y = earTop(x) + 2;
        ears += `<path d="M${f(x - 12)} ${f(y)}L${f(x + sx * 10)} ${f(y - 36)}L${f(x + 12)} ${f(y)}Z" fill="${shade}" ${stroke}/>`;
      }
      break;
    case "blade":
      for (const sx of [-1, 1]) {
        const x = CX + sx * a * 0.72, y = earTop(x) + 6;
        ears += `<path d="M${f(x - sx * 4)} ${f(y)}L${f(x + sx * 26)} ${f(y - 30)}L${f(x + sx * 12)} ${f(y + 8)}Z" fill="${shade}" ${stroke}/>`;
      }
      break;
    default:
      break;
  }
  let arms = "";
  if (spec.arms) {
    for (const sx of [-1, 1]) {
      const x = CX + sx * a * 0.97, y = cy + b * 0.22;
      arms += `<ellipse cx="${f(x)}" cy="${f(y)}" rx="10" ry="15" fill="${shade}" ${stroke} transform="rotate(${sx * -24} ${f(x)} ${f(y)})"/>`;
    }
  }
  let feet = "";
  for (const sx of [-1, 1]) {
    feet += `<ellipse cx="${f(CX + sx * a * 0.38)}" cy="${GROUND - 1}" rx="15" ry="8.5" fill="${shade}" ${stroke}/>`;
  }

  // ---- 顔 ----
  const eyeY = cy - b * (spec.stripe === "belly" ? 0.34 : 0.26);
  const dx = a * 0.36;
  let face = "";
  const hi = (x: number, y: number, r: number) =>
    look.sparkle ? spark(x, y, r * 1.5, WHITE) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${WHITE}"/>`;
  for (const sx of [-1, 1]) {
    const x = CX + sx * dx;
    switch (spec.eyes) {
      case "big":
        face += `<ellipse cx="${f(x)}" cy="${f(eyeY)}" rx="11" ry="13.5" fill="${INK}"/>` + hi(x - 3.5, eyeY - 5, 4.2) + `<circle cx="${f(x + 4)}" cy="${f(eyeY + 5.5)}" r="1.9" fill="${WHITE}"/>`;
        break;
      case "dot":
        face += `<circle cx="${f(x)}" cy="${f(eyeY)}" r="7" fill="${INK}"/>` + hi(x - 2.2, eyeY - 2.4, 2.2);
        break;
      case "smile":
        face += `<path d="M${f(x - 8)} ${f(eyeY + 3)}Q${f(x)} ${f(eyeY - 8)} ${f(x + 8)} ${f(eyeY + 3)}" fill="none" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/>`;
        if (look.sparkle && sx === 1) face += spark(x + 13, eyeY - 9, 5, POP_YELLOW);
        break;
      case "sharp":
        face += `<path d="M${f(x - sx * 12)} ${f(eyeY - 5)}Q${f(x)} ${f(eyeY - 9)} ${f(x + sx * 11)} ${f(eyeY + 1)}Q${f(x)} ${f(eyeY + 7)} ${f(x - sx * 12)} ${f(eyeY - 5)}Z" fill="${INK}"/>` + hi(x + sx * 2, eyeY - 1, 2.2);
        break;
      case "slit":
        face += `<rect x="${f(x - 9)}" y="${f(eyeY - 2.5)}" width="18" height="5.5" rx="2.5" fill="${INK}" transform="rotate(${sx * 10} ${f(x)} ${f(eyeY)})"/>`;
        if (look.sparkle && sx === 1) face += spark(x + 14, eyeY - 8, 5, POP_YELLOW);
        break;
      default:
        break;
    }
  }
  if (spec.eyes === "visor") {
    const w = dx * 2 + 34;
    const glow = look.sparkle ? POP_YELLOW : lighten(body, 0.25);
    face += `<rect x="${f(CX - w / 2)}" y="${f(eyeY - 9)}" width="${f(w)}" height="18" rx="9" fill="${INK}"/>`;
    face += `<rect x="${f(CX - w / 2 + 9)}" y="${f(eyeY - 1.5)}" width="${f(w * 0.42)}" height="3" rx="1.5" fill="${glow}"/>`;
    for (let i = 0; i < 6; i++) {
      const bw = Number(spec.jan[i + 7]) % 3 === 0 ? 2.2 : 1.1;
      face += `<rect x="${f(CX + w * 0.12 + i * 4)}" y="${f(eyeY - 4.5)}" width="${bw}" height="9" fill="${glow}"/>`;
    }
  }
  const mY = eyeY + (spec.eyes === "visor" ? 19 : spec.stripe === "belly" ? 14 : 16);
  switch (spec.mouth) {
    case "w":
      face += `<path d="M${CX - 7} ${f(mY)}Q${CX - 3.5} ${f(mY + 5)} ${CX} ${f(mY)}Q${CX + 3.5} ${f(mY + 5)} ${CX + 7} ${f(mY)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case "open":
      face += `<path d="M${CX - 7} ${f(mY - 1)}Q${CX} ${f(mY + 13)} ${CX + 7} ${f(mY - 1)}Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="${CX}" cy="${f(mY + 5)}" rx="3.4" ry="2.4" fill="#FF7A8A"/>`;
      break;
    case "o":
      face += `<ellipse cx="${CX}" cy="${f(mY + 2)}" rx="3.6" ry="4.2" fill="${INK}"/>`;
      break;
    case "line":
      face += `<path d="M${CX - 7} ${f(mY)}L${CX + 7} ${f(mY)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case "fang":
      face += `<path d="M${CX - 8} ${f(mY)}L${CX + 8} ${f(mY)}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="M${CX + 1} ${f(mY + 1)}L${CX + 6} ${f(mY + 1)}L${CX + 3.5} ${f(mY + 7)}Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
      break;
    case "smirk":
      face += `<path d="M${CX - 7} ${f(mY + 2)}Q${CX + 2} ${f(mY + 3)} ${CX + 8} ${f(mY - 3)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
      break;
  }
  if (look.blush) {
    for (const sx of [-1, 1]) {
      face += `<ellipse cx="${f(CX + sx * (dx + 13))}" cy="${f(eyeY + 12)}" rx="7" ry="4" fill="${BLUSH}" opacity=".65"/>`;
    }
  }

  // ---- シール（ロットのおまけ） ----
  let sticker = "";
  if (look.sticker !== "none") {
    const sx = CX + a * 0.56, sy = cy + b * 0.02;
    if (look.sticker === "star") sticker = `<circle cx="${f(sx)}" cy="${f(sy)}" r="11" fill="${POP_RED}" stroke="${INK}" stroke-width="2"/>` + star(sx, sy + 0.5, 7, WHITE);
    else sticker = `<circle cx="${f(sx)}" cy="${f(sy)}" r="11" fill="${POP_YELLOW}" stroke="${INK}" stroke-width="2"/><circle cx="${f(sx)}" cy="${f(sy)}" r="5.5" fill="none" stroke="${POP_RED}" stroke-width="2.5"/>`;
  }

  const bp = bodyPath(a, b, cy, n, taper);
  const stripeRects = stripeSlots.map((s) => slotRect(s, stripeColor, 0)).join("");
  const stripes =
    spec.stripe === "belly"
      ? `${patch}<g clip-path="url(#${id}-p)">${stripeRects}</g>`
      : `<g opacity="${stripeOpacity}">${stripeRects}</g>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" role="img" aria-label="${spec.name}">` +
    `<defs><clipPath id="${id}-b"><path d="${bp}"/></clipPath>${clipExtra}</defs>` +
    `<ellipse cx="${CX}" cy="${GROUND + 9}" rx="${f(a * 0.85)}" ry="7" fill="${INK}" fill-opacity=".12" data-part="shadow"/>` +
    `<g data-part="char" transform="rotate(${f(look.tilt)} ${CX} ${GROUND})">` +
    `<g data-part="crest">${crest}</g>` +
    `<g data-part="form">${ears}${arms}<path d="${bp}" fill="${body}"/>` +
    `<g data-part="stripes" clip-path="url(#${id}-b)">${stripes}</g>` +
    `<path d="${bp}" fill="none" ${stroke}/>${feet}</g>` +
    `<g data-part="face">${face}</g>` +
    `<g data-part="sticker">${sticker}</g>` +
    `</g></svg>`;

  return { svg, stripeSlots, crestSlots, stripeColor, stripeOpacity, crestColor };
}
