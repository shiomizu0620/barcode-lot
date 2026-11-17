// チーム選び：棚から3体えらぶ。えらんだ順に前に立つ。
// 戦う相手がいるとき（今日の挑戦者・挑戦状）と、挑戦状を送るだけのときの3通り。

import { combosOf, matchup } from "../../core/battle";
import { specFor } from "../../core/creature";
import { allLots, lotNumber, type Lot } from "../../store/lots";
import { dailyOpponent, keyOf, MAX_TEAM, memberOf, pendingLetter, pickedLots, sendLetter, setMatch, setPicked, type Mode, type Opponent } from "../battle-session";
import { unlock } from "../../device/sfx";
import { $, on } from "../dom";
import { characterOfLot, characterSvg, foeStageHtml, TASTE_COLOR, tasteChainHtml, type Character } from "../parts";
import { navigate, type View } from "../router";

const TITLE: Record<Mode, string> = {
  daily: "今日の挑戦者に挑む",
  letter: "挑戦状を受けて立つ",
  send: "挑戦状を送るチーム",
};

export const battleTeamView: View = ({ root, params }) => {
  const mode = params[0] as Mode;
  const lots = allLots();
  const opponent: Opponent | null = mode === "daily" ? dailyOpponent() : mode === "letter" ? pendingLetter() : null;
  if (lots.length === 0 || (mode !== "send" && !opponent)) {
    navigate("/battle", { replace: true });
    return;
  }

  const need = Math.min(MAX_TEAM, lots.length);
  const cast = new Map<string, { lot: Lot; c: Character }>(lots.map((lot) => [keyOf(lot), { lot, c: characterOfLot(lot) }]));
  let picked = pickedLots().map(keyOf).slice(0, MAX_TEAM);
  const foeTastes = opponent ? opponent.members.map((m) => specFor(m.jan, m.profile).taste) : [];

  const pickHtml = (key: string, { lot, c }: { lot: Lot; c: Character }) => {
    const strong = foeTastes.some((t) => matchup(c.spec.taste, t) === "strong");
    const weak = foeTastes.some((t) => matchup(c.spec.taste, t) === "weak");
    const hint = [strong ? "あいてに強い" : "", weak ? "あいてに弱い" : ""].filter(Boolean).join("、");
    return `<li><button type="button" class="pick" data-key="${key}" aria-pressed="false" aria-label="${c.spec.name}、${c.spec.taste}${hint ? "、" + hint : ""}">
      <span class="thumb">${characterSvg(c)}
        <span class="pick-no" hidden></span>
        <span class="pick-marks" aria-hidden="true">${strong ? `<i class="edge" data-kind="strong">強</i>` : ""}${weak ? `<i class="edge" data-kind="weak">弱</i>` : ""}</span>
      </span>
      <span class="shelf-tag" style="--taste:${TASTE_COLOR[c.spec.taste]}">
        <span class="shelf-tag-name">${c.spec.name}</span>
        <span class="shelf-tag-row"><span>${c.spec.taste}</span></span>
        <span class="shelf-tag-next">${lotNumber(lot)}</span>
      </span>
    </button></li>`;
  };

  const blanks = `<li class="shelf-blank" aria-hidden="true"></li>`.repeat((3 - (cast.size % 3)) % 3);

  root.innerHTML = `
    <section class="team">
      <a class="back" href="#/battle">バトルへ</a>
      <h1 class="page-title">${TITLE[mode]}</h1>
      ${opponent ? `<p class="team-label">あいて（左が先頭）</p>${foeStageHtml(opponent.members)}` : ""}
      <p class="team-label">${opponent ? "こちら：" : ""}えらんだ順に前に立つ${opponent ? `<span class="team-legend"><i class="edge" data-kind="strong">強</i>あいてに強い <i class="edge" data-kind="weak">弱</i>苦手</span>` : ""}</p>
      <ul class="shelf-list team-list">${[...cast].map(([key, v]) => pickHtml(key, v)).join("")}${blanks}</ul>
      ${opponent ? `<div class="aisho">${tasteChainHtml()}</div>` : ""}
      <div class="team-bar">
        <p class="team-combos" aria-live="polite"></p>
        <div class="team-bar-row">
          <ol class="team-slots" aria-label="えらんだ順番">${Array.from({ length: need }, () => `<li></li>`).join("")}</ol>
          <button type="button" id="team-go" class="btn primary"></button>
        </div>
        <p class="team-msg" role="status"></p>
      </div>
    </section>`;

  const go = $<HTMLButtonElement>("#team-go", root);
  const slots = [...root.querySelectorAll<HTMLElement>(".team-slots li")];

  function sync() {
    for (const b of root.querySelectorAll<HTMLElement>(".pick")) {
      const order = picked.indexOf(b.dataset.key!);
      b.setAttribute("aria-pressed", String(order >= 0));
      const no = $(".pick-no", b);
      no.hidden = order < 0;
      no.textContent = order >= 0 ? String(order + 1) : "";
    }
    slots.forEach((li, i) => {
      const v = cast.get(picked[i]);
      li.innerHTML = v ? characterSvg(v.c) : `<span>${i + 1}</span>`;
      li.dataset.filled = String(!!v);
    });
    const ready = picked.length >= need;
    go.disabled = !ready;
    go.textContent = !ready ? `あと${need - picked.length}体えらぶ` : mode === "send" ? "挑戦状を送る" : "この順番で戦う";

    // 組み合わせ技の予告
    const team = picked.map((k) => cast.get(k)!.c.spec);
    const combos = combosOf(team.map((s) => s.flavor)).map((c) => c.name);
    const trio = team.length === 3 && team.every((s) => s.taste === team[0].taste);
    const notes = [combos.length ? `組み合わせ技：${combos.join("、")}` : "", trio ? `${team[0].taste}でそろい踏み（守りアップ）` : ""].filter(Boolean);
    $(".team-combos", root).textContent = notes.length ? notes.join("／") : "";
    setPicked(picked);
  }

  on(root, "click", ".pick", (b) => {
    const key = b.dataset.key!;
    const at = picked.indexOf(key);
    if (at >= 0) picked.splice(at, 1);
    else if (picked.length < MAX_TEAM) picked.push(key);
    else return;
    sync();
  });

  go.addEventListener("click", async () => {
    unlock(); // 試合の効果音は、この押した瞬間からでないと鳴らせない端末がある
    const team = picked.map((k) => memberOf(cast.get(k)!.lot));
    if (mode === "send") {
      $(".team-msg", root).textContent = await sendLetter(team);
      return;
    }
    setMatch({ mode, opponent: opponent!, team });
    // 今日の挑戦者は手を出せる試合。挑戦状は、誰が開いても同じになる自動の試合
    navigate(mode === "daily" ? "/battle/live" : "/battle/play", { replace: true });
  });

  picked = picked.filter((k) => cast.has(k));
  sync();
};
