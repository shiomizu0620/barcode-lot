// メーカー番号（JANの頭の数桁）→ 味 の表を作る。
// 材料は Open Food Facts の日本の商品データ（ODbL）。その番号の商品が同じ味にそろっているものだけを表に入れる。
//
// 使い方：
//   1) Open Food Facts のデータの書き出し（en.openfoodfacts.org.products.csv.gz）から、45・49で始まる行だけを抜き出す
//      curl -sL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gzip -dc \
//        | awk -F'\t' 'NR==1 || $1 ~ /^(45|49)[0-9]{11}$/' > off-jp.tsv
//      （検索APIの返事のJSONを1ページ1ファイルで入れたフォルダでもよい）
//   2) npx vite-node scripts/makers.ts <off-jp.tsv か フォルダ> [確かめ用のJSON]
//      → worker/makers.ts を書き出し、当たり具合を表示する
//   確かめ用のJSONは [{ "jan": "...", "name": "商品名" }, ...]。商品名を辞書で分けた味を正解として比べる（表には使わない）

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classify, flavorById } from "../src/core/product";
import { normalize } from "../src/core/ean";

// ---- 表に入れる条件 ----
const LENGTHS = [7, 9, 10]; // 日本のメーカー番号の長さ
const MIN_SAME = 4; // 同じ味の商品が、最低これだけ
const MIN_SHARE = 0.7; // 味が分かった商品のうち、同じ味の割合（下げるほど推測できる商品は増え、外れも増える）
const MIN_KNOWN = 0.5; // その番号の商品のうち、味が分かった割合

interface Item {
  jan: string;
  flavor: string | null;
}

const textsOf = (p: Record<string, any>): string[] =>
  [p.product_name_ja, p.product_name, p.generic_name, p.categories, ...(p.categories_tags ?? []).map((t: string) => t.replace(/^[a-z]{2}:/, "").replace(/-/g, " "))].filter(Boolean);

/** データの書き出し（タブ区切り）を読む。 */
function loadTsv(file: string): Item[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const head = lines[0].split("\t");
  const col = (name: string) => head.indexOf(name);
  const c = { code: col("code"), name: col("product_name"), generic: col("generic_name"), cats: col("categories"), tags: col("categories_tags") };
  const seen = new Map<string, Item>();
  for (const line of lines.slice(1)) {
    const v = line.split("\t");
    const jan = normalize(v[c.code] ?? "");
    if (!jan || !/^4[59]/.test(jan) || seen.has(jan)) continue;
    const p = { product_name: v[c.name], generic_name: v[c.generic], categories: v[c.cats], categories_tags: (v[c.tags] ?? "").split(",").filter(Boolean) };
    seen.set(jan, { jan, flavor: classify(textsOf(p))?.id ?? null });
  }
  return [...seen.values()];
}

function load(dir: string): Item[] {
  if (dir.endsWith(".tsv")) return loadTsv(dir);
  const seen = new Map<string, Item>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    let data: any;
    try {
      data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    } catch {
      continue; // 混雑で返ってきたHTMLなど
    }
    for (const p of data?.products ?? []) {
      const jan = normalize(String(p.code ?? ""));
      if (!jan || !/^4[59]/.test(jan) || seen.has(jan)) continue;
      seen.set(jan, { jan, flavor: classify(textsOf(p))?.id ?? null });
    }
  }
  return [...seen.values()];
}

interface Entry {
  prefix: string;
  flavor: string;
  same: number;
  known: number;
  total: number;
}

/** 番号ごとにまとめ、そろっているものを表にする。短い番号でそろわなければ、長い番号で見直す。 */
export function build(items: Item[]): Entry[] {
  const out: Entry[] = [];
  const judge = (prefix: string, group: Item[]): Entry | null => {
    const known = group.filter((x) => x.flavor);
    const counts = new Map<string, number>();
    for (const x of known) counts.set(x.flavor!, (counts.get(x.flavor!) ?? 0) + 1);
    const [flavor, same] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    if (same >= MIN_SAME && same / known.length >= MIN_SHARE && known.length / group.length >= MIN_KNOWN) {
      return { prefix, flavor, same, known: known.length, total: group.length };
    }
    return null;
  };
  const walk = (level: number, group: Item[], prefix: string) => {
    const hit = prefix ? judge(prefix, group) : null;
    if (hit) {
      out.push(hit);
      return;
    }
    const next = LENGTHS[level];
    if (next === undefined) return;
    const groups = new Map<string, Item[]>();
    for (const x of group) {
      const k = x.jan.slice(0, next);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(x);
    }
    for (const [k, g] of groups) walk(level + 1, g, k);
  };
  walk(0, items, "");
  return out.sort((a, b) => a.prefix.localeCompare(b.prefix));
}

export function lookup(table: Map<string, string>, jan: string): string | undefined {
  for (const n of [...LENGTHS].reverse()) {
    const f = table.get(jan.slice(0, n));
    if (f) return f;
  }
  return undefined;
}

// ---- 当たり具合 ----
const tasteOf = (id: string | null | undefined) => (id ? flavorById(id)?.taste : undefined);

function score(pairs: { guess?: string; truth: string | null }[]) {
  const guessed = pairs.filter((p) => p.guess);
  const judged = guessed.filter((p) => p.truth);
  const exact = judged.filter((p) => p.guess === p.truth).length;
  const sameTaste = judged.filter((p) => tasteOf(p.guess) === tasteOf(p.truth)).length;
  return { n: pairs.length, guessed: guessed.length, judged: judged.length, exact, sameTaste };
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "-");

function crossCheck(items: Item[], folds = 5) {
  const pairs: { guess?: string; truth: string | null }[] = [];
  for (let k = 0; k < folds; k++) {
    const test = items.filter((_, i) => i % folds === k);
    const train = items.filter((_, i) => i % folds !== k);
    const table = new Map(build(train).map((e) => [e.prefix, e.flavor]));
    for (const x of test) pairs.push({ guess: lookup(table, x.jan), truth: x.flavor });
  }
  return score(pairs);
}

function write(entries: Entry[], count: number) {
  const rows = entries.map((e) => `  "${e.prefix}": "${e.flavor}", // ${e.same}/${e.known}（全${e.total}件）`).join("\n");
  const src = `// 自動生成（scripts/makers.ts）。手で直さない。
// メーカー番号（JANの頭の数桁）→ 味。中身の分からない商品の味を、メーカーの番号から推測する。
// 材料：Open Food Facts の日本の商品データ ${count}件（ODbL。https://world.openfoodfacts.org ）。
// その番号の商品が同じ味にそろっているものだけを入れた（同じ味${MIN_SAME}件以上・${Math.round(MIN_SHARE * 100)}%以上）。
// 右のコメントは「同じ味の件数/味が分かった件数（その番号の全件数）」。
// この表は Open Food Facts のデータから作ったデータベースなので、ODbL（https://opendatacommons.org/licenses/odbl/ ）で扱う。

export const MAKER_FLAVORS: Record<string, string> = {
${rows}
};

const LENGTHS = [${[...LENGTHS].reverse().join(", ")}]; // 長い番号から当てる

/** JANからメーカー番号で味を推測する。表に無ければ undefined。 */
export function flavorFromMaker(jan: string): string | undefined {
  for (const n of LENGTHS) {
    const f = MAKER_FLAVORS[jan.slice(0, n)];
    if (f) return f;
  }
  return undefined;
}
`;
  writeFileSync(new URL("../worker/makers.ts", import.meta.url), src);
}

const [dir, evalFile] = process.argv.slice(2);
if (!dir) {
  console.error("使い方：npx vite-node scripts/makers.ts <Open Food Facts のJSONのフォルダ> [確かめ用のJSON]");
  process.exit(1);
}
const items = load(dir);
const entries = build(items);
write(entries, items.length);
const known = items.filter((x) => x.flavor).length;
console.log(`商品 ${items.length}件（味が分かる ${known}件）→ 表 ${entries.length}行`);

const cv = crossCheck(items);
console.log(`交差検証：推測できた ${cv.guessed}/${cv.n}（${pct(cv.guessed, cv.n)}）／当たり ${cv.exact}/${cv.judged}（${pct(cv.exact, cv.judged)}）／味の系統まで ${cv.sameTaste}/${cv.judged}（${pct(cv.sameTaste, cv.judged)}）`);

if (evalFile) {
  const real: { jan: string; name: string }[] = JSON.parse(readFileSync(evalFile, "utf8"));
  const table = new Map(entries.map((e) => [e.prefix, e.flavor]));
  const pairs = real.map((r) => ({ jan: r.jan, name: r.name, guess: lookup(table, r.jan), truth: classify([r.name])?.id ?? null }));
  const s = score(pairs);
  console.log(`別の店の${s.n}件：推測できた ${s.guessed}（${pct(s.guessed, s.n)}）／当たり ${s.exact}/${s.judged}（${pct(s.exact, s.judged)}）／味の系統まで ${s.sameTaste}/${s.judged}（${pct(s.sameTaste, s.judged)}）`);
  for (const p of pairs.filter((p) => p.guess && p.truth && p.guess !== p.truth)) console.log(`  外れ：${p.jan} 推測 ${p.guess} ／ 商品名では ${p.truth}`);
}
