import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { classify, flavorById } from "../src/core/product";
import { withCheck } from "../src/core/ean";
import { flavorFromMaker, MAKER_FLAVORS } from "../worker/makers";
import { handle, lookupTexts, type Db } from "../worker/index";
import { specFor } from "../src/core/creature";

const id = (...t: string[]) => classify(t)?.id;

describe("商品の中身 → 味", () => {
  it("よくある商品を想定どおりに分ける", () => {
    expect(id("Welch's グレープ100 470ml")).toBe("grape");
    expect(id("グレープフルーツジュース")).toBe("grapefruit");
    expect(id("パイナップル缶")).toBe("pineapple");
    expect(id("おーいお茶 緑茶 525ml")).toBe("greentea");
    expect(id("ミルクティー")).toBe("blacktea");
    expect(id("コーヒー牛乳")).toBe("coffee");
    expect(id("いちごミルク")).toBe("strawberry");
    expect(id("カップヌードル カレー")).toBe("curry");
    expect(id("カップヌードル")).toBe("noodle");
    expect(id("ポテトチップス うすしお味")).toBe("salty");
    expect(id("激辛ハバネロ")).toBe("habanero");
    expect(id("コカ・コーラ")).toBe("cola");
    expect(id("三ツ矢サイダー")).toBe("soda");
    expect(id("en:grape-juices")).toBe("grape");
  });
  it("英語は単語として出たときだけ当てる（別の言葉の中の文字には当てない）", () => {
    expect(id("おーいお茶", "en:hot-beverages", "en:green-teas")).toBe("greentea"); // hot で激辛にならない
    expect(id("en:chocolates")).toBe("chocolate"); // chocolate の中の cola に当てない
    expect(id("en:legumes")).toBeUndefined(); // legumes の中の ume に当てない
    expect(id("en:doughnuts")).toBeUndefined();
    expect(id("en:noodles")).toBe("noodle"); // 複数形は当てる
    expect(id("en:strawberries")).toBe("strawberry");
  });
  it("日本語のまぎらわしい言葉", () => {
    expect(id("カフェインゼロ 麦茶")).toBe("greentea"); // カフェイン ≠ カフェ
    expect(id("パーティーパック ポテトチップス")).toBe("salty"); // パーティー ≠ ティー
    expect(id("ほんのり塩味のおかき")).toBe("salty"); // ほんのり ≠ のり
    expect(id("亀田の柿の種")).toBe("salty");
    expect(id("生茶 525ml")).toBe("greentea");
    expect(id("カフェオレ")).toBe("coffee");
    expect(id("ポカリスエット")).toBe("water");
    expect(id("焼きのり")).toBe("seaweed");
  });
  it("どの言葉にも当たらないときだけ、茶・水でざっくり決める", () => {
    expect(id("茶の間 2L")).toBe("greentea");
    expect(id("炭酸水")).toBe("soda"); // 先に炭酸で決まる
    expect(id("おいしい水")).toBe("water");
  });
  it("分からないものは決めない", () => {
    expect(id("")).toBeUndefined();
    expect(id("ボールペン 黒")).toBeUndefined();
  });
});

describe("プロフィールで上書きしても、他の部位は変わらない", () => {
  it("味・色・技だけが変わる", () => {
    const jan = "4901234567894";
    const a = specFor(jan);
    const b = specFor(jan, { flavor: "grape", source: "off" });
    expect(b.taste).toBe("あまい");
    expect(b.palette.name).toBe("ぶどう");
    expect({ ...b, taste: a.taste, palette: a.palette, move: a.move, flavor: undefined, flavorLabel: undefined }).toEqual({ ...a, flavor: undefined, flavorLabel: undefined });
  });
});

describe("商品情報の取り先（Open Food Facts）", () => {
  const json = (o: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(o), { status }));
  it("載っていれば商品の文字を返す", async () => {
    const f = () => json({ status: 1, product: { product_name: "Welch's Grape", categories_tags: ["en:beverages", "en:grape-juices"] } });
    const r = await lookupTexts("4901234567894", f as any);
    expect(r.source).toBe("off");
    expect(classify(r.texts)?.id).toBe("grape");
  });
  it("載っていなければ none", async () => {
    expect(await lookupTexts("4901234567894", (() => json({ status: 0 }, 404)) as any)).toEqual({ texts: [], source: "none" });
    expect(await lookupTexts("4901234567894", (() => json({ status: 0 })) as any)).toEqual({ texts: [], source: "none" });
  });
  it("調べ先が混んでいる・落ちているときは「載っていない」と分けて返す", async () => {
    const busy = () => Promise.resolve(new Response("Too Many Requests", { status: 429 }));
    expect(await lookupTexts("4901234567894", busy as any)).toEqual({ texts: [], source: "none", failed: true });
    const down = () => Promise.reject(new Error("network"));
    expect((await lookupTexts("4901234567894", down as any)).failed).toBe(true);
  });
});

// ---- 商品の中身のAPI（D1 の代わりに、Node の SQLite に本物の migrations を流して使う） ----
function memoryDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0001_hinban.sql", import.meta.url), "utf8"));
  const db: Db = {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      let args: any[] = [];
      const st = {
        bind(...v: unknown[]) {
          args = v;
          return st;
        },
        async first<T>() {
          return ((stmt.get(...args) as T | undefined) ?? null) as T | null;
        },
        async run() {
          return stmt.run(...args);
        },
      };
      return st;
    },
  };
  const rows = {
    get size() {
      return (sqlite.prepare("SELECT COUNT(*) AS n FROM hinban").get() as { n: number }).n;
    },
    get: (jan: string) => sqlite.prepare("SELECT flavor, source FROM hinban WHERE jan = ?").get(jan),
  };
  return { db, rows };
}

describe("商品の中身のAPI", () => {
  const JAN = "4901234567894";
  const ctx = { waitUntil() {} };
  const notListed = (() => Promise.resolve(new Response("{}", { status: 404 }))) as any;
  const listedGrape = (() => Promise.resolve(new Response(JSON.stringify({ status: 1, product: { product_name: "Welch's Grape" } })))) as any;
  const busy = (() => Promise.resolve(new Response("", { status: 429 }))) as any;
  const get = (env: any, f: any) => handle(new Request(`https://x.test/api/product/${JAN}`), env, ctx, f);

  it("Open Food Facts で分かれば、それで決めて残す", async () => {
    const { db, rows } = memoryDb();
    expect(await (await get({ DB: db }, listedGrape)).json()).toEqual({ flavor: "grape", source: "off" });
    expect(rows.get(JAN)).toMatchObject({ flavor: "grape", source: "off" });
  });

  it("分からなければ「中身なし」で決めて残す（読んだ人には聞かない）", async () => {
    const { db, rows } = memoryDb();
    expect(await (await get({ DB: db }, notListed)).json()).toEqual({ source: "none" });
    expect(rows.get(JAN)).toMatchObject({ flavor: null, source: "none" });
  });

  it("一度決まったら変わらない。あとで Open Food Facts に載っても、最初の答えを配る", async () => {
    const { db } = memoryDb();
    await get({ DB: db }, notListed);
    expect(await (await get({ DB: db }, listedGrape)).json()).toEqual({ source: "none" });
    // 決まっていれば、調べ先が混んでいても聞きに行かない
    expect(await (await get({ DB: db }, busy)).json()).toEqual({ source: "none" });
  });

  it("調べきれなかったときは 503 で返し、決めない", async () => {
    const { db, rows } = memoryDb();
    expect((await get({ DB: db }, busy)).status).toBe(503);
    expect(rows.size).toBe(0);
  });

  it("Open Food Facts に無ければ、メーカー番号から推測して決める（Open Food Facts のほうが先）", async () => {
    const [prefix, flavor] = Object.entries(MAKER_FLAVORS)[0] ?? [];
    if (!prefix) return; // 表が空のとき（作り直し中など）は確かめようがない
    const jan = withCheck((prefix + "000000000000").slice(0, 12));
    const at = (f: any) => handle(new Request(`https://x.test/api/product/${jan}`), { DB: memoryDb().db } as any, ctx, f);
    expect(flavorFromMaker(jan)).toBe(flavor);
    expect(await (await at(notListed)).json()).toEqual({ flavor, source: "maker" });
    expect(await (await at(listedGrape)).json()).toEqual({ flavor: "grape", source: "off" });
  });

  it("メーカー番号の表は、知っている味だけを持つ", () => {
    for (const [prefix, flavor] of Object.entries(MAKER_FLAVORS)) {
      expect(prefix).toMatch(/^4[59]\d{5,8}$/);
      expect(flavorById(flavor)).toBeDefined();
    }
  });

  it("GET 以外は受けつけない", async () => {
    const { db, rows } = memoryDb();
    const res = await handle(new Request(`https://x.test/api/product/${JAN}`, { method: "POST", body: "{}" }), { DB: db } as any, ctx);
    expect(res.status).toBe(405);
    expect(rows.size).toBe(0);
  });

  it("D1 がまだ無いときも、調べて答えるところまでは動く", async () => {
    expect(await (await get({}, listedGrape)).json()).toEqual({ flavor: "grape", source: "off" });
    expect(await (await get({}, notListed)).json()).toEqual({ source: "none" });
  });
});
