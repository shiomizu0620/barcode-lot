// 商品プロフィールの取得と保存（端末内）。
// 一度決まった品番のプロフィールは端末に残し、キャラの見た目が後から変わらないようにする。

import type { ProductProfile } from "./product";

const KEY = "barcode-lot:profiles:v1";
let memory: Record<string, ProductProfile> = {};

function load(): Record<string, ProductProfile> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw);
  } catch {
    /* noop */
  }
  return memory;
}

export function storedProfile(jan: string): ProductProfile | undefined {
  return load()[jan];
}

function store(jan: string, p: ProductProfile) {
  const all = load();
  all[jan] = p;
  memory = all;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}

/** 保存済みならそれを、無ければサーバーに聞く（最大 timeoutMs）。通信に失敗したときは保存しない。 */
export async function getProfile(jan: string, timeoutMs = 1800): Promise<ProductProfile | undefined> {
  const saved = storedProfile(jan);
  if (saved) return saved;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`./api/product/${jan}`, { signal: ctrl.signal });
    if (!res.ok) return undefined;
    const p = (await res.json()) as ProductProfile;
    if (p && typeof p.source === "string") {
      store(jan, p);
      return p;
    }
  } catch {
    /* タイムアウト・オフライン */
  } finally {
    clearTimeout(timer);
  }
  return undefined;
}
