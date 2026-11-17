// 試作用の操作の出し入れ。URLに #debug を付けて開くと、タブを閉じるまで有効になる。

const KEY = "barcode-lot:debug";
let enabled = false;

export function enableDebug() {
  enabled = true;
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* noop */
  }
}

export function isDebug(): boolean {
  if (enabled) return true;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
