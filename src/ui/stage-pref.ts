// 試合の見え方の設定：3Dの舞台で見るか（お試し）と、倍速か。three.js を読み込まずに使えるよう、stage3d.ts とは分けてある。

/**
 * 3Dで見るか（お試しの切り替え。端末に覚える）。
 * 3Dを残すかはまだ決めていないので、最初は2Dで開き、試合の上の「3Dで見る」を押した端末だけ3Dにする。
 */
const PREF_KEY = "barcode-lot:stage";
export function want3d(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "3d";
  } catch {
    return false;
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


/** 倍速で見るか（端末に覚える）。ふつうの速さで始め、試合の上の「倍速」を押した端末だけ倍速にする。 */
const SPEED_KEY = "barcode-lot:speed";
export function wantFast(): boolean {
  try {
    return localStorage.getItem(SPEED_KEY) === "2";
  } catch {
    return false;
  }
}
export function setWantFast(on: boolean) {
  try {
    localStorage.setItem(SPEED_KEY, on ? "2" : "1");
  } catch {
    /* noop */
  }
}
