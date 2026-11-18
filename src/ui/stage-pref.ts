// 3Dの舞台で見るかどうか（お試しの切り替え）。three.js を読み込まずに使えるよう、stage3d.ts とは分けてある。

/** 3Dで見るか（お試しの切り替え。端末に覚える）。 */
const PREF_KEY = "barcode-lot:stage";
export function want3d(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "2d";
  } catch {
    return true;
  }
}
export function setWant3d(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "3d" : "2d");
  } catch {
    /* noop */
  }
}

/** WebGLが使えそうか（使えない端末では最初から2D）。 */
export function canUse3d(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

