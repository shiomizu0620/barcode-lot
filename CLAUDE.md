# barcode-lot（仮）

商品のバーコードを読むと、その縞をまとったキャラが生まれるWebゲームの試作。

## 仕様・企画
- 企画メモ: `docs/brief.md`（claude.aiのプロジェクト「バーコードバトル」の企画メモと同じ内容）
- 試作の仕様: `docs/spec.md`

## 技術構成
- Vite + TypeScript（フレームワークなし）。キャラはSVGを文字列で組み立てる
- 読み取り: `barcode-detector`（ZXing WASM）。`public/zxing_reader.wasm` を自前配信。端末に標準の BarcodeDetector があればそちらを使う
- データ: 試作は端末内（localStorage）のみ。サーバーなし
- 本番の予定: Cloudflare Workers + D1
- アプリ版は後でFlutterで作る。キャラ生成は `fixtures/golden.json` と完全一致させる（同じ番号から必ず同じキャラ）

## 主なファイル
- `src/ean.ts` JANの検証・縞（95モジュール）の再現
- `src/creature.ts` 品番→キャラの仕様、ロット→個体差
- `src/render.ts` キャラのSVG
- `src/morph.ts` 変身演出
- `src/lots.ts` ロットの記録と消費サイクル
- `src/scan.ts` カメラ・写真からの読み取り
- `gallery.html` キャラ見本帳（ランダムな番号で一覧表示。`#文字列` で並びが変わる）

## 起動
- `npm i` → `npm run dev`（スマホから試すときは同じWi-Fiで表示されたURLへ。カメラはHTTPSかlocalhostでのみ動く）
- `npm run build` で `dist/`（相対パスなので、どこに置いても動く）
- `npm test` で答え合わせ用データとの一致を確認。生成ルールを意図して変えたときだけ `npm run golden` で作り直す
- 配信: Cloudflare Workers（`wrangler.jsonc`、静的ファイルのみ）。ビルドは `npm run build`、出力は `dist/`
- `#debug` を付けて開くと「時間を1日すすめる」「記録を消す」が出る

## 決まっていること
- 品番（JAN）が同じなら、どの端末でも同じ姿・名前・味・技
- ロットは消費サイクル（試作では通常3日、お店のラベル1日、本・雑誌7日）が過ぎると新しく出る
- 画像生成AIは使わない
