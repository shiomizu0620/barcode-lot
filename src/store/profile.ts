// 商品プロフィール（中身の味）の取得と保存（端末内）。
// 品番ごとの中身はサーバーが1つだけ決めて、全員に同じものを配る。
// 一度決まった品番のプロフィールは端末にも残し、キャラの見た目が後から変わらないようにする。

import type { ProductProfile } from "../core/product";
import { readJson, writeJson } from "./storage";

const KEY = "barcode-lot:profiles:v1";
type Book = Record<string, ProductProfile>;

export function storedProfile(jan: string): ProductProfile | undefined {
  return readJson<Book>(KEY, {})[jan];
}

function store(jan: string, p: ProductProfile) {
  const all = readJson<Book>(KEY, {});
  all[jan] = p;
  writeJson(KEY, all);
}

const isProfile = (p: unknown): p is ProductProfile =>
  !!p && typeof (p as ProductProfile).source === "string" && ((p as ProductProfile).flavor === undefined || typeof (p as ProductProfile).flavor === "string");

/**
 * 端末に残っていればそれを、無ければサーバーに聞く（最大 timeoutMs）。
 * サーバーに届かなかったときは undefined（品番だけで生まれる。端末には残さず、次に読んだときにもう一度聞く）。
 */
export async function getProfile(jan: string, timeoutMs = 2500): Promise<ProductProfile | undefined> {
  const saved = storedProfile(jan);
  if (saved) return saved;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`./api/product/${jan}`, { signal: ctrl.signal });
    if (!res.ok) return undefined;
    const body: unknown = await res.json();
    if (!isProfile(body)) return undefined;
    const p: ProductProfile = { ...(body.flavor ? { flavor: body.flavor } : {}), source: body.source };
    store(jan, p);
    return p;
  } catch {
    return undefined; // タイムアウト・オフライン・JSON でない返事（開発用サーバーなど）
  } finally {
    clearTimeout(timer);
  }
}
