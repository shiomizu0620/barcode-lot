// 答え合わせ用データを作る。Flutter版など別の実装は、この結果と完全に一致させる。
// 生成ルールを意図して変えたときだけ `npm run golden` で作り直す。
import { writeFileSync } from "node:fs";
import { goldenCases } from "../tests/golden-cases";

writeFileSync(new URL("../fixtures/golden.json", import.meta.url), JSON.stringify(goldenCases(), null, 2) + "\n");
console.log("fixtures/golden.json を更新しました");
