// 開発用：生成されるキャラを一覧で見る。絵柄の確認や、パーツを描く人への説明に使う。
import { withCheck } from "./core/ean";
import { lotLook, specFor } from "./core/creature";
import { renderCharacter } from "./art/render";
import { Rng } from "./core/rng";

const r = new Rng(location.hash.slice(1) || "gallery");
const card = (jan: string, seed: string) => {
  const spec = specFor(jan);
  const look = lotLook(spec, seed);
  return `<figure>${renderCharacter(spec, look).svg}<figcaption><b>${spec.name}</b> ${spec.taste}・${spec.family === "cute" ? "かわいい" : "かっこいい"}<br><code>${jan}</code> L${seed}</figcaption></figure>`;
};
const base = withCheck("49" + String(r.int(0, 9999999999)).padStart(10, "0"));
document.querySelector("#lots")!.innerHTML = [1, 2, 3, 4, 5, 6].map((i) => card(base, `${i}:${20400 + i * 3}`)).join("");
const jans = Array.from({ length: 30 }, () => withCheck("4" + String(r.int(0, 99999999999)).padStart(11, "0")));
document.querySelector("#grid")!.innerHTML = jans.map((j) => card(j, "1:20400")).join("");
