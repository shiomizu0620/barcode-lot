import { bars, kindOf, normalize, withCheck } from "../src/ean";
import { lotLook, specFor } from "../src/creature";
import { FLAVORS } from "../src/product";
import { simulate } from "../src/battle";
import { Rng } from "../src/rng";

/** 決まった50個の番号と、各3ロット分の結果。 */
export function goldenCases() {
  const r = new Rng("golden-v1");
  const jans = [
    withCheck("490000001234"),
    withCheck("456789012345"),
    withCheck("491234500004"),
    withCheck("978406000000"),
    withCheck("200000123456"),
    normalize("49123456")!, // EAN-8 → 13桁
    normalize("036000291452")!, // UPC-A → 13桁
  ];
  while (jans.length < 50) jans.push(withCheck("4" + String(r.int(0, 99999999999)).padStart(11, "0")));
  const base = jans.map((jan) => {
    const spec = specFor(jan);
    return {
      jan,
      kind: kindOf(jan),
      bars: bars(jan).map((b) => [b.x, b.w]),
      spec,
      lots: ["1:20400", "2:20403", "3:20410"].map((seed) => ({ seed, look: lotLook(spec, seed) })),
    };
  });
  // 商品プロフィールあり（味ごとに1つずつ）
  const withFlavor = FLAVORS.map((fl, i) => {
    const jan = jans[i % jans.length];
    const profile = { flavor: fl.id, source: "off" as const };
    const spec = specFor(jan, profile);
    return { jan, profile, spec, lots: ["1:20400"].map((seed) => ({ seed, look: lotLook(spec, seed) })) };
  });
  // バトル（アプリ版でも同じ試合になること）
  const team = (k: number) =>
    [0, 1, 2].map((i) => ({ jan: jans[(k * 3 + i) % jans.length], lotSeed: `1:${20400 + k + i}`, profile: i === 1 ? undefined : { flavor: FLAVORS[(k * 5 + i) % FLAVORS.length].id, source: "off" as const } }));
  const battles = [0, 1, 2, 3, 4].map((k) => {
    const a = team(k), b = team(k + 7);
    const res = simulate(a, b, `golden:${k}`);
    return { a, b, seed: `golden:${k}`, winner: res.winner, events: res.events };
  });
  return { base, withFlavor, battles };
}
