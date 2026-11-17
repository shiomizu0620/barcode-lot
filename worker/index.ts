// Cloudflare Worker：静的ファイルの配信と、商品の中身（味）のAPI。
//
// GET /api/product/:jan → { flavor?, source }
// 中身は Open Food Facts → メーカー番号からの推測 → 分からなければ「中身なし」の順で決める。
//
// 品番ごとの中身は、はじめて読まれたときに決めて D1（binding: DB）に1つだけ残し、全員に同じものを配る。
// 分からなかった（「中身なし」）も1つの答えとして残す。あとから姿が変わらないようにするため。
// 商品名は返さない・保存しない。残すのは「ぶどう」のような分類だけ。
// DB がまだ無いとき（設定前）は、残さずに答えるだけで動く。

import { classify, type ProductProfile } from "../src/core/product";
import { normalize } from "../src/core/ean";
import { flavorFromMaker } from "./makers";

// 型はここで最小限に書く（ブラウザ側のテストからも読み込むため）
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}
interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): Statement;
}
export interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
  DB?: Db; // 品番ごとの中身（migrations/0001_hinban.sql）
}

const TTL = 60 * 60 * 24 * 30; // 決まった中身は変わらないので30日キャッシュ
// キャッシュの版。答えの決まり方を変えたら上げる（前の版のキャッシュを使わないため。D1 に残す前の答えが30日残っていた）
const CACHE_VERSION = 2;
const UA = "barcode-lot/0.1 (prototype)";

export interface Lookup {
  texts: string[];
  source: "off" | "none";
  /** 調べ先が混んでいる・落ちているなどで、調べきれなかった（「載っていない」とは別）。 */
  failed?: true;
}

/** Open Food Facts で商品の文字（名前・カテゴリ）を調べる。1スキャン＝1回の呼び出しの範囲で使う。 */
export async function lookupTexts(jan: string, fetcher: typeof fetch = fetch): Promise<Lookup> {
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
      return { texts: [], source: "none" };
    }
    if (res.status === 404) return { texts: [], source: "none" };
  } catch {
    /* 通信の失敗 */
  }
  return { texts: [], source: "none", failed: true }; // 混雑(429)など。「載っていない」と決めつけない
}

// ---- 品番ごとの中身（D1） ----
interface Row {
  flavor: string | null;
  source: string;
}
const toProfile = (r: Row): ProductProfile => ({ ...(r.flavor ? { flavor: r.flavor } : {}), source: r.source as ProductProfile["source"] });

async function readRow(db: Db, jan: string): Promise<Row | null> {
  return db.prepare("SELECT flavor, source FROM hinban WHERE jan = ?").bind(jan).first<Row>();
}
/** まだ決まっていなければ残す（先に決まったものが勝つ）。残ったほうを返す。 */
async function decide(db: Db, jan: string, flavor: string | null, source: ProductProfile["source"]): Promise<Row> {
  await db.prepare("INSERT OR IGNORE INTO hinban (jan, flavor, source, created_at) VALUES (?, ?, ?, ?)").bind(jan, flavor, source, Date.now()).run();
  return (await readRow(db, jan)) ?? { flavor, source };
}

// ---- 返事 ----
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const reply = (body: unknown, status = 200, cache = "no-store") => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, "cache-control": cache } });
const decided = (p: ProductProfile) => reply(p, 200, `public, max-age=${TTL}`);

function edgeCache(): Cache | undefined {
  return (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
}

async function getProduct(jan: string, env: Env, ctx: Ctx, req: Request, fetcher: typeof fetch): Promise<Response> {
  const cache = edgeCache();
  const key = new Request(new URL(`/api/product/${jan}?v=${CACHE_VERSION}`, req.url).toString());
  const hit = await cache?.match(key);
  if (hit) return hit;
  const keep = (res: Response) => {
    if (cache) ctx.waitUntil(cache.put(key, res.clone())); // 決まったものだけキャッシュする
    return res;
  };

  // 1) もう決まっていれば、それを配る
  if (env.DB) {
    const row = await readRow(env.DB, jan);
    if (row) return keep(decided(toProfile(row)));
  }
  // 2) Open Food Facts で調べて決める
  // 3) 載っていなければ、メーカー番号から推測する（worker/makers.ts）。それでも分からなければ「中身なし」
  const { texts, failed } = await lookupTexts(jan, fetcher);
  if (failed) return reply({ error: "lookup_failed" }, 503); // 調べきれなかった。決めずに、次に読まれたときにもう一度
  const off = classify(texts)?.id;
  const maker = off ? undefined : flavorFromMaker(jan);
  const flavor = off ?? maker ?? null;
  const source: ProductProfile["source"] = off ? "off" : maker ? "maker" : "none";
  const p: ProductProfile = env.DB ? toProfile(await decide(env.DB, jan, flavor, source)) : { ...(flavor ? { flavor } : {}), source };
  return keep(decided(p));
}

export async function handle(req: Request, env: Env, ctx: Ctx, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(req.url);
  const m = url.pathname.match(/^\/api\/product\/(\d{8,14})$/);
  if (m) {
    const jan = normalize(m[1]);
    if (!jan) return reply({ error: "invalid_code" }, 400);
    if (req.method !== "GET") return reply({ error: "method_not_allowed" }, 405);
    return getProduct(jan, env, ctx, req, fetcher);
  }
  if (url.pathname.startsWith("/api/")) return new Response("not found", { status: 404 });
  return env.ASSETS.fetch(req);
}

export default {
  fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, env, ctx),
};
