// 手を出せる試合。計算は core/live.ts が0.1秒ごとに1コマ進め、ここは操作を渡して結果を映す。
// 攻撃は1つずつ出る（core/live.ts の列）。押した技も、今の攻撃が終わってから出る。
// できること：相手をタップして「ねらう」、効き目が付いた味方を「ふく」、ゲージがたまったら「技」。「倍速」で2倍の速さで見られる。
// 手応え（ため・体当たり・しぶき・縞のはじけ・揺れ・効果音）は見た目だけで、勝敗や数値には関わらない。

import { encodeTeam, matchup } from "../../core/battle";
import { createLive, EFFECT_LABEL, EFFECT_OF, LIVE, moveQueued, remaining, stepLive, type Effect, type LiveEvent, type LiveFighter, type LiveInput, type Style } from "../../core/live";
import type { Taste } from "../../core/creature";
import { isMuted, setMuted, sfx, unlock } from "../../device/sfx";
import { recordDaily } from "../../store/daily";
import { currentMatch, markLetterFought } from "../battle-session";
import { burst, callout, centerIn, cutin, damagePop, play, popText, shake } from "../battle-fx";
import { $ } from "../dom";
import { characterSvg, TASTE_COLOR, tasteChip } from "../parts";
import { clearReceipt, receiptHtml, showReceipt } from "../receipt";
import { navigate, type View } from "../router";
import { canUse3d, setWant3d, setWantFast, want3d, wantFast } from "../stage-pref";
import type { Stage } from "../stage3d";

const ME = 0, FOE = 1;
const START_DELAY = 1400; // 並びを見てから始まるまで
const STYLE_LABEL: Record<Style, string> = { karada: "からだ型", aji: "あじ型", both: "両方" };
/** 効き目の色は、その効き目を付ける味の色。 */
const EFFECT_COLOR = Object.fromEntries(Object.entries(EFFECT_OF).map(([taste, e]) => [e, TASTE_COLOR[taste as Taste]])) as Record<Effect, string>;
const clock = (ticks: number) => {
  const s = Math.max(0, Math.ceil((ticks * LIVE.tickMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function fighterHtml(f: LiveFighter): string {
  const mine = f.side === ME;
  // あいては体ごとタップして「ねらう」
  const tap = mine ? "" : ` role="button" tabindex="0" aria-pressed="false" aria-label="${f.spec.name}をねらう"`;
  return `<div class="lf${mine ? "" : " lf-foe"}" data-side="${f.side}" data-slot="${f.slot}"${tap}>
    <div class="lf-art"><div class="lf-body">${characterSvg(f)}</div><i class="edge" hidden></i><i class="lf-warn" aria-hidden="true">！</i><i class="lf-aim" aria-hidden="true">ねらう</i><span class="lf-style" data-style="${f.style}">${STYLE_LABEL[f.style]}</span></div>
    <div class="lf-name">${f.spec.name}</div>
    ${tasteChip(f.spec.taste)}
    <div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="${f.maxHp}" aria-valuenow="${f.maxHp}" aria-label="${f.spec.name}の残り"><i></i><span></span></div>
    <div class="lf-fx" aria-hidden="true"></div>
    ${
      mine
        ? `<div class="lf-keys">
             <button type="button" class="lf-wipe" disabled aria-label="${f.spec.name}をふく">ふく</button>
             <button type="button" class="lf-move" disabled aria-label="${f.spec.name}の技「${f.spec.move}」"><span class="lf-move-fill"></span><b>${f.spec.move}</b><i class="lf-move-wait" aria-hidden="true">次に出る</i></button>
           </div>`
        : `<div class="lf-charge" aria-hidden="true"><span></span></div>`
    }
  </div>`;
}

export const battleLiveView: View = ({ root }) => {
  const match = currentMatch();
  if (!match) {
    navigate("/battle", { replace: true });
    return;
  }
  const { mode, opponent, team } = match;
  const state = createLive(team, opponent.members, `${opponent.code}:${encodeTeam(team)}`, [false, true]);
  const use3d = want3d() && canUse3d();
  let fast = wantFast();
  const tickMs = () => LIVE.tickMs / (fast ? 2 : 1); // 実際の時間での1コマ

  root.innerHTML = `
    <section class="live${use3d ? " is-3d" : ""}" aria-label="バトル">
      <div class="battle-top">
        <p class="battle-title">${opponent.title}</p>
        <button type="button" class="sound stage-toggle">${use3d ? "2Dで見る" : "3Dで見る"}</button>
        <button type="button" class="sound" data-sound aria-pressed="${!isMuted()}">${isMuted() ? "音なし" : "音あり"}</button>
        <button type="button" class="sound speed" aria-pressed="${fast}">倍速</button>
        <p class="live-clock" aria-label="のこり時間">${clock(LIVE.timeLimit)}</p>
      </div>
      <div class="arena">
        <div class="live-row" data-side="${FOE}">${state.fighters[FOE].map(fighterHtml).join("")}</div>
        ${
          use3d
            ? `<div class="stage3d"><div class="arena-mid"></div><div class="fx" aria-hidden="true"></div></div>`
            : `<div class="arena-mid"><p class="live-hint">あいてをタップしてねらう</p></div>`
        }
        <div class="live-row" data-side="${ME}">${state.fighters[ME].map(fighterHtml).join("")}</div>
        ${use3d ? "" : `<div class="fx" aria-hidden="true"></div>`}
      </div>
      <p class="live-log visually-hidden" aria-live="polite"></p>
      ${receiptHtml()}
    </section>`;

  // 画面の部品を先に拾っておく（毎コマ探さない）
  const cells = state.fighters.map((t) =>
    t.map((f) => {
      const el = $(`.lf[data-side="${f.side}"][data-slot="${f.slot}"]`, root);
      return {
        el,
        body: $(".lf-body", el),
        edge: $(".edge", el),
        bar: $(".gauge span", el),
        lag: $(".gauge i", el),
        meter: $(".gauge", el),
        fx: $(".lf-fx", el),
        fxKey: "",
        wipe: el.querySelector<HTMLButtonElement>(".lf-wipe"),
        move: el.querySelector<HTMLButtonElement>(".lf-move"),
        fill: el.querySelector<HTMLElement>(".lf-move-fill, .lf-charge span")!,
      };
    }),
  );
  const arena = $(".arena", root);
  const fxLayer = $(".fx", root);
  const mid = $(".arena-mid", root);
  const log = $(".live-log", root);
  const clockEl = $(".live-clock", root);
  const names = state.fighters.map((t) => t.map((f) => f.spec.name));
  const colors = state.fighters.map((t) => t.map((f) => f.spec.palette.body));
  const tasteColors = state.fighters.map((t) => t.map((f) => TASTE_COLOR[f.spec.taste]));
  const say = (text: string) => (log.textContent = text); // 画面を読み上げる人向け
  const sideName = (s: number) => (s === ME ? "こちら" : "あいて");

  const soundBtn = $<HTMLButtonElement>("[data-sound]", root);
  soundBtn.addEventListener("click", () => {
    setMuted(!isMuted());
    unlock();
    soundBtn.setAttribute("aria-pressed", String(!isMuted()));
    soundBtn.textContent = isMuted() ? "音なし" : "音あり";
  });

  // 倍速：押すとすぐ切り替わる（試合は続く）。端末に覚える
  const speedBtn = $<HTMLButtonElement>(".speed", root);
  speedBtn.addEventListener("click", () => {
    fast = !fast;
    setWantFast(fast);
    speedBtn.setAttribute("aria-pressed", String(fast));
    say(fast ? "倍速にした" : "ふつうの速さにした");
  });

  // ---- 3Dの舞台（お試し）。読み込めなければ2Dに戻す ----
  let stage: Stage | null = null;
  $(".stage-toggle", root).addEventListener("click", () => {
    setWant3d(!use3d);
    location.reload(); // 試合の途中でも最初から（お試しの見比べ用）
  });
  if (use3d) {
    import("../stage3d")
      .then((m) => m.createStage($(".stage3d", root), state.fighters))
      .then((s) => {
        if (gone) s.dispose();
        else {
          stage = s;
          s.aim(state.aim[ME]);
        }
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.error("3Dの舞台を作れませんでした", e);
        // WebGLが動かない端末：絵を出して2Dのまま続ける
        root.querySelector(".live")?.classList.remove("is-3d");
      });
  }

  /** 体の真ん中（.fx の中の座標）。3Dなら舞台の中の位置。 */
  const spot = (side: number, slot: number) => stage?.where(side as 0 | 1, slot) ?? centerIn(fxLayer, cells[side][slot].body);

  /** 今の状態を画面に映す。 */
  function draw() {
    clockEl.textContent = clock(LIVE.timeLimit - state.tick);
    const aimed = state.aim[ME];
    // 相手の「ため」が向いている味方
    const targeted = new Set(state.fighters[FOE].filter((f) => f.hp > 0 && f.windup > 0).map((f) => f.windupTarget));
    for (const side of [ME, FOE] as const) {
      state.fighters[side].forEach((f, i) => {
        const c = cells[side][i];
        const down = f.hp <= 0;
        c.el.classList.toggle("down", down);
        c.el.classList.toggle("is-winding", f.windup > 0 && !down);
        c.el.classList.toggle("is-targeted", side === ME && targeted.has(i) && !down);
        const rate = f.hp / f.maxHp;
        c.bar.style.width = `${rate * 100}%`;
        c.lag.style.width = `${rate * 100}%`;
        c.meter.classList.toggle("low", rate <= 0.3);
        c.meter.setAttribute("aria-valuenow", String(f.hp));
        c.fill.style.width = `${(f.gauge / LIVE.gaugeMax) * 100}%`;
        // 効き目の札（変わったときだけ作り直す）
        const effects = (Object.keys(f.effects) as Effect[]).sort();
        const key = effects.join(",");
        if (key !== c.fxKey) {
          c.fxKey = key;
          c.fx.innerHTML = effects.map((e) => `<i style="--c:${EFFECT_COLOR[e]}">${EFFECT_LABEL[e]}</i>`).join("");
          c.el.classList.toggle("stained", effects.length > 0);
          if (effects.length) c.el.style.setProperty("--stain", EFFECT_COLOR[effects[effects.length - 1]]);
        }
        // 印：こちらの子は、ねらっている相手に強いか弱いか。あいての子は、こちらのみんなから見て強いか弱いか
        let m: "strong" | "weak" | "even" = "even";
        if (!down && side === ME && aimed !== null) m = matchup(f.spec.taste, state.fighters[FOE][aimed].spec.taste);
        if (!down && side === FOE) {
          const net = state.fighters[ME].filter((x) => x.hp > 0).reduce((a, x) => {
            const k = matchup(x.spec.taste, f.spec.taste);
            return a + (k === "strong" ? 1 : k === "weak" ? -1 : 0);
          }, 0);
          m = net > 0 ? "strong" : net < 0 ? "weak" : "even";
        }
        c.edge.hidden = m === "even";
        c.edge.dataset.kind = m;
        c.edge.textContent = m === "strong" ? "強" : "弱";
        if (side === FOE) {
          const on = aimed === i && !down;
          c.el.classList.toggle("is-aimed", on);
          c.el.setAttribute("aria-pressed", String(on));
        }
        if (c.wipe) {
          const wait = state.wipeWait[ME];
          c.wipe.disabled = down || !effects.length || wait > 0 || state.winner !== null;
          c.wipe.classList.toggle("is-ready", !c.wipe.disabled);
          c.wipe.style.setProperty("--wait", String(wait / LIVE.wipeWait));
        }
        if (c.move) {
          const ready = !down && f.gauge >= LIVE.gaugeMax && state.winner === null;
          const queued = ready && moveQueued(state, ME, i); // 押した。今の攻撃が終わったら出る
          c.move.disabled = !ready || queued;
          c.move.classList.toggle("is-ready", ready && !queued);
          c.move.classList.toggle("is-queued", queued);
        }
      });
    }
  }

  /** 攻撃する側から、受ける側へ向かう向き（長さ1）と距離。 */
  function toward(side: number, slot: number, target: number) {
    const a = centerIn(fxLayer, cells[side][slot].body), t = centerIn(fxLayer, cells[1 - side][target].body);
    const dx = t.x - a.x, dy = t.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { ux: dx / len, uy: dy / len, len, from: a, at: t };
  }

  /** 当たった瞬間（2D）。 */
  function impact2d(ev: Extract<LiveEvent, { t: "hit" }>, ux: number, uy: number, at: { x: number; y: number }) {
    const power = ev.move ? "move" : ev.match;
    const target = cells[1 - ev.side][ev.target];
    void play(target.body, [{ filter: "brightness(2.4) saturate(.2)" }, { filter: "none" }], 160);
    void play(target.body.parentElement, [{ transform: "none" }, { transform: `translate(${ux * 8}px,${uy * 8}px) rotate(${ux >= 0 ? 5 : -5}deg)`, offset: 0.3 }, { transform: "none" }], 260);
    const color = ev.kind === "aji" ? tasteColors[ev.side][ev.slot] : colors[ev.side][ev.slot];
    burst(fxLayer, at.x + (Math.random() - 0.5) * 14, at.y + (Math.random() - 0.5) * 14, color, power);
    damagePop(fxLayer, at.x, at.y - 12, ev.damage, power);
    if (ev.move) shake(arena, 9, 300);
    else if (ev.match === "strong") shake(arena, 4, 160);
    sfx.hit(ev.match);
  }

  function moveCallout(ev: Extract<LiveEvent, { t: "hit" }>) {
    sfx.move();
    callout(mid, `${names[ev.side][ev.slot]}の「${ev.move}」`, ev.match === "strong" ? "よく効く！" : ev.match === "weak" ? "あまり効いていない" : "", ev.match === "strong" ? "strong" : ev.match === "weak" ? "weak" : "", ev.side);
    say(`${names[ev.side][ev.slot]}の「${ev.move}」！${ev.match === "strong" ? ` ${ev.reason}` : ""}`);
  }

  function show(events: LiveEvent[]) {
    for (const ev of events) {
      switch (ev.t) {
        case "windup": {
          if (ev.side === FOE) sfx.windup();
          if (stage) {
            stage.windup(ev.side, ev.slot, ev.target, LIVE.windup * tickMs());
            break;
          }
          // ため：からだは体を引く、あじは体をふくらませる（0.4秒）。相手のためは赤い「！」でわかる（draw で付く）
          const { ux, uy } = toward(ev.side, ev.slot, ev.target);
          const pose = ev.kind === "karada" ? `translate(${-ux * 9}px,${-uy * 9}px) scale(.94,1.06)` : `translate(0,${-uy * 4}px) scale(1.08,.94)`;
          void play(cells[ev.side][ev.slot].body, [{ transform: "none" }, { transform: pose }], LIVE.windup * tickMs(), { fill: "forwards", easing: "ease-in" });
          break;
        }
        case "hit": {
          const power = ev.move ? "move" : ev.match;
          if (ev.move) moveCallout(ev);
          if (stage) {
            const color = ev.kind === "aji" ? tasteColors[ev.side][ev.slot] : colors[ev.side][ev.slot];
            stage.hit(ev.side, ev.slot, ev.target, ev.kind, power, color, (x, y) => {
              damagePop(fxLayer, x, y - 18, ev.damage, power);
              sfx.hit(ev.match);
            });
            if (!ev.move) ev.kind === "aji" ? sfx.splash() : sfx.dash();
            break;
          }
          const { ux, uy, len, from, at } = toward(ev.side, ev.slot, ev.target);
          const attacker = cells[ev.side][ev.slot];
          if (ev.kind === "karada") {
            // 体当たり → 当たった瞬間に止まる → もどる
            const reach = Math.min(len * 0.5, ev.move ? 70 : 46);
            void play(attacker.body, [
              { transform: `translate(${-ux * 9}px,${-uy * 9}px) scale(.94,1.06)` },
              { transform: `translate(${ux * reach}px,${uy * reach}px) scale(1.1,.9)`, offset: 0.35, easing: "linear" },
              { transform: `translate(${ux * reach * 0.95}px,${uy * reach * 0.95}px)`, offset: 0.55 },
              { transform: "none" },
            ], ev.move ? 420 : 260, { easing: "cubic-bezier(.5,0,.4,1)" });
            if (!ev.move) sfx.dash();
            impact2d(ev, ux, uy, at);
          } else {
            // あじ：その場で体をしぼって、味のしぶきを飛ばす。しぶきが届いたら当たる
            void play(attacker.body, [{ transform: `translate(0,${-uy * 4}px) scale(1.08,.94)` }, { transform: `translate(${ux * 6}px,${uy * 6}px) scale(.9,1.1)`, offset: 0.3 }, { transform: "none" }], 280);
            if (!ev.move) sfx.splash();
            const drop = document.createElement("i");
            drop.className = "drop";
            if (ev.move) drop.dataset.big = "";
            drop.style.setProperty("--c", tasteColors[ev.side][ev.slot]);
            drop.style.left = `${from.x}px`;
            drop.style.top = `${from.y}px`;
            fxLayer.appendChild(drop);
            const dx = at.x - from.x, dy = at.y - from.y;
            const arc = Math.max(24, len * 0.25);
            const turn = Math.atan2(dy, dx) * (180 / Math.PI);
            void play(drop, [
              { transform: `translate(-50%,-50%) rotate(${turn}deg) scale(.5)` },
              { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - arc}px)) rotate(${turn}deg) scale(1.1,.85)`, offset: 0.5 },
              { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${turn}deg) scale(1.3,.7)` },
            ], ev.move ? 360 : 250, { easing: "linear" }).then(() => {
              drop.remove();
              if (!gone) impact2d(ev, ux, uy, at);
            });
          }
          break;
        }
        case "effect": {
          if (!ev.on) break;
          sfx.stain();
          const p = spot(ev.side, ev.slot);
          popText(fxLayer, p.x, p.y - 34, EFFECT_LABEL[ev.effect], "effect", EFFECT_COLOR[ev.effect]);
          say(`${names[ev.side][ev.slot]}は${EFFECT_LABEL[ev.effect]}`);
          break;
        }
        case "burn": {
          const p = spot(ev.side, ev.slot);
          popText(fxLayer, p.x + 14, p.y - 6, `-${ev.damage}`, "burn");
          void play(cells[ev.side][ev.slot].body, [{ filter: "brightness(1.4) sepia(.6) hue-rotate(-30deg)" }, { filter: "none" }], 220);
          break;
        }
        case "heal": {
          sfx.heal();
          const p = spot(ev.side, ev.slot);
          popText(fxLayer, p.x, p.y - 10, `+${ev.amount}`, "heal");
          say(`${names[ev.side][ev.slot]}が${ev.amount}ml回復`);
          break;
        }
        case "wipe": {
          sfx.wipe();
          const p = spot(ev.side, ev.slot);
          popText(fxLayer, p.x, p.y - 24, "ふいた", "wipe");
          void play(cells[ev.side][ev.slot].body, [{ transform: "none" }, { transform: "rotate(-6deg)", offset: 0.25 }, { transform: "rotate(5deg)", offset: 0.6 }, { transform: "none" }], 320);
          stage?.wipe(ev.side, ev.slot);
          say(`${sideName(ev.side)}は${names[ev.side][ev.slot]}をふいた`);
          break;
        }
        case "aim":
          if (ev.side === ME) {
            stage?.aim(ev.target);
            if (ev.target !== null) say(`${names[FOE][ev.target]}をねらう`);
          }
          break;
        case "ready":
          if (ev.side === ME) sfx.ready();
          break;
        case "down": {
          sfx.down();
          callout(mid, `${names[ev.side][ev.slot]}は飲み干された……`, "", "down");
          say(`${names[ev.side][ev.slot]}は飲み干された`);
          if (stage) {
            stage.down(ev.side, ev.slot);
            break;
          }
          const up = ev.side === FOE ? -1 : 1;
          void play(cells[ev.side][ev.slot].body, [
            { transform: "none" },
            { transform: `translate(0,${-16 * up}px) rotate(-14deg) scale(1.05,.9)`, offset: 0.3 },
            { transform: `translate(0,${8 * up}px) rotate(-18deg) scale(.9,.6)` },
          ], 480, { easing: "cubic-bezier(.3,.6,.4,1)" });
          break;
        }
        case "end":
          void finish(ev);
          break;
      }
    }
  }

  async function finish(ev: Extract<LiveEvent, { t: "end" }>) {
    stop();
    draw();
    mid.innerHTML = "";
    // 結果は決着した時点で記録する（このあとの演出の途中で画面を離れても残る）
    if (opponent.kind === "daily") recordDaily(opponent.date!, ev.winner === ME ? "win" : ev.winner === FOE ? "lose" : "draw");
    else markLetterFought();
    if (ev.winner === ME) sfx.win();
    else if (ev.winner === FOE) sfx.lose();
    if (ev.winner !== -1) stage?.cheer(ev.winner);
    stage?.settle();
    if (ev.winner !== -1 && !stage) {
      state.fighters[ev.winner].forEach((f, i) => {
        if (f.hp > 0) void play(cells[ev.winner as 0 | 1][i].body, [{ transform: "none" }, { transform: "translateY(-18px)", offset: 0.3 }, { transform: "none", offset: 0.6 }, { transform: "translateY(-8px)", offset: 0.8 }, { transform: "none" }], 700, { delay: i * 90 });
      });
    }
    await cutin(fxLayer, ev.winner === ME ? "勝ち！" : ev.winner === FOE ? "負け……" : "引き分け", ev.winner === ME ? "combo" : "");
    if (gone) return;
    showReceipt(root, {
      winner: ev.winner,
      sub: ev.reason === "ko" ? (ev.winner === ME ? "あいてのチームを全員飲み干した" : "こちらのチームが全員飲み干された") : "時間切れ。残りの量で判定",
      lines: [["かかった時間", clock(state.tick)], ["こちらの残り", `${remaining(state, ME)}ml`], ["あいての残り", `${remaining(state, FOE)}ml`]],
      mode,
      team,
    });
  }

  // ---- 操作 ----
  let pending: LiveInput[] = [];
  /** 最後に送った「ねらう」（コマが進む前に何度押しても、行き先は最後の1つ）。 */
  let aimNext: number | null = null;
  const tapFoe = (slot: number) => {
    if (state.winner !== null || state.fighters[FOE][slot].hp <= 0) return;
    unlock();
    const now = pending.some((p) => p.t === "aim") ? aimNext : state.aim[ME];
    aimNext = now === slot ? null : slot; // もう一度押すとやめる
    pending = pending.filter((p) => p.t !== "aim");
    pending.push({ side: ME, t: "aim", slot: aimNext });
    if (aimNext !== null) sfx.aim();
    root.querySelector(".live-hint")?.remove();
  };
  cells[FOE].forEach((c, slot) => {
    c.el.addEventListener("click", () => tapFoe(slot));
    c.el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        tapFoe(slot);
      }
    });
  });
  cells[ME].forEach((c, slot) => {
    c.wipe?.addEventListener("click", () => {
      unlock();
      pending.push({ side: ME, t: "wipe", slot });
    });
    c.move?.addEventListener("click", () => {
      unlock();
      pending.push({ side: ME, t: "move", slot });
    });
  });

  // ---- 進行：実際の時間に合わせて、たまったぶんだけコマを進める ----
  let timer = 0;
  let last = 0;
  let owed = 0;
  let gone = false;
  const stop = () => {
    clearInterval(timer);
    clearTimeout(timer);
    timer = 0;
  };
  function loop() {
    const now = performance.now();
    owed += document.hidden ? 0 : now - last; // 画面を離れている間は止める
    last = now;
    let steps = 0;
    const step = tickMs();
    while (owed >= step && steps++ < 5 && state.winner === null) {
      owed -= step;
      const inputs = pending;
      pending = [];
      show(stepLive(state, inputs));
    }
    if (owed > step * 5) owed = 0; // 長く止まっていたぶんは追いかけない
    if (state.winner === null) draw();
  }

  draw();
  sfx.start();
  void (async () => {
    await cutin(fxLayer, "バトル開始！");
    for (const ev of state.setup) {
      if (gone) return;
      if (ev.t === "combo") {
        sfx.combo();
        await cutin(fxLayer, `${sideName(ev.side)}の組み合わせ技　${ev.name}`, "combo");
      } else if (ev.t === "trio") {
        sfx.combo();
        await cutin(fxLayer, `${sideName(ev.side)}は「${ev.taste}」でそろい踏み`, "combo");
      }
    }
  })();
  timer = window.setTimeout(() => {
    last = performance.now();
    timer = window.setInterval(loop, 50);
  }, START_DELAY);

  return () => {
    gone = true;
    stop();
    stage?.dispose();
    clearReceipt();
  };
};
