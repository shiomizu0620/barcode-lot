// Cloudflare Worker：静的ファイルの配信と、商品プロフィールAPI。
// GET /api/product/:jan → { flavor?, source }
// 商品名は返さない・保存しない。返すのは「ぶどう系」のような分類だけ。

import { classify, type ProductProfile } from "../src/product";
import { normalize } from "../src/ean";

// 型はここで最小限に書く（ブラウザ側のテストからも読み込むため）
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}
export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  YAHOO_APPID?: string; // Yahoo!デベロッパーネットワークのClient ID（任意）
}

const TTL = 60 * 60 * 24 * 30; // 30日
const UA = "barcode-lot/0.1 (liberis; prototype)";

export async function lookupTexts(jan: string, env: Env, fetcher: typeof fetch = fetch): Promise<{ texts: string[]; source: ProductProfile["source"] }> {
  // 1) Yahoo!ショッピング（設定されていれば）
  if (env.YAHOO_APPID) {
    try {
      const u = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${encodeURIComponent(env.YAHOO_APPID)}&jan_code=${jan}&results=5`;
      const res = await fetcher(u, { headers: { "User-Agent": UA } });
      if (res.ok) {
        const data: any = await res.json();
        const hits: any[] = data?.hits ?? [];
        const texts = hits.flatMap((h) => [h?.name, h?.genreCategory?.name, ...(h?.parentGenreCategories ?? []).map((c: any) => c?.name)]).filter(Boolean);
        if (texts.length) return { texts, source: "yahoo" };
      }
    } catch {
      /* 次へ */
    }
  }
  // 2) Open Food Facts（1スキャン＝1回の呼び出しの範囲で使う）
  try {
    const u = `https://world.openfoodfacts.org/api/v2/product/${jan}.json?fields=product_name,product_name_ja,generic_name,categories_tags,categories`;
    const res = await fetcher(u, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const data: any = await res.json();
      const p = data?.product;
      if (data?.status === 1 && p) {
        const texts = [p.product_name_ja, p.product_name, p.generic_name, p.categories, ...(p.categories_tags ?? []).map((t: string) => t.replace(/^[a-z]{2}:/, "").replace(/-/g, " "))].filter(Boolean);
        if (texts.length) return { texts, source: "off" };
      }
    }
  } catch {
    /* 見つからない扱い */
  }
  return { texts: [], source: "none" };
}

async function product(jan: string, env: Env, ctx: Ctx, req: Request): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(new URL(`/api/product/${jan}`, req.url).toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const { texts, source } = await lookupTexts(jan, env);
  const fl = classify(texts);
  const body: ProductProfile = fl ? { flavor: fl.id, source } : { source: "none" };
  const res = new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${TTL}` },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/product\/(\d{8,14})$/);
    if (m) {
      const jan = normalize(m[1]);
      if (!jan) return new Response(JSON.stringify({ error: "invalid_code" }), { status: 400, headers: { "content-type": "application/json" } });
      return product(jan, env, ctx, req);
    }
    if (url.pathname.startsWith("/api/")) return new Response("not found", { status: 404 });
    return env.ASSETS.fetch(req);
  },
};
