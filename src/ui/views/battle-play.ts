// 自動の試合の再生（挑戦状）。計算は先に全部終わっていて（core/battle）、ここは出来事を順に見せるだけ。
// 誰が開いても同じ試合になる。手を出せる試合は battle-live.ts。

import { encodeTeam, simulate, TUNE, type BattleEvent, type Fighter } from "../../core/battle";
import { recordDaily } from "../../store/daily";
import { currentMatch, markLetterFought } from "../battle-session";
import { $, reducedMotion } from "../dom";
import { characterSvg, tasteChip } from "../parts";
import { clearReceipt, receiptHtml, showReceipt } from "../receipt";
import { navigate, type View } from "../router";

function fighterHtml(f: Fighter): string {
  return `<div class="fighter" data-side="${f.side}" data-slot="${f.slot}">
    <div class="fighter-art">${characterSvg(f)}</div>
    <div class="fighter-name">${f.spec.name}</div>
    ${tasteChip(f.spec.taste)}
    <div class="gauge" role="meter" aria-valuemin="0" aria-valuemax="${f.maxHp}" aria-valuenow="${f.maxHp}" aria-label="${f.spec.name}の残り"><span style="width:100%"></span></div>
    <div class="gauge-text">残り${f.maxHp}ml</div>
  </div>`;
}

export const battlePlayView: View = ({ root }) => {
  const match = currentMatch();
  if (!match) {
    navigate("/battle", { replace: true });
    return;
  }
  const { mode, opponent, team } = match;
  const res = simulate(team, opponent.members, `${opponent.code}:${encodeTeam(team)}`);

  root.innerHTML = `
    <section class="battle" aria-label="バトル">
      <div class="battle-top">
        <p class="battle-title">${opponent.title}</p>
        <p class="battle-round" aria-live="off"></p>
        <button type="button" id="battle-skip" class="btn small">結果まで飛ばす</button>
      </div>
      <p class="side-label">あいて</p>
      <div class="fighters row-foe">${res.fighters[1].map(fighterHtml).join("")}</div>
      <div class="battle-log" aria-live="polite"></div>
      <div class="fighters row-mine">${res.fighters[0].map(fighterHtml).join("")}</div>
      <p class="side-label">こちら</p>
      ${receiptHtml()}
    </section>`;

  let gone = false;
  let skip = reducedMotion();
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, skip ? 0 : ms));
  const fx = (side: number, slot: number) => $(`.fighter[data-side="${side}"][data-slot="${slot}"]`, root);
  const names = res.fighters.map((t) => t.map((f) => f.spec.name));
  const maxHp = res.fighters.map((t) => t.map((f) => f.maxHp));
  const hp = maxHp.map((t) => [...t]);
  const sideName = (s: number) => (s === 0 ? "こちら" : "あいて");
  const log = $(".battle-log", root);
  let round = 0;

  function line(text: string, tone = "") {
    const p = document.createElement("p");
    p.textContent = text;
    if (tone) p.dataset.tone = tone;
    log.prepend(p);
    while (log.children.length > 4) log.lastElementChild!.remove();
  }

  function finish(ev: Extract<BattleEvent, { t: "end" }>) {
    $("#battle-skip", root).hidden = true;
    const total = (s: number) => hp[s].reduce((a, b) => a + b, 0);
    showReceipt(root, {
      winner: ev.winner,
      sub: ev.reason === "ko" ? (ev.winner === 0 ? "あいてのチームを全員飲み干した" : "こちらのチームが全員飲み干された") : "時間切れ。残りの量で判定",
      lines: [["ラウンド", `${round}`], ["こちらの残り", `${total(0)}ml`], ["あいての残り", `${total(1)}ml`]],
      mode,
      team,
    });
    if (opponent.kind === "daily") recordDaily(opponent.date!, ev.winner === 0 ? "win" : ev.winner === 1 ? "lose" : "draw");
    else markLetterFought();
  }

  async function play() {
    line(`${opponent.title}とのバトル開始`);
    await wait(700);
    for (const ev of res.events) {
      if (gone) return;
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
          round = ev.n;
          $(".battle-round", root).textContent = `ラウンド ${ev.n}/${TUNE.maxRounds}`;
          break;
        case "hit": {
          const a = fx(ev.side, ev.slot), t = fx(1 - ev.side, ev.target);
          a.classList.remove("act");
          void a.offsetWidth;
          a.classList.add("act");
          await wait(220);
          t.classList.remove("hurt");
          void t.offsetWidth;
          t.classList.add("hurt");
          hp[1 - ev.side][ev.target] = ev.hpAfter;
          $(".gauge span", t).style.width = `${(ev.hpAfter / maxHp[1 - ev.side][ev.target]) * 100}%`;
          $(".gauge", t).setAttribute("aria-valuenow", String(ev.hpAfter));
          $(".gauge-text", t).textContent = `残り${ev.hpAfter}ml`;
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
        case "end":
          finish(ev);
          break;
      }
    }
  }

  $("#battle-skip", root).addEventListener("click", () => (skip = true));
  play();

  return () => {
    gone = true;
    skip = true;
    clearReceipt();
  };
};
