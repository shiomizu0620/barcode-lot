// 手を出せる試合。計算は core/live.ts が0.1秒ごとに1コマ進め、ここは操作を渡して結果を映す。
// できること：「前へ」で先頭を入れ替える、ゲージがたまったら「技」を出す。

import { matchup, encodeTeam } from "../../core/battle";
import { createLive, LIVE, remaining, stepLive, type LiveEvent, type LiveFighter, type LiveInput } from "../../core/live";
import { recordDaily } from "../../store/daily";
import { currentMatch, markLetterFought } from "../battle-session";
import { $ } from "../dom";
import { characterSvg, tasteChip } from "../parts";
import { clearReceipt, receiptHtml, showReceipt } from "../receipt";
import { navigate, type View } from "../router";

const ME = 0, FOE = 1;
const START_DELAY = 1400; // 並びを見てから始まるまで
const clock = (ticks: number) => {
  const s = Math.max(0, Math.ceil((ticks * LIVE.tickMs) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function fighterHtml(f: LiveFighter): string {
  const mine = f.side === ME;
  return `<div class="lf" data-side="${f.side}" data-slot="${f.slot}">
    <div class="lf-art">${characterSvg(f)}<i class="edge" hidden></i></div>
    <div class="lf-name">${f.spec.name}</div>
    ${tasteChip(f.spec.taste)}
    <div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="${f.maxHp}" aria-valuenow="${f.maxHp}" aria-label="${f.spec.name}の残り"><span style="width:100%"></span></div>
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

  root.innerHTML = `
    <section class="live" aria-label="バトル">
      <div class="battle-top">
        <p class="battle-title">${opponent.title}</p>
        <p class="live-clock" aria-label="のこり時間">${clock(LIVE.timeLimit)}</p>
      </div>
      <div class="live-row" data-side="${FOE}">${state.fighters[FOE].map(fighterHtml).join("")}</div>
      <p class="live-log" aria-live="polite">「前へ」で先頭を入れ替え。たまったら技。</p>
      <div class="live-row" data-side="${ME}">${state.fighters[ME].map(fighterHtml).join("")}</div>
      ${receiptHtml()}
    </section>`;

  // 画面の部品を先に拾っておく（毎コマ探さない）
  const cells = state.fighters.map((t) =>
    t.map((f) => {
      const el = $(`.lf[data-side="${f.side}"][data-slot="${f.slot}"]`, root);
      return {
        el,
        art: $(".lf-art", el),
        edge: $(".edge", el),
        bar: $(".gauge span", el),
        meter: $(".gauge", el),
        front: el.querySelector<HTMLButtonElement>(".lf-front"),
        move: el.querySelector<HTMLButtonElement>(".lf-move"),
        fill: el.querySelector<HTMLElement>(".lf-move-fill, .lf-charge span")!,
      };
    }),
  );
  const log = $(".live-log", root);
  const clockEl = $(".live-clock", root);
  const names = state.fighters.map((t) => t.map((f) => f.spec.name));
  const say = (text: string, tone = "") => {
    log.textContent = text;
    log.dataset.tone = tone;
  };

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
        c.bar.style.width = `${(f.hp / f.maxHp) * 100}%`;
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

  function pop(target: HTMLElement, text: string, match: string, big: boolean) {
    const el = document.createElement("span");
    el.className = "dmg";
    el.dataset.match = big ? "strong" : match;
    el.textContent = text;
    el.style.left = `${50 + (Math.random() - 0.5) * 56}%`; // 重ならないよう左右にばらす（見た目だけ。試合には関係しない）
    target.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  const flash = (el: HTMLElement, cls: string) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  function show(events: LiveEvent[]) {
    for (const ev of events) {
      switch (ev.t) {
        case "hit": {
          const a = cells[ev.side][ev.slot], t = cells[1 - ev.side][ev.target];
          flash(a.el, "act");
          flash(t.el, "hurt");
          pop(t.art, `-${ev.damage}`, ev.match, !!ev.move);
          if (ev.move) say(`${names[ev.side][ev.slot]}の「${ev.move}」！${ev.match === "strong" ? ` ${ev.reason}` : ev.match === "weak" ? " あまり効いていない" : ""}`, ev.side === ME ? "mine" : "foe");
          break;
        }
        case "front":
          if (!ev.forced) say(`${ev.side === ME ? "こちら" : "あいて"}は${names[ev.side][ev.slot]}を前へ`);
          break;
        case "down":
          say(`${names[ev.side][ev.slot]}は飲み干された……`, "down");
          break;
        case "end":
          finish(ev);
          break;
      }
    }
  }

  function finish(ev: Extract<LiveEvent, { t: "end" }>) {
    stop();
    draw();
    showReceipt(root, {
      winner: ev.winner,
      sub: ev.reason === "ko" ? (ev.winner === ME ? "あいてのチームを全員飲み干した" : "こちらのチームが全員飲み干された") : "時間切れ。残りの量で判定",
      lines: [["かかった時間", clock(state.tick)], ["こちらの残り", `${remaining(state, ME)}ml`], ["あいての残り", `${remaining(state, FOE)}ml`]],
      mode,
      team,
    });
    if (opponent.kind === "daily") recordDaily(opponent.date!, ev.winner === ME ? "win" : ev.winner === FOE ? "lose" : "draw");
    else markLetterFought();
  }

  // ---- 操作 ----
  let pending: LiveInput[] = [];
  cells[ME].forEach((c, slot) => {
    c.front?.addEventListener("click", () => pending.push({ side: ME, t: "front", slot }));
    c.move?.addEventListener("click", () => pending.push({ side: ME, t: "move", slot }));
  });

  // ---- 進行：実際の時間に合わせて、たまったぶんだけコマを進める ----
  let timer = 0;
  let last = 0;
  let owed = 0;
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

  draw();
  for (const ev of state.setup) {
    if (ev.t === "combo") say(`${ev.side === ME ? "こちら" : "あいて"}の組み合わせ技「${ev.name}」。濃さが上がった`, "combo");
    else if (ev.t === "trio" && ev.side === ME) say(`「${ev.taste}」でそろい踏み。守りが上がった`, "combo");
  }
  timer = window.setTimeout(() => {
    last = performance.now();
    timer = window.setInterval(loop, 50);
  }, START_DELAY);

  return () => {
    stop();
    clearReceipt();
  };
};
