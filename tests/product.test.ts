import { describe, expect, it } from "vitest";
import { classify } from "../src/product";
import { lookupTexts } from "../worker/index";
import { specFor } from "../src/creature";

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

describe("商品情報の取り先", () => {
  const json = (o: unknown, ok = true) => Promise.resolve(new Response(JSON.stringify(o), { status: ok ? 200 : 404 }));
  it("Yahoo!のIDがあればYahoo!の結果を使う", async () => {
    const f = (url: string) =>
      url.includes("yahooapis") ? json({ hits: [{ name: "ウェルチ グレープ100", genreCategory: { name: "果汁飲料" } }] }) : json({ status: 0 });
    const r = await lookupTexts("4901234567894", { YAHOO_APPID: "x" } as any, f as any);
    expect(r.source).toBe("yahoo");
    expect(classify(r.texts)?.id).toBe("grape");
  });
  it("無ければOpen Food Factsを使う", async () => {
    const f = () => json({ status: 1, product: { product_name: "Welch's Grape", categories_tags: ["en:beverages", "en:grape-juices"] } });
    const r = await lookupTexts("4901234567894", {} as any, f as any);
    expect(r.source).toBe("off");
    expect(classify(r.texts)?.id).toBe("grape");
  });
  it("どこにも無ければ none", async () => {
    const f = () => json({ status: 0 });
    const r = await lookupTexts("4901234567894", {} as any, f as any);
    expect(r).toEqual({ texts: [], source: "none" });
  });
});
