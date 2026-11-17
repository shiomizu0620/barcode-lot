import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// 層の決まり（docs/architecture.md）。左の層が読んでよいのは、右に書いた層だけ。
const ALLOWED: Record<string, string[]> = {
  core: [],
  art: ["core"],
  store: ["core"],
  device: [],
  ui: ["core", "art", "store", "device"],
};

const src = resolve(__dirname, "../src");
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
const layerOf = (file: string) => relative(src, file).split(sep)[0];

describe("層の決まり", () => {
  for (const [layer, allowed] of Object.entries(ALLOWED)) {
    it(`${layer} は ${allowed.length ? allowed.join("・") : "ほかの層"} ${allowed.length ? "だけ読む" : "を読まない"}`, () => {
      const bad: string[] = [];
      for (const file of files(join(src, layer))) {
        for (const m of readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)) {
          const target = layerOf(resolve(dirname(file), m[1]));
          if (target !== layer && !allowed.includes(target)) bad.push(`${relative(src, file).split(sep).join("/")} → ${m[1]}`);
        }
      }
      expect(bad).toEqual([]);
    });
  }
  it("core は画面にも端末にも触れない（DOM・保存・通信なし）", () => {
    const bad = files(join(src, "core")).filter((f) => /\b(document|window|localStorage|sessionStorage|fetch|navigator)\b/.test(readFileSync(f, "utf8")));
    expect(bad.map((f) => relative(src, f))).toEqual([]);
  });
});
