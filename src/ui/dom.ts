// 画面まわりの小さな道具。

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** 動きを減らす設定の端末か。 */
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** HTMLに差し込む文字の無害化。 */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** root の中の selector に当たる要素で起きた event をまとめて受ける。 */
export function on<E extends Event = Event>(root: Element, event: string, selector: string, handler: (el: HTMLElement, e: E) => void) {
  root.addEventListener(event, (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>(selector);
    if (el && root.contains(el)) handler(el, e as E);
  });
}
