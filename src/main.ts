import "./style.css";
import { bars, kindOf, KIND_LABEL, normalize, withCheck } from "./ean";
import { lotLook, specFor, STAT_LABEL, type LotLook, type Spec, type Stats } from "./creature";
import { advanceDays, allLots, lotNumber, remainingText, resetAll, scan, type Lot, type ScanResult } from "./lots";
import { drawStill, playMorph } from "./morph";
import { renderCharacter } from "./render";
import { beep, detectFromImage, startCamera, type CameraSession } from "./scan";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const video = $<HTMLVideoElement>("#video");
const scanner = $(".scanner");
const msg = $(".msg");
const btnCamera = $<HTMLButtonElement>("#btn-camera");
const fileInput = $<HTMLInputElement>("#file");
const form = $<HTMLFormElement>("#manual");
const janInput = $<HTMLInputElement>("#jan");
const morphHost = $("#morph");
const tag = $(".tag");
const shelf = $(".shelf-list");

let camera: CameraSession | null = null;
let busy = false;
let current: { spec: Spec; look: LotLook; lot: Lot; res?: ScanResult } | null = null;

function setView(v: "home" | "stage") {
  document.body.dataset.view = v;
  window.scrollTo({ top: 0 });
}

function say(text: string, tone: "info" | "error" = "info") {
  msg.textContent = text;
  msg.dataset.tone = tone;
}

// ---- 試し用の番号（架空。チェック数字だけ正しく計算） ----
const SAMPLES = [withCheck("490000001234"), withCheck("456789012345"), withCheck("491234500004")];
$(".samples-list").innerHTML = SAMPLES.map((j) => `<button type="button" class="chip" data-jan="${j}">${j}</button>`).join("");
$(".samples-list").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (b?.dataset.jan) hatch(b.dataset.jan);
});

// ---- 読み取り ----
btnCamera.addEventListener("click", async () => {
  if (camera) {
    stopCamera();
    return;
  }
  say("カメラを準備しています");
  try {
    camera = await startCamera(video, (code) => {
      stopCamera();
      hatch(code);
    });
    scanner.classList.add("live");
    btnCamera.textContent = "カメラを止める";
    say("バーコードを赤い線に合わせてください");
  } catch {
    stopCamera();
    say("このページではカメラが使えません。「写真から読む」か、数字の入力で試せます。", "error");
  }
});

function stopCamera() {
  camera?.stop();
  camera = null;
  scanner.classList.remove("live");
  btnCamera.textContent = "カメラで読む";
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  say("写真を調べています");
  try {
    const code = await detectFromImage(file);
    if (code) hatch(code);
    else say("写真からバーコードが見つかりませんでした。バーコードを大きく、まっすぐ写して撮り直してください。", "error");
  } catch {
    say("写真を読み込めませんでした。別の写真で試してください。", "error");
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  hatch(janInput.value);
});

// ---- 生まれる ----
async function hatch(raw: string) {
  if (busy) return;
  const jan = normalize(raw);
  if (!jan) {
    say("バーコードの数字として正しくありません。13桁（または8桁・12桁）を確かめてください。", "error");
    return;
  }
  busy = true;
  say("");
  const spec = specFor(jan);
  const res = scan(jan, kindOf(jan));
  const look = lotLook(spec, res.lot.seed);
  current = { spec, look, lot: res.lot, res };
  fillTag(spec, look, res.lot, res);
  setView("stage");
  document.body.classList.add("morphing");
  beep();
  await playMorph(morphHost, spec, look, reduced);
  document.body.classList.remove("morphing");
  renderShelf();
  busy = false;
  $<HTMLButtonElement>("#again").focus({ preventScroll: true });
}

function showStill(lot: Lot) {
  const spec = specFor(lot.jan);
  const look = lotLook(spec, lot.seed);
  current = { spec, look, lot };
  fillTag(spec, look, lot);
  drawStill(morphHost, spec, look);
  setView("stage");
}

function barcodeSvg(jan: string): string {
  const bs = bars(jan);
  const rects = bs.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="${b.guard ? 26 : 22}"/>`).join("");
  return `<svg class="mini-code" viewBox="0 0 95 26" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
}

function fillTag(spec: Spec, look: LotLook, lot: Lot, res?: ScanResult) {
  tag.dataset.taste = spec.taste;
  $(".tag-taste").textContent = spec.taste;
  $(".tag-kind").textContent = KIND_LABEL[spec.kind];
  $(".tag-name").textContent = spec.name;
  $(".tag-flavor").textContent = `${spec.palette.name}色の${spec.family === "cute" ? "かわいい" : "かっこいい"}系`;
  $(".tag-move").textContent = spec.move;
  const keys = Object.keys(STAT_LABEL) as (keyof Stats)[];
  $(".tag-stats").innerHTML = keys
    .map((k) => {
      const v = look.stats[k];
      const diff = v - spec.base[k];
      const d = diff === 0 ? "±0" : diff > 0 ? `+${diff}` : `${diff}`;
      return `<div class="stat"><dt>${STAT_LABEL[k]}</dt><span class="leader" aria-hidden="true"></span><dd><span class="v">${v}</span><span class="d" data-sign="${Math.sign(diff)}">品番より${d}</span></dd></div>`;
    })
    .join("");
  $(".tag-code").innerHTML = `${barcodeSvg(spec.jan)}<span class="digits">${spec.jan}</span>`;
  $(".tag-lot").textContent = `ロット ${lotNumber(lot)}（この品番の${lot.index}体目）`;
  const status = $(".tag-status");
  if (res) {
    status.hidden = false;
    status.dataset.new = String(res.isNew);
    status.textContent = res.isNew
      ? res.total === 1
        ? "はじめての品番です"
        : "新しいロットが入荷しました"
      : `前と同じロットです。次の入荷まで${remainingText(res.nextAt)}`;
  } else status.hidden = true;
}

// ---- 棚 ----
function renderShelf() {
  const lots = allLots();
  $(".shelf-empty").hidden = lots.length > 0;
  shelf.innerHTML = lots
    .slice(0, 40)
    .map((lot, i) => {
      const spec = specFor(lot.jan);
      const look = lotLook(spec, lot.seed);
      return `<li><button type="button" class="slot" data-i="${i}"><span class="thumb">${renderCharacter(spec, look).svg}</span><span class="slot-name">${spec.name}</span><span class="slot-lot">${lotNumber(lot)}</span></button></li>`;
    })
    .join("");
  shelf.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.slot");
    if (b) showStill(lots[Number(b.dataset.i)]);
  };
}

// ---- 結果画面のボタン ----
$("#again").addEventListener("click", () => {
  setView("home");
  janInput.value = "";
});

$("#save").addEventListener("click", async () => {
  if (!current) return;
  const url = await shareImage(current.spec, current.look, current.lot);
  const dlg = $<HTMLDialogElement>("#share");
  $<HTMLImageElement>("#share-img").src = url;
  dlg.showModal();
});
$("#share-close").addEventListener("click", () => $<HTMLDialogElement>("#share").close());

async function shareImage(spec: Spec, look: LotLook, lot: Lot): Promise<string> {
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
  const svg = renderCharacter(spec, look).svg;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
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
  ctx.fillText(`${spec.taste}　技「${spec.move}」`, tx + 60, ty + 210);
  ctx.font = '500 34px "Zen Kaku Gothic New", sans-serif';
  ctx.fillText(`ロット ${lotNumber(lot)}`, tx + 60, ty + 270);
  // バーコード
  const bs = bars(spec.jan);
  const bx = tx + 60, by = ty + 300, mw = 4.2;
  for (const b of bs) ctx.fillRect(bx + b.x * mw, by, b.w * mw, b.guard ? 82 : 70);
  ctx.font = '500 30px ui-monospace, Menlo, monospace';
  ctx.fillText(spec.jan, bx + 95 * mw + 30, by + 62);
  return c.toDataURL("image/png");
}

// ---- 試作用の操作（#debug で表示） ----
function syncDebug() {
  document.body.classList.toggle("debug", location.hash === "#debug");
}
window.addEventListener("hashchange", syncDebug);
syncDebug();
$("#dbg-day").addEventListener("click", () => {
  advanceDays(1);
  say("時間を1日すすめました");
});
$("#dbg-reset").addEventListener("click", () => {
  resetAll();
  renderShelf();
  say("記録を消しました");
});

renderShelf();
setView("home");
