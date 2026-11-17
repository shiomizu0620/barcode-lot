// 起動：画面を登録し、URLで届いたもの（挑戦状・試作用の合図）を受け取ってから描きはじめる。

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/scan.css";
import "./styles/shelf.css";
import "./styles/tag.css";
import "./styles/battle.css";

import { dateKey } from "./store/clock";
import { dailyResult } from "./store/daily";
import { allLots } from "./store/lots";
import { letterFought, pendingLetter, receiveLetter } from "./ui/battle-session";
import { enableDebug } from "./ui/debug";
import { $ } from "./ui/dom";
import { route, start } from "./ui/router";
import { initShareSheet } from "./ui/share-image";
import { battleHubView } from "./ui/views/battle-hub";
import { battleLiveView } from "./ui/views/battle-live";
import { battlePlayView } from "./ui/views/battle-play";
import { battleTeamView } from "./ui/views/battle-team";
import { scanView } from "./ui/views/scan";
import { shelfView } from "./ui/views/shelf";
import { tagView } from "./ui/views/tag";

route(/^\/$/, "scan", "scan", scanView);
route(/^\/shelf$/, "shelf", "shelf", shelfView);
route(/^\/c\/(\d{13})(?:\/(\d+))?$/, "tag", "shelf", tagView);
route(/^\/battle$/, "hub", "battle", battleHubView);
route(/^\/battle\/(daily|letter|send)$/, "team", "battle", battleTeamView, "flow");
route(/^\/battle\/live$/, "live", "battle", battleLiveView, "flow");
route(/^\/battle\/play$/, "play", "battle", battlePlayView, "flow");

// 挑戦状：?vs= を受け取ったらURLから消し、棚にキャラがいればそのままチーム選びへ
const vs = new URLSearchParams(location.search).get("vs");
if (vs) {
  const ok = receiveLetter(vs);
  const next = !ok ? location.hash : allLots().length > 0 ? "#/battle/letter" : "#/";
  history.replaceState(null, "", location.pathname + next);
}

// 試作用の操作：#debug を付けて開く
const syncDebug = () => {
  if (location.hash === "#debug") enableDebug();
};
window.addEventListener("hashchange", syncDebug);
syncDebug();

/** 下のタブの印：まだ挑んでいない今日の挑戦者か、まだ受けていない挑戦状があるとき。 */
function syncTabs() {
  const waiting = allLots().length > 0 && (!dailyResult(dateKey()) || (pendingLetter() !== null && !letterFought()));
  $(".tabs [data-tab='battle']").classList.toggle("has-news", waiting);
}

initShareSheet();
start($("#app"), syncTabs);
