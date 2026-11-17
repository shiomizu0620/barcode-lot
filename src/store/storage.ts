// 端末内保存（localStorage）の読み書き。
// 保存できない環境（プライベートモード、容量切れ、テスト）では、メモリに控えて動かし続ける。

const memory = new Map<string, string>();

export function readJson<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    /* 読めない環境 */
  }
  if (raw == null) raw = memory.get(key) ?? null;
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    memory.set(key, raw);
  }
}

export function removeKey(key: string) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
