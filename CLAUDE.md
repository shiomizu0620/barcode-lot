# barcode-lot（仮）

商品のバーコードを読むと、その縞をまとったキャラが生まれるWebゲームの試作。

## 仕様・企画
- 企画メモ: `docs/brief.md`（claude.aiのプロジェクト「バーコードバトル」の企画メモと同じ内容）
- 試作の仕様: `docs/spec.md`
- バトル作り直しの計画: `docs/battle-plan.md`（設計と進め方の正本。バトルを触る前に必ず読む）

## 技術構成
- Vite + TypeScript（フレームワークなし）。キャラはSVGを文字列で組み立てる
- 読み取り: `barcode-detector`（ZXing WASM）。`public/zxing_reader.wasm` を自前配信。端末に標準の BarcodeDetector があればそちらを使う
- データ: キャラとロットは端末内（localStorage）。商品プロフィール（味の分類）だけWorkerに聞く
- 商品の中身: `worker/index.ts` の `/api/product/:jan` が Yahoo!ショッピング（`YAHOO_APPID` があれば）→ Open Food Facts の順に調べ、`src/product.ts` の辞書で味を決める。商品名・ブランド名は返さない・保存しない
- 一度決まった品番のプロフィールは端末に保存し、キャラの見た目が後から変わらないようにする
- 本番の予定: Cloudflare Workers + D1
- アプリ版は後でFlutterで作る。キャラ生成は `fixtures/golden.json` と完全一致させる（同じ番号から必ず同じキャラ）

## 主なファイル
- `src/ean.ts` JANの検証・縞（95モジュール）の再現
- `src/creature.ts` 品番→キャラの仕様、ロット→個体差
- `src/render.ts` キャラのSVG
- `src/morph.ts` 変身演出
- `src/lots.ts` ロットの記録と消費サイクル
- `src/scan.ts` カメラ・写真からの読み取り
- `src/product.ts` 商品の文字→味・色・技の辞書
- `src/profile.ts` 商品プロフィールの取得と端末内保存
- `worker/index.ts` Cloudflare Worker（静的配信と商品API）
- `src/battle.ts` バトルの計算（3対3の自動バトル、味の相性、組み合わせ技、今日の挑戦者、挑戦状URL）。調整用の数値は `TUNE`
- `src/battle-ui.ts` チーム選択とバトル画面（計算の出来事を再生するだけ。勝敗や数値はここで決めない）
- `src/sfx.ts` 効果音（音源ファイルなし）
- `gallery.html` キャラ見本帳（ランダムな番号で一覧表示。`#文字列` で並びが変わる）

## 起動
- `npm i` → `npm run dev`（スマホから試すときは同じWi-Fiで表示されたURLへ。カメラはHTTPSかlocalhostでのみ動く）
- `npm run build` で `dist/`（相対パスなので、どこに置いても動く）
- `npm test` で答え合わせ用データとの一致を確認。生成ルールを意図して変えたときだけ `npm run golden` で作り直す
- 配信: Cloudflare Workers（`wrangler.jsonc`。`/api/*` だけWorker、ほかは `dist/` の静的ファイル）。`main` へのpushで自動デプロイ
- Yahoo!のClient IDは `npx wrangler secret put YAHOO_APPID`（無くても Open Food Facts だけで動く）
- `#debug` を付けて開くと「時間を1日すすめる」「記録を消す」が出る

## 決まっていること
- 品番（JAN）が同じなら、どの端末でも同じ姿・名前・味・技
- ロットは消費サイクル（試作では通常3日、お店のラベル1日、本・雑誌7日）が過ぎると新しく出る
- 画像生成AIは使わない
- バトル：内容量＝体力（ml）、濃さ＝攻撃、キレ＝素早さ、コク＝守り。味の輪 あまい→からい→うまい→すっぱい→にがい→しょっぱい→あまい（左が右に強い）
- 挑戦状は `?vs=` にチーム（品番・ロット・味）を入れたURL。サーバーなしで同じ試合が再生される
