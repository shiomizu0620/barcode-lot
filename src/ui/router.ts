// 画面の切り替え。URLの # 以降（例 #/shelf）で画面が決まるので、ブラウザの「戻る」がそのまま効く。

export type Tab = "scan" | "shelf" | "battle";

export interface ViewContext {
  root: HTMLElement;
  params: string[];
}
/** 画面を描く関数。後片付けが要るなら関数を返す（カメラを止める、再生を打ち切る など）。 */
export type View = (ctx: ViewContext) => void | (() => void);

interface Route {
  pattern: RegExp;
  name: string; // body[data-view] に入る。CSSの出し分け用
  tab: Tab;
  chrome: "tabs" | "flow"; // flow＝途中で抜けない一本道の画面。下のタブを隠す
  view: View;
}

const routes: Route[] = [];
let root: HTMLElement;
let cleanup: (() => void) | void;
let seq = 0;
let afterRender: () => void = () => {};

export function route(pattern: RegExp, name: string, tab: Tab, view: View, chrome: Route["chrome"] = "tabs") {
  routes.push({ pattern, name, tab, chrome, view });
}

export const currentPath = () => location.hash.replace(/^#/, "") || "/";

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) {
    history.replaceState(null, "", "#" + path);
    render();
  } else if (currentPath() === path) render();
  else location.hash = path; // hashchange で描く
}

/** 今の画面を描き直す。 */
export function refresh() {
  render();
}

function render() {
  const path = currentPath();
  let hit: Route | undefined;
  let params: string[] = [];
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (m) {
      hit = r;
      params = m.slice(1).map((p) => (p === undefined ? "" : decodeURIComponent(p)));
      break;
    }
  }
  if (!hit) {
    navigate("/", { replace: true });
    return;
  }
  const my = ++seq;
  cleanup?.();
  cleanup = undefined;
  root.innerHTML = "";
  document.body.dataset.view = hit.name;
  document.body.dataset.chrome = hit.chrome;
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".tabs a")) {
    if (a.dataset.tab === hit.tab) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo({ top: 0 });
  const done = hit.view({ root, params });
  // 描いている途中で別の画面へ移った（転送した）ときは、こちらを片付けて終わる
  if (my !== seq) {
    done?.();
    return;
  }
  cleanup = done;
  afterRender();
}

export function start(el: HTMLElement, onRender: () => void) {
  root = el;
  afterRender = onRender;
  window.addEventListener("hashchange", render);
  render();
}
