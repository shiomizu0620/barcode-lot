// チーム選択とバトル画面。

import { COMBOS, dailyChallenger, decodeTeam, encodeTeam, simulate, type BattleEvent, type Fighter, type Member } from "./battle";
import { allLots, type Lot } from "./lots";
import { FLAVORS } from "./product";
import { storedProfile } from "./profile";
import { lotLook, specFor } from "./creature";
import { renderCharacter } from "./render";
import { isMuted, setMuted, sfx, unlock } from "./sfx";

type View = "home" | "stage" | "team" | "battle";
interface Deps {
  setView(v: View): void;
}

interface Opponent {
  kind: "daily" | "letter";
  title: string;
  members: Member[];
  code: string; // 対戦シード用
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MAX = 3;

let deps: Deps;
let opponent: Opponent | null = null;
let picked: string[] = []; // 選んだロットのキー（jan:index）
const keyOf = (lot: Lot) => `${lot.jan}:${lot.index}`;
const pickedLots = () => { const all = allLots(); return picked.map((k) => all.find((l) => keyOf(l) === k)!).filter(Boolean); };
let skip = false;
let pending: Opponent | null = null;

export function dateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function memberOf(lot: Lot): Member {
  return { jan: lot.jan, lotSeed: lot.seed, profile: storedProfile(lot.jan) };
}

function charSvg(m: Member): string {
  const spec = specFor(m.jan, m.profile);
  return renderCharacter(spec, lotLook(spec, m.lotSeed)).svg;
}

// ---- チーム選択 ----
export function openTeam(op: Opponent) {
  opponent = op;
  picked = [];
  $(".team-title").textContent = op.title;
  $(".team-foe").innerHTML = op.members.map((m) => `<span class="mini">${charSvg(m)}</span>`).join("");
  renderPicker();
  deps.setView("team");
}

function renderPicker() {
  const lots = allLots();
  // 同じ品番・同じロットの重複は出ない（ロットごとに1つ）
  $(".team-list").innerHTML = lots
    .map((lot, i) => {
      const spec = specFor(lot.jan, storedProfile(lot.jan));
      const order = picked.indexOf(keyOf(lot));
      return `<li><button type="button" class="pick" data-i="${i}" aria-pressed="${order >= 0}">
        <span class="thumb">${renderCharacter(spec, lotLook(spec, lot.seed)).svg}</span>
        ${order >= 0 ? `<span class="pick-no" aria-label="${order + 1}番手">${order + 1}</span>` : ""}
        <span class="slot-name">${spec.name}</span><span class="slot-lot">${spec.taste}${spec.flavorLabel ? "・" + spec.flavorLabel : ""}</span>
      </button></li>`;
    })
    .join("");
  $(".team-list").onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.pick");
    if (!b) return;
    const key = keyOf(lots[Number(b.dataset.i)]);
    const at = picked.indexOf(key);
    if (at >= 0) picked.splice(at, 1);
    else if (picked.length < MAX) picked.push(key);
    renderPicker();
  };
  const need = Math.min(MAX, lots.length);
  const go = $<HTMLButtonElement>("#team-go");
  go.disabled = picked.length < need || need === 0;
  go.textContent = picked.length < need ? `あと${need - picked.length}体えらぶ` : "この順番で戦う";
  $<HTMLButtonElement>("#team-letter").disabled = go.disabled;
  // 組み合わせ技の予告
  const members = pickedLots().map(memberOf);
  const fl = members.map((m) => specFor(m.jan, m.profile).flavor);
  const hits = COMBOS.filter((c) => fl.some((a, i) => a && c.flavors[0].includes(a) && fl.some((b, j) => j !== i && b && c.flavors[1].includes(b))));
  $(".team-combos").textContent = hits.length ? `組み合わせ技：${hits.map((c) => c.name).join("、")}` : picked.length >= 2 ? "組み合わせ技はまだなし。食べ合わせを考えてみよう" : "";
}

// ---- 挑戦状 ----
async function sendLetter() {
  const code = encodeTeam(pickedLots().map(memberOf));
  const url = `${location.origin}${location.pathname}?vs=${code}`;
  const text = "バーコードの子で挑戦状。3体で受けて立って";
  try {
    if (navigator.share) {
      await navigator.share({ title: "挑戦状", text, url });
      return;
    }
  } catch {
    /* キャンセル等は無視 */
  }
  try {
    await navigator.clipboard.writeText(url);
    $(".team-msg").textContent = "挑戦状のURLをコピーしました。友達に送ってください。";
  } catch {
    $(".team-msg").textContent = url;
  }
}

// ---- バトル再生 ----
// 計算（battle.ts）が出した出来事を順に再生する。ここは見た目と音だけ。
const wait = (ms: number) => new Promise((r) => setTimeout(r, skip ? 0 : ms));

/** アニメーションを1つ流して終わるのを待つ。飛ばしているときは何もしない */
function play(el: Element | null, kf: Keyframe[], ms: number, opt: KeyframeAnimationOptions = {}): Promise<void> {
  if (skip || !el || ms <= 0) return Promise.resolve();
  return el.animate(kf, { duration: ms, easing: "ease-out", ...opt }).finished.then(() => {}, () => {});
}

function fighterHtml(f: Fighter): string {
  return `<div class="fighter" data-side="${f.side}" data-slot="${f.slot}">
    <div class="fighter-body"><div class="fighter-art">${renderCharacter(f.spec, f.look).svg}</div></div>
    <div class="fighter-name">${f.spec.name}</div>
    <div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="${f.maxHp}" aria-valuenow="${f.maxHp}" aria-label="${f.spec.name}の残り"><i></i><span></span></div>
    <div class="gauge-text">残り${f.maxHp}ml</div>
  </div>`;
}

function line(text: string, tone = "") {
  const log = $(".battle-log");
  const p = document.createElement("p");
  p.textContent = text;
  if (tone) p.dataset.tone = tone;
  log.prepend(p);
  while (log.children.length > 3) log.lastElementChild!.remove();
}

/** 真ん中に出る値札。技名や「飲み干された」を大きく見せる */
function callout(main: string, sub = "", tone = "", side: number | null = null) {
  const mid = $(".arena-mid");
  mid.innerHTML = "";
  if (skip) return;
  const el = document.createElement("div");
  el.className = "callout";
  if (tone) el.dataset.tone = tone;
  if (side !== null) el.dataset.side = String(side);
  el.innerHTML = `<b></b>${sub ? "<small></small>" : ""}`;
  el.querySelector("b")!.textContent = main;
  if (sub) el.querySelector("small")!.textContent = sub;
  mid.appendChild(el);
  void play(el, [{ transform: "scale(.6) rotate(-4deg)", opacity: 0 }, { transform: "scale(1.08) rotate(1deg)", opacity: 1, offset: 0.6 }, { transform: "scale(1) rotate(0)", opacity: 1 }], 220);
}

/** 画面を横切る帯。開始や組み合わせ技に使う */
async function cutin(text: string, tone = "") {
  if (skip) return;
  const el = document.createElement("div");
  el.className = "cutin";
  if (tone) el.dataset.tone = tone;
  el.textContent = text;
  $(".fx").appendChild(el);
  await play(el, [
    { transform: "translateX(110%) skewX(-12deg)" },
    { transform: "translateX(0) skewX(-12deg)", offset: 0.25 },
    { transform: "translateX(-4%) skewX(-12deg)", offset: 0.75 },
    { transform: "translateX(-115%) skewX(-12deg)" },
  ], 950, { easing: "cubic-bezier(.2,.8,.3,1)" });
  el.remove();
}

/** 当たったところで縞がはじける */
function burst(x: number, y: number, color: string, match: string) {
  if (skip) return;
  const n = 14;
  const widths = [2, 4, 2, 6, 3, 2, 5, 2, 3, 4, 2, 6, 3, 2];
  const rays = Array.from({ length: n }, (_, i) => {
    const w = widths[i % widths.length];
    const len = i % 3 === 0 ? 46 : 34;
    return `<rect x="${-w / 2}" y="${-len - 14}" width="${w}" height="${len}" fill="${i % 2 ? color : "#1d1d22"}" transform="rotate(${(360 / n) * i})"/>`;
  }).join("");
  const el = document.createElement("div");
  el.className = "burst";
  el.dataset.match = match;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.innerHTML = `<svg viewBox="-64 -64 128 128">${rays}<circle r="11" fill="#fff" stroke="#1d1d22" stroke-width="3"/></svg>`;
  $(".fx").appendChild(el);
  const big = match === "strong" ? 1.5 : match === "weak" ? 0.8 : 1.15;
  void play(el, [
    { transform: "translate(-50%,-50%) scale(.3) rotate(0)", opacity: 1 },
    { transform: `translate(-50%,-50%) scale(${big}) rotate(18deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(-50%,-50%) scale(${big * 1.1}) rotate(24deg)`, opacity: 0 },
  ], 420).then(() => el.remove());
}

function damagePop(x: number, y: number, dmg: number, match: string) {
  if (skip) return;
  const el = document.createElement("span");
  el.className = "dmg";
  el.dataset.match = match;
  el.textContent = `-${dmg}`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  $(".fx").appendChild(el);
  void play(el, [
    { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
    { transform: "translate(-50%,-90%) scale(1.35)", opacity: 1, offset: 0.18 },
    { transform: "translate(-50%,-110%) scale(1)", opacity: 1, offset: 0.6 },
    { transform: "translate(-50%,-170%) scale(1)", opacity: 0 },
  ], 900).then(() => el.remove());
}

async function runBattle() {
  if (!opponent) return;
  unlock();
  const mine = pickedLots().map(memberOf);
  const seed = `${opponent.code}:${encodeTeam(mine)}`;
  const res = simulate(mine, opponent.members, seed);
  skip = reduced;
  const fx = (side: number, slot: number) => document.querySelector(`.fighter[data-side="${side}"][data-slot="${slot}"]`) as HTMLElement;
  const body = (side: number, slot: number) => fx(side, slot).querySelector<HTMLElement>(".fighter-body")!;
  const arena = $(".arena");
  $(".row-foe").innerHTML = res.fighters[1].map(fighterHtml).join("");
  $(".row-mine").innerHTML = res.fighters[0].map(fighterHtml).join("");
  $(".battle-log").innerHTML = "";
  $(".fx").innerHTML = "";
  $(".arena-mid").innerHTML = "";
  $(".battle-vs").textContent = `VS ${opponent.title}`;
  $(".battle-result").hidden = true;
  $<HTMLButtonElement>("#battle-skip").hidden = false;
  deps.setView("battle");
  const names = res.fighters.map((t) => t.map((f) => f.spec.name));
  const maxHp = res.fighters.map((t) => t.map((f) => f.maxHp));
  const color = res.fighters.map((t) => t.map((f) => f.spec.palette.body));
  const downed = [new Set<number>(), new Set<number>()];
  const sideName = (s: number) => (s === 0 ? "こちら" : "あいて");

  /** 前に立つ1体を真ん中に置く。入れ替わるときはすべるように動かす */
  const arrange = async (side: 0 | 1, animate: boolean) => {
    const fs = res.fighters[side].map((f) => fx(side, f.slot));
    const before = fs.map((el) => el.getBoundingClientRect());
    const alive = res.fighters[side].filter((f) => !downed[side].has(f.slot)).map((f) => f.slot);
    const front = alive[0];
    const rest = res.fighters[side].map((f) => f.slot).filter((s) => s !== front);
    const order = new Map<number, number>();
    if (front !== undefined) order.set(front, 2);
    rest.forEach((s, i) => order.set(s, i === 0 ? 1 : 3));
    fs.forEach((el, i) => {
      el.style.order = String(order.get(i) ?? i + 1);
      el.classList.toggle("front", i === front);
    });
    if (!animate) return;
    await Promise.all(
      fs.map((el, i) => {
        const after = el.getBoundingClientRect();
        const dx = before[i].left - after.left;
        if (Math.abs(dx) < 1) return Promise.resolve();
        return play(el, [{ transform: `translateX(${dx}px)` }, { transform: "translateX(-6px)", offset: 0.8 }, { transform: "none" }], 420, { easing: "cubic-bezier(.3,.7,.3,1)" });
      }),
    );
  };
  await arrange(0, false);
  await arrange(1, false);

  const center = (el: Element) => {
    const r = el.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    return { x: r.left + r.width / 2 - a.left, y: r.top + r.height / 2 - a.top };
  };

  sfx.start();
  line(`${opponent.title}とのバトル開始`);
  await cutin("バトル開始！");
  for (const ev of res.events as BattleEvent[]) {
    switch (ev.t) {
      case "combo":
        sfx.combo();
        for (const s of ev.slots) fx(ev.side, s).classList.add("boosted");
        line(`${sideName(ev.side)}の組み合わせ技「${ev.name}」！ ${ev.slots.map((s) => names[ev.side][s]).join("と")}の濃さが上がった`, "combo");
        await cutin(`${sideName(ev.side)}の組み合わせ技　${ev.name}`, "combo");
        break;
      case "trio":
        sfx.combo();
        line(`${sideName(ev.side)}は「${ev.taste}」でそろい踏み。守りが上がった`, "combo");
        await cutin(`${sideName(ev.side)}は「${ev.taste}」でそろい踏み`, "combo");
        break;
      case "round":
        break;
      case "hit": {
        const foe = 1 - ev.side;
        const ab = body(ev.side, ev.slot), tb = body(foe, ev.target);
        const t = fx(foe, ev.target);
        const from = center(ab), to = center(tb);
        const dx = (to.x - from.x) * 0.62, dy = (to.y - from.y) * 0.62;
        const len = Math.hypot(dx, dy) || 1;
        const bx = (-dx / len) * 12, by = (-dy / len) * 12;
        const sub = ev.match === "strong" ? "よく効く！" : ev.match === "weak" ? "あまり効いていない" : "";
        callout(`${names[ev.side][ev.slot]}の「${ev.move}」`, sub, ev.match === "strong" ? "strong" : ev.match === "weak" ? "weak" : "", ev.side);
        fx(ev.side, ev.slot).classList.add("acting");
        sfx.dash();
        // ためて → 体当たり → 当たった瞬間に止まる → もどる
        const TOTAL = 600, HIT = 0.42;
        const attack = play(ab, [
          { transform: "translate(0,0) scale(1)" },
          { transform: `translate(${bx}px,${by}px) scale(.92,1.06)`, offset: 0.2 },
          { transform: `translate(${dx}px,${dy}px) scale(1.1,.9)`, offset: HIT, easing: "linear" },
          { transform: `translate(${dx * 0.97}px,${dy * 0.97}px) scale(1.06,.95)`, offset: 0.58 },
          { transform: "translate(0,0) scale(1)" },
        ], TOTAL, { easing: "cubic-bezier(.5,0,.4,1)" });
        await wait(TOTAL * HIT);
        // 当たった
        sfx.hit(ev.match);
        const p = center(tb);
        burst(p.x + (Math.random() - 0.5) * 16, p.y + (Math.random() - 0.5) * 16, color[ev.side][ev.slot], ev.match);
        damagePop(p.x, p.y - 10, ev.damage, ev.match);
        const k = ev.match === "strong" ? 9 : ev.match === "weak" ? 2 : 5;
        void play(arena, [
          { transform: `translate(${k}px,${-k / 2}px)` }, { transform: `translate(${-k}px,${k / 2}px)` },
          { transform: `translate(${k / 2}px,0)` }, { transform: "none" },
        ], ev.match === "strong" ? 260 : 180, { easing: "linear" });
        void play(t.querySelector(".fighter-art"), [{ filter: "brightness(2.6) saturate(.2)" }, { filter: "brightness(2.6) saturate(.2)", offset: 0.35 }, { filter: "none" }], 220);
        void play(tb, [
          { transform: "translate(0,0) rotate(0)" },
          { transform: `translate(${(dx / len) * 14}px,${(dy / len) * 14}px) rotate(${dx >= 0 ? 6 : -6}deg)`, offset: 0.3 },
          { transform: "translate(0,0) rotate(0)" },
        ], 360);
        const mx = maxHp[foe][ev.target];
        const rate = ev.hpAfter / mx;
        t.querySelector<HTMLElement>(".gauge span")!.style.width = `${rate * 100}%`;
        t.querySelector<HTMLElement>(".gauge i")!.style.width = `${rate * 100}%`;
        t.querySelector(".gauge")!.classList.toggle("low", rate <= 0.3);
        t.querySelector(".gauge")!.setAttribute("aria-valuenow", String(ev.hpAfter));
        t.querySelector(".gauge-text")!.textContent = `残り${ev.hpAfter}ml`;
        const extra = ev.match === "strong" ? `　${ev.reason}！` : ev.match === "weak" ? "　あまり効いていない" : "";
        line(`${names[ev.side][ev.slot]}の「${ev.move}」→ ${names[foe][ev.target]}に${ev.damage}ml${extra}`, ev.match === "strong" ? "strong" : "");
        await attack;
        fx(ev.side, ev.slot).classList.remove("acting");
        await wait(ev.match === "strong" ? 380 : 200);
        break;
      }
      case "down": {
        const el = fx(ev.side, ev.slot);
        downed[ev.side].add(ev.slot);
        sfx.down();
        callout(`${names[ev.side][ev.slot]}は飲み干された……`, "", "down");
        line(`${names[ev.side][ev.slot]}は飲み干された……`, "down");
        const up = ev.side === 1 ? -1 : 1;
        await play(el.querySelector(".fighter-body"), [
          { transform: "translate(0,0) rotate(0) scale(1)" },
          { transform: `translate(0,${-18 * up}px) rotate(-14deg) scale(1.05,.9)`, offset: 0.3 },
          { transform: `translate(0,${10 * up}px) rotate(-18deg) scale(.9,.6)` },
        ], 520, { easing: "cubic-bezier(.3,.6,.4,1)" });
        el.classList.add("down");
        await wait(250);
        const left = res.fighters[ev.side].filter((f) => !downed[ev.side].has(f.slot));
        if (left.length) {
          await arrange(ev.side as 0 | 1, true);
          callout(`${left[0].spec.name}が前へ！`, "", "", ev.side);
          await play(fx(ev.side, left[0].slot).querySelector(".fighter-body"), [{ transform: "translateY(0)" }, { transform: `translateY(${-14}px)`, offset: 0.4 }, { transform: "translateY(0)" }], 320);
          await wait(250);
        }
        break;
      }
      case "end": {
        $<HTMLButtonElement>("#battle-skip").hidden = true;
        $(".fx").innerHTML = "";
        $(".arena-mid").innerHTML = "";
        const won = ev.winner === 0;
        if (ev.winner === 0) sfx.win();
        else if (ev.winner === 1) sfx.lose();
        if (ev.winner !== -1) {
          const side = ev.winner;
          for (const f of res.fighters[side]) {
            if (downed[side].has(f.slot)) continue;
            void play(body(side, f.slot), [{ transform: "translateY(0)" }, { transform: "translateY(-20px)", offset: 0.3 }, { transform: "translateY(0)", offset: 0.6 }, { transform: "translateY(-10px)", offset: 0.8 }, { transform: "translateY(0)" }], 700, { delay: f.slot * 90 });
          }
        }
        if (!skip) await cutin(won ? "勝ち！" : ev.winner === 1 ? "負け……" : "引き分け", won ? "combo" : "");
        const r = $(".battle-result");
        r.hidden = false;
        r.dataset.win = String(ev.winner);
        $(".battle-result-title").textContent = won ? "勝ち！" : ev.winner === 1 ? "負け……" : "引き分け";
        $(".battle-result-sub").textContent =
          ev.reason === "ko" ? (won ? "あいてのチームを全員飲み干した" : "こちらのチームが全員飲み干された") : "時間切れ。残りの量で判定";
        $<HTMLButtonElement>("#battle-again").focus({ preventScroll: true });
        r.scrollIntoView({ behavior: skip ? "auto" : "smooth", block: "nearest" });
        break;
      }
    }
  }
}

function renderSound() {
  const b = $<HTMLButtonElement>("#battle-sound");
  b.setAttribute("aria-pressed", String(!isMuted()));
  b.textContent = isMuted() ? "音なし" : "音あり";
}

export function initBattle(d: Deps) {
  deps = d;
  $("#team-go").addEventListener("click", () => runBattle());
  $("#team-letter").addEventListener("click", () => sendLetter());
  $("#team-back").addEventListener("click", () => deps.setView("home"));
  $("#battle-skip").addEventListener("click", () => (skip = true));
  $("#battle-again").addEventListener("click", () => opponent && openTeam(opponent));
  $("#battle-home").addEventListener("click", () => deps.setView("home"));
  $("#btn-battle").addEventListener("click", () => openDaily());
  $("#battle-sound").addEventListener("click", () => {
    setMuted(!isMuted());
    unlock();
    renderSound();
  });
  renderSound();
}

export function openDaily() {
  const key = dateKey();
  openTeam({ kind: "daily", title: "今日の挑戦者", members: dailyChallenger(key, FLAVORS.map((f) => f.id)), code: "daily:" + key });
}

/** URLの ?vs= を読む。あれば挑戦状として開く。 */
export function checkLetter(): "opened" | "no-team" | "none" {
  const code = new URLSearchParams(location.search).get("vs");
  if (!code) return "none";
  const members = decodeTeam(code);
  if (!members) return "none";
  history.replaceState(null, "", location.pathname + location.hash);
  const op: Opponent = { kind: "letter", title: "挑戦状の相手", members, code: "letter:" + code };
  if (allLots().length === 0) {
    pending = op;
    return "no-team";
  }
  openTeam(op);
  return "opened";
}

export function hasPendingLetter() {
  return pending !== null;
}
export function openPendingLetter() {
  if (pending) {
    const op = pending;
    pending = null;
    openTeam(op);
  }
}

