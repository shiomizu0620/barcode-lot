// チーム選択とバトル画面。

import { COMBOS, dailyChallenger, decodeTeam, encodeTeam, simulate, type BattleEvent, type Fighter, type Member } from "./battle";
import { allLots, type Lot } from "./lots";
import { FLAVORS } from "./product";
import { storedProfile } from "./profile";
import { lotLook, specFor } from "./creature";
import { renderCharacter } from "./render";

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
const wait = (ms: number) => new Promise((r) => setTimeout(r, skip ? 0 : ms));

function fighterHtml(f: Fighter): string {
  return `<div class="fighter" data-side="${f.side}" data-slot="${f.slot}">
    <div class="fighter-art">${renderCharacter(f.spec, f.look).svg}</div>
    <div class="fighter-name">${f.spec.name}</div>
    <div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="${f.maxHp}" aria-valuenow="${f.maxHp}" aria-label="${f.spec.name}の残り"><span style="width:100%"></span></div>
    <div class="gauge-text">残り${f.maxHp}ml</div>
  </div>`;
}

function line(text: string, tone = "") {
  const log = $(".battle-log");
  const p = document.createElement("p");
  p.textContent = text;
  if (tone) p.dataset.tone = tone;
  log.prepend(p);
  while (log.children.length > 4) log.lastElementChild!.remove();
}

async function runBattle() {
  if (!opponent) return;
  const mine = pickedLots().map(memberOf);
  const seed = `${opponent.code}:${encodeTeam(mine)}`;
  const res = simulate(mine, opponent.members, seed);
  skip = reduced;
  const fx = (side: number, slot: number) => document.querySelector(`.fighter[data-side="${side}"][data-slot="${slot}"]`) as HTMLElement;
  $(".row-foe").innerHTML = res.fighters[1].map(fighterHtml).join("");
  $(".row-mine").innerHTML = res.fighters[0].map(fighterHtml).join("");
  $(".battle-log").innerHTML = "";
  $(".battle-result").hidden = true;
  $<HTMLButtonElement>("#battle-skip").hidden = false;
  deps.setView("battle");
  const names = res.fighters.map((t) => t.map((f) => f.spec.name));
  const maxHp = res.fighters.map((t) => t.map((f) => f.maxHp));
  const sideName = (s: number) => (s === 0 ? "こちら" : "あいて");

  line(`${opponent.title}とのバトル開始`);
  await wait(700);
  for (const ev of res.events as BattleEvent[]) {
    switch (ev.t) {
      case "combo":
        line(`${sideName(ev.side)}の組み合わせ技「${ev.name}」！ ${ev.slots.map((s) => names[ev.side][s]).join("と")}の濃さが上がった`, "combo");
        for (const s of ev.slots) fx(ev.side, s).classList.add("boosted");
        await wait(1100);
        break;
      case "trio":
        line(`${sideName(ev.side)}は「${ev.taste}」でそろい踏み。守りが上がった`, "combo");
        await wait(900);
        break;
      case "round":
        break;
      case "hit": {
        const a = fx(ev.side, ev.slot), t = fx(1 - ev.side, ev.target);
        a.classList.remove("act"); void a.offsetWidth; a.classList.add("act");
        await wait(220);
        t.classList.remove("hurt"); void t.offsetWidth; t.classList.add("hurt");
        const bar = t.querySelector<HTMLElement>(".gauge span")!;
        const mx = maxHp[1 - ev.side][ev.target];
        bar.style.width = `${(ev.hpAfter / mx) * 100}%`;
        t.querySelector(".gauge")!.setAttribute("aria-valuenow", String(ev.hpAfter));
        t.querySelector(".gauge-text")!.textContent = `残り${ev.hpAfter}ml`;
        if (!skip) {
        const pop = document.createElement("span");
        pop.className = "dmg";
        pop.dataset.match = ev.match;
        pop.textContent = `-${ev.damage}ml`;
        t.appendChild(pop);
        setTimeout(() => pop.remove(), 900);
        }
        const extra = ev.match === "strong" ? `　${ev.reason}！` : ev.match === "weak" ? "　あまり効いていない" : "";
        line(`${names[ev.side][ev.slot]}の「${ev.move}」→ ${names[1 - ev.side][ev.target]}に${ev.damage}ml${extra}`, ev.match === "strong" ? "strong" : "");
        await wait(ev.match === "strong" ? 900 : 650);
        break;
      }
      case "down":
        fx(ev.side, ev.slot).classList.add("down");
        line(`${names[ev.side][ev.slot]}は飲み干された……`, "down");
        await wait(700);
        break;
      case "end": {
        $<HTMLButtonElement>("#battle-skip").hidden = true;
        const r = $(".battle-result");
        r.hidden = false;
        r.dataset.win = String(ev.winner);
        $(".battle-result-title").textContent = ev.winner === 0 ? "勝ち！" : ev.winner === 1 ? "負け……" : "引き分け";
        $(".battle-result-sub").textContent =
          ev.reason === "ko" ? (ev.winner === 0 ? "あいてのチームを全員飲み干した" : "こちらのチームが全員飲み干された") : "時間切れ。残りの量で判定";
        $<HTMLButtonElement>("#battle-again").focus({ preventScroll: true });
        break;
      }
    }
  }
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

