-- 品番ごとの中身（味）。全員に同じものを配るため、1つの品番に1行だけ持つ。
-- 商品名・ブランド名・読んだ人の情報は持たない。
CREATE TABLE IF NOT EXISTS hinban (
  jan TEXT PRIMARY KEY,          -- 13桁にそろえたJAN
  flavor TEXT,                   -- Flavor.id（src/core/product.ts）。NULL＝食べ物・飲み物ではない／中身なし
  source TEXT NOT NULL,          -- off＝Open Food Facts で決まった / maker＝メーカー番号から推測した / none＝中身なし（品番だけで決まる）
  created_at INTEGER NOT NULL    -- 決まった時刻（ミリ秒）
);
