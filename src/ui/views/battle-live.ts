// 手を出せる試合。計算は core/live.ts が0.1秒ごとに1コマ進め、ここは操作を渡して結果を映す。
// できること：「前へ」で先頭を入れ替える、ゲージがたまったら「技」を出す。
// 手応え（ため・体当たり・縞のはじけ・揺れ・効果音）は見た目だけで、勝敗や数値には関わらない。

import { encodeTeam, matchup } from "../../core/battle";
import { createLive, LIVE, remaining, stepLive, type LiveEvent, type LiveFighter, type LiveInput } from "../../core/live";
import { isMuted, setMuted, sfx, unlock } from "../../device/sfx";
import { recordDaily } from "../../store/daily";
import { currentMatch, markLetterFought } from "../battle-session";
import { burst, callout, centerIn, cutin, damagePop, play, shake } from "../battle-fx";
import { $ } from "../dom";
import { characterSvg, tasteChip } from "../parts";
import { clearReceipt, receiptHtml, showReceipt } from "../receipt";
import { navigate, type View } from "../router";
import { canUse3d, setWant3d, want3d } from "../stage-pref";
import type { Stage } from "../stage3d";

const ME = 0, FOE = 1;
const START_DELAY = 1400; // 並びを見てから始まるまで
const clock = (ticks: number) => {
  const s = Math.max(0, Math.ceil((ticks * LIVE.tickMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function fighterHtml(f: LiveFighter): string {
  const mine = f.side === ME;
  return `<div class="lf" data-side="${f.side}" data-slot="${f.slot}">
    <div class="lf-art"><div class="lf-body">${characterSvg(f)}</div><i class="edge" hidden></i><i class="lf-warn" aria-hidden="true">！</i></div>
    <div class="lf-name">${f.spec.name}</div>
    ${tasteChip(f.spec.taste)}
    <div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="${f.maxHp}" aria-valuenow="${f.maxHp}" aria-label="${f.spec.name}の残り"><i></i><span></span></div>
    ${
      mine
        ? `<button type="button" class="btn small lf-front" aria-label="${f.spec.name}を先頭にする">前へ</button>
           <button type="button" class="lf-move" disabled aria-label="${f.spec.name}の技「${f.spec.move}」"><span class="lf-move-fill"></span><b>${f.spec.move}</b></button>`
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

  root.innerHTML = `
    <section class="live${use3d ? " is-3d" : ""}" aria-label="バトル">
      <div class="battle-top">
        <p class="battle-title">${opponent.title}</p>
        <button type="button" class="sound stage-toggle">${use3d ? "2Dで見る" : "3Dで見る"}</button>
        <button type="button" class="sound" data-sound aria-pressed="${!isMuted()}">${isMuted() ? "音なし" : "音あり"}</button>
        <p class="live-clock" aria-label="のこり時間">${clock(LIVE.timeLimit)}</p>
      </div>
      <div class="arena">
        <div class="live-row" data-side="${FOE}">${state.fighters[FOE].map(fighterHtml).join("")}</div>
        ${
          use3d
            ? `<div class="stage3d"><div class="arena-mid"></div><div class="fx" aria-hidden="true"></div></div>`
            : `<div class="arena-mid"></div>`
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
        front: el.querySelector<HTMLButtonElement>(".lf-front"),
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
  const say = (text: string) => (log.textContent = text); // 画面を読み上げる人向け

  const soundBtn = $<HTMLButtonElement>("[data-sound]", root);
  soundBtn.addEventListener("click", () => {
    setMuted(!isMuted());
    unlock();
    soundBtn.setAttribute("aria-pressed", String(!isMuted()));
    soundBtn.textContent = isMuted() ? "音なし" : "音あり";
  });

  // ---- 3Dの舞台（お試し）。読み込めなければ2Dに戻す ----
  let stage: Stage | null = null;
  $(".stage-toggle", root).addEventListener("click", () => {
    setWant3d(!use3d);
    location.reload(); // 試合の途中でも最初から（お試しの見比べ用）
  });
  if (use3d) {
    import("../stage3d")
      .then((m) => m.createStage($(".stage3d", root), state.fighters, state.front))
      .then((s) => {
        if (gone) s.dispose();
        else stage = s;
      })
      .catch((e) => {
        if (import.meta.env.DEV) console.error("3Dの舞台を作れませんでした", e);
        // WebGLが動かない端末：絵を出して2Dのまま続ける
        root.querySelector(".live")?.classList.remove("is-3d");
      });
  }

  /** 先頭を真ん中に置く。入れ替わるときはすべるように動かす。 */
  function arrange(side: 0 | 1, animate: boolean) {
    stage?.arrange(side, state.front[side], animate);
    const els = cells[side].map((c) => c.el);
    const before = els.map((el) => el.getBoundingClientRect());
    const front = state.front[side];
    const rest = [0, 1, 2].filter((s) => s !== front && s < els.length);
    els.forEach((el, i) => (el.style.order = String(i === front ? 2 : i === rest[0] ? 1 : 3)));
    if (!animate) return;
    els.forEach((el, i) => {
      const dx = before[i].left - el.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) void play(el, [{ transform: `translateX(${dx}px)` }, { transform: "translateX(-5px)", offset: 0.8 }, { transform: "none" }], 320, { easing: "cubic-bezier(.3,.7,.3,1)" });
    });
  }

  /** 今の状態を画面に映す。 */
  function draw() {
    clockEl.textContent = clock(LIVE.timeLimit - state.tick);
    for (const side of [ME, FOE] as const) {
      const foeFront = state.fighters[1 - side][state.front[1 - side]];
      state.fighters[side].forEach((f, i) => {
        const c = cells[side][i];
        const isFront = state.front[side] === i;
        const down = f.hp <= 0;
        c.el.classList.toggle("is-front", isFront && !down);
        c.el.classList.toggle("down", down);
        c.el.classList.toggle("is-winding", f.windup > 0 && !down);
        const rate = f.hp / f.maxHp;
        c.bar.style.width = `${rate * 100}%`;
        c.lag.style.width = `${rate * 100}%`;
        c.meter.classList.toggle("low", rate <= 0.3);
        c.meter.setAttribute("aria-valuenow", String(f.hp));
        c.fill.style.width = `${(f.gauge / LIVE.gaugeMax) * 100}%`;
        // 印：この体の攻撃が、いまの相手の先頭に強いか弱いか
        const m = down || !foeFront ? "even" : matchup(f.spec.taste, foeFront.spec.taste);
        c.edge.hidden = m === "even";
        c.edge.dataset.kind = m;
        c.edge.textContent = m === "strong" ? "強" : "弱";
        if (c.front) {
          const wait = state.swapWait[side];
          c.front.disabled = down || isFront || wait > 0 || state.winner !== null;
          c.front.textContent = isFront ? "先頭" : "前へ";
          c.front.style.setProperty("--wait", String(isFront ? 0 : wait / LIVE.swapWait));
        }
        if (c.move) {
          const ready = !down && f.gauge >= LIVE.gaugeMax && state.winner === null;
          c.move.disabled = !ready;
          c.move.classList.toggle("is-ready", ready);
        }
      });
    }
  }

  /** 攻撃する側から、受ける側へ向かう向き（長さ1）と距離。 */
  function aim(side: number, slot: number, target: number) {
    const a = centerIn(fxLayer, cells[side][slot].body), t = centerIn(fxLayer, cells[1 - side][target].body);
    const dx = t.x - a.x, dy = t.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { ux: dx / len, uy: dy / len, len, at: t };
  }

  function show(events: LiveEvent[]) {
    for (const ev of events) {
      switch (ev.t) {
        case "windup": {
          if (stage) {
            stage.windup(ev.side, ev.slot, ev.target);
            if (ev.side === FOE) sfx.windup();
            break;
          }
          // ため：体を引く（0.4秒）。相手のためは赤い「！」でわかる（draw で付く）
          const { ux, uy } = aim(ev.side, ev.slot, ev.target);
          void play(cells[ev.side][ev.slot].body, [{ transform: "none" }, { transform: `translate(${-ux * 9}px,${-uy * 9}px) scale(.94,1.06)` }], LIVE.windup * LIVE.tickMs, { fill: "forwards", easing: "ease-in" });
          if (ev.side === FOE) sfx.windup();
          break;
        }
        case "hit": {
          const power = ev.move ? "move" : ev.match;
          if (stage) {
            stage.hit(ev.side, ev.slot, ev.target, power, colors[ev.side][ev.slot], (x, y) => damagePop(fxLayer, x, y - 18, ev.damage, power));
            if (ev.move) {
              sfx.move();
              callout(mid, `${names[ev.side][ev.slot]}の「${ev.move}」`, ev.match === "strong" ? "よく効く！" : ev.match === "weak" ? "あまり効いていない" : "", ev.match === "strong" ? "strong" : ev.match === "weak" ? "weak" : "", ev.side);
              say(`${names[ev.side][ev.slot]}の「${ev.move}」！${ev.match === "strong" ? ` ${ev.reason}` : ""}`);
            } else {
              sfx.dash();
              sfx.hit(ev.match);
            }
            break;
          }
          const { ux, uy, len, at } = aim(ev.side, ev.slot, ev.target);
          const reach = Math.min(len * 0.5, ev.move ? 70 : 46);
          const attacker = cells[ev.side][ev.slot], target = cells[1 - ev.side][ev.target];
          // 体当たり → 当たった瞬間に止まる → もどる
          void play(attacker.body, [
            { transform: `translate(${-ux * 9}px,${-uy * 9}px) scale(.94,1.06)` },
            { transform: `translate(${ux * reach}px,${uy * reach}px) scale(1.1,.9)`, offset: 0.35, easing: "linear" },
            { transform: `translate(${ux * reach * 0.95}px,${uy * reach * 0.95}px)`, offset: 0.55 },
            { transform: "none" },
          ], ev.move ? 420 : 260, { easing: "cubic-bezier(.5,0,.4,1)" });
          void play(target.body, [{ filter: "brightness(2.4) saturate(.2)" }, { filter: "none" }], 160);
          void play(target.body.parentElement, [{ transform: "none" }, { transform: `translate(${ux * 8}px,${uy * 8}px) rotate(${ux >= 0 ? 5 : -5}deg)`, offset: 0.3 }, { transform: "none" }], 260);
          burst(fxLayer, at.x + (Math.random() - 0.5) * 14, at.y + (Math.random() - 0.5) * 14, colors[ev.side][ev.slot], power);
          damagePop(fxLayer, at.x, at.y - 12, ev.damage, power);
          if (ev.move) {
            shake(arena, 9, 300);
            sfx.move();
            callout(mid, `${names[ev.side][ev.slot]}の「${ev.move}」`, ev.match === "strong" ? "よく効く！" : ev.match === "weak" ? "あまり効いていない" : "", ev.match === "strong" ? "strong" : ev.match === "weak" ? "weak" : "", ev.side);
            say(`${names[ev.side][ev.slot]}の「${ev.move}」！${ev.match === "strong" ? ` ${ev.reason}` : ""}`);
          } else {
            if (ev.match === "strong") shake(arena, 4, 160);
            sfx.dash();
            sfx.hit(ev.match);
          }
          break;
        }
        case "ready":
          if (ev.side === ME) sfx.ready();
          break;
        case "front":
          arrange(ev.side, true);
          if (!ev.forced) {
            callout(mid, `${names[ev.side][ev.slot]}が前へ`, "", "", ev.side);
            say(`${ev.side === ME ? "こちら" : "あいて"}は${names[ev.side][ev.slot]}を前へ`);
          }
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
  cells[ME].forEach((c, slot) => {
    c.front?.addEventListener("click", () => {
      unlock();
      pending.push({ side: ME, t: "front", slot });
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
    while (owed >= LIVE.tickMs && steps++ < 5 && state.winner === null) {
      owed -= LIVE.tickMs;
      const inputs = pending;
      pending = [];
      show(stepLive(state, inputs));
    }
    if (owed > LIVE.tickMs * 5) owed = 0; // 長く止まっていたぶんは追いかけない
    if (state.winner === null) draw();
  }

  arrange(ME, false);
  arrange(FOE, false);
  draw();
  sfx.start();
  void (async () => {
    await cutin(fxLayer, "バトル開始！");
    for (const ev of state.setup) {
      if (gone) return;
      if (ev.t === "combo") {
        sfx.combo();
        await cutin(fxLayer, `${ev.side === ME ? "こちら" : "あいて"}の組み合わせ技　${ev.name}`, "combo");
      } else if (ev.t === "trio") {
        sfx.combo();
        await cutin(fxLayer, `${ev.side === ME ? "こちら" : "あいて"}は「${ev.taste}」でそろい踏み`, "combo");
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
