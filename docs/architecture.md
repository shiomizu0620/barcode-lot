# 技術構成

## 1. 全体
```
ブラウザ（Vite + TypeScript、フレームワークなし）
  ├─ 読み取り：端末の BarcodeDetector、無ければ ZXing の WASM（public/zxing_reader.wasm を自前配信）
  ├─ キャラ・バトル：すべて端末の中で計算（同じ番号なら同じ結果）
  ├─ 記録：localStorage（ロット、商品プロフィール、今日の結果）
  └─ 品番の中身（味）だけ聞く ──→ Cloudflare Worker  /api/product/:jan
                                    ├─ D1（品番ごとに1つ。決まっていればそれを配る）
                                    └─ Open Food Facts（はじめて聞かれたとき）
```
- サーバーに置くのは「品番 → 味の分類」だけ。キャラもロットも対戦も、サーバーなしで動く
- D1 がまだ用意されていなくても動く（決まった中身を残せないだけ。下の「配信」）
- アプリ版は後で Flutter で作る。`src/core/` と同じ結果を出す（答え合わせは `fixtures/golden.json`）

## 2. フォルダと層
```
src/
  core/     決まり方と計算。画面にも端末にも触れない（Flutter版に移す範囲。Workerからも読む）
    rng.ts        文字列から決まる乱数
    ean.ts        JANの検証、縞（95モジュール）の再現、バーコードの種類
    creature.ts   品番 → キャラの仕様、ロット → 個体差
    product.ts    商品の文字 → 味・色・技の辞書
    battle.ts     自動の試合の計算、味の輪、組み合わせ技、今日の挑戦者、挑戦状の符号化。調整値は TUNE
    live.ts       手を出せる試合の計算（0.1秒ごとに1コマ。ため・技・入れ替え）。CPUの操作もここ。調整値は LIVE
  art/      キャラの絵
    render.ts     キャラのSVG（文字列）
    morph.ts      変身演出
  store/    端末内の記録
    storage.ts    localStorage の読み書き（使えない環境ではメモリに控える）
    clock.ts      アプリ内の時刻（試作用に日をすすめられる）、日付
    lots.ts       ロットの記録と消費サイクル、品番ごとのまとめ
    profile.ts    品番の中身（味）の取得と、端末内の保存
    daily.ts      今日の挑戦者との結果
  device/   端末の機能
    reader.ts     カメラ・写真からの読み取り、「ピッ」
    sfx.ts        バトルの効果音と振動（音源ファイルなし）
  ui/       画面
    router.ts         URLの # で画面を切り替える
    dom.ts parts.ts   小さな道具、複数の画面で使う部品（キャラ、味の表示、味の輪）
    hatch.ts          生まれる流れ（検証 → 中身を調べる → ロットを記録 → 値札へ）
    battle-session.ts バトル中に画面をまたいで持つもの（相手、挑戦状、えらんだチーム）
    receipt.ts        試合の結果（レシート）
    battle-fx.ts      バトルの手応え（体当たり・縞のはじけ・数字・揺れ・帯・値札）。見た目だけ
    share-image.ts    画像にする
    debug.ts          試作用の操作の出し入れ
    views/            画面ごとに1ファイル（scan, shelf, tag, battle-hub, battle-team, battle-live, battle-play）
  styles/   tokens.css（色・文字・寸法）、base.css（共通の部品）、画面ごとのCSS
  main.ts   起動（画面の登録、挑戦状URLの受け取り）
  gallery.ts  キャラ見本帳（gallery.html）
worker/index.ts   Cloudflare Worker（静的配信と商品の中身のAPI）
worker/makers.ts  メーカー番号 → 味 の表（自動生成）
migrations/       D1 の表（番号順に流す）
tests/            答え合わせ、バトル（自動・手を出せる）、商品の分類、ロット、層の決まり
fixtures/golden.json  答え合わせ用データ
scripts/golden.ts     その作り直し
scripts/makers.ts     メーカー番号の表の作り直し
scripts/balance.ts    手を出せる試合の釣り合いを測る（npm run balance）
.github/workflows/check.yml  main 以外への push と PR で npm run check を回す
```

### 層の決まり
読んでよい向きは一方通行。`tests/layers.test.ts` が確かめる。

| 層 | 読んでよい層 |
|---|---|
| `core` | なし（DOM・保存・通信にも触れない） |
| `art` | `core` |
| `store` | `core` |
| `device` | なし |
| `ui` | `core` `art` `store` `device` |

- `worker/` が読むのは `src/core/` だけ。`worker/tsconfig.json` は `core` をブラウザの型なしで検査するので、`core` にDOMを持ち込むと型チェックで落ちる
- 新しいファイルを足すとき：計算だけなら `core`、保存するなら `store`、画面なら `ui/views`

## 3. 画面のしくみ
- `index.html` は枠だけ（ヘッダー、`<main id="app">`、下のタブ、画像のシート）
- 画面は `ui/views/*.ts` の関数1つ。`#app` にHTMLを描き、後片付けが要れば関数を返す（カメラを止める、試合の再生を打ち切る）
- `ui/router.ts` が URLの `#` 以降と画面を結ぶ。画面の一覧は `main.ts` の `route(...)`
- 状態は持ち回らない。画面は開くたびに `store` から読んで描き直す。画面をまたぐ一時的なものだけ `ui/hatch.ts`（生まれた直後の合図）と `ui/battle-session.ts` に置く

## 4. データ
### 端末内の保存
| キー | 置き場所 | 中身 |
|---|---|---|
| `barcode-lot:lots:v1` | localStorage | `{ 品番: [{ jan, index, createdAt, seed }] }` |
| `barcode-lot:profiles:v1` | localStorage | `{ 品番: { flavor?, source } }` |
| `barcode-lot:daily:v1` | localStorage | `{ date, result }`（今日の挑戦者との結果） |
| `barcode-lot:debug-offset` | localStorage | 試作用にすすめた時間（ミリ秒） |
| `barcode-lot:letter` `…:letter-done` | sessionStorage | 届いた挑戦状と、もう戦ったか |
| `barcode-lot:debug` | sessionStorage | 試作用の操作を出すか |
| `sfx` | localStorage | 効果音を消したか（`off` / `on`） |

キーや中身の形を変えると、前の記録が読めなくなる。変えるときは `v2` を足して読み替える。

### 同じ番号から同じキャラ
- 乱数はすべて文字列の種から作る（`core/rng.ts`）。品番は `hinban:品番`、ロットは `lot:品番:種`、試合は `battle:相手:自分のチーム`
- 乱数を引く順番を変えると結果が変わる。`core` を触ったら `npm test`（答え合わせ）を回す
- ロットの種は `何体目:作った日の通し番号`

### 手を出せる試合のしくみ
- `core/live.ts` の `stepLive(state, 操作)` が1コマ（0.1秒）進め、起きたことを返す。画面（`ui/views/battle-live.ts`）は、たまった操作を渡して結果を映すだけ
- 乱数は種から作り、操作は「どのコマに届いたか」で決まるので、同じ種・同じ操作の列なら同じ試合になる
- 画面にも通信にも触れないので、オンライン対戦では、この計算をサーバー（Cloudflare の Durable Objects）で回し、端末は操作を送って状態を受け取る形にできる
- 自動の試合（`core/battle.ts`）は答え合わせ（`golden.json`）に入っている。手を出せる試合は、数値がまだ動くので入れていない

### 商品の中身のAPI
- `GET /api/product/:jan` → `{ flavor?, source }`。`source` は `off`（Open Food Facts で決まった）/ `maker`（メーカー番号から推測した）/ `none`（中身なし。品番だけで決まる）。30日キャッシュ
  - はじめて聞かれた品番は、Open Food Facts → メーカー番号の表（`worker/makers.ts`）の順で決め、D1 に残す。分からなければ `none` で残す。あとから変わらない
  - 調べ先が混んでいる・落ちているときは `503`（`{ error: "lookup_failed" }`）。決めない・キャッシュしない・端末も保存しない
  - GET 以外は `405`
- 表は `migrations/0001_hinban.sql`。品番・味・決まり方・時刻だけで、商品名や読んだ人の情報は持たない
- メーカー番号の表（`worker/makers.ts`）は `scripts/makers.ts` が Open Food Facts のデータの書き出しから作る（手で直さない）。番号ごとに商品の味を数え、同じ味が4件以上・70%以上そろった番号だけを入れる（2026-11-16 時点で370社ぶん）。7桁でそろわなければ9桁・10桁で見直す。Open Food Facts のデータ（ODbL）から作ったデータベースなので、ODbL で扱う
- 端末は最大2.5秒待つ。届かなければ品番だけで生まれ、端末には残さない
- 辞書の照合（`classify`）：上から順に当て、最初に当たった味にする。英語の言葉は単語として出たときだけ当てる（複数形は許す）。「茶」「水」のような1文字は、ほかに当たらないときだけ見る
- テスト（`tests/product.test.ts`）は、Node の SQLite に本物の `migrations/` を流して、D1 と同じSQLを確かめている

### 挑戦状のURL
`?vs=` に `品番~ロットの種~味` を `|` でつないだものを base64url で入れる（`core/battle.ts` の `encodeTeam` / `decodeTeam`）。

## 5. 配信
- Cloudflare Workers（`wrangler.jsonc`）。`/api/*` だけ Worker、ほかは `dist/` の静的ファイル
- `main` へのpushで自動デプロイ

### D1
- データベース `barcode-lot`（ID `9e70a35d-0bf5-4dd6-b4da-180e9986b18b`）を akubi0302 のアカウントに作り、表を入れた（2026-11-16）。`wrangler.jsonc` に `account_id` と `d1_databases`（binding `DB`）を書いてある
- 本番の Worker が D1 を使い始めるのは、この設定が入った版が配信されてから
- 表を変えるときは `migrations/0002_….sql` を足し、`npx wrangler d1 migrations apply barcode-lot --remote` を流す
- 手元で試すとき：`npx wrangler d1 migrations apply barcode-lot --local` のあと `npx wrangler dev`（手元の D1 は `.wrangler/` に作られ、git には入らない）
- 商品の中身のAPIの答えはエッジで30日キャッシュする。答えの決まり方を変えたら `worker/index.ts` の `CACHE_VERSION` を上げる（前の版のキャッシュを使わないため）

D1 は無料プランで使える。表を変えるときは `migrations/0002_….sql` を足し、3 をもう一度流す。
- `vite.config.ts` は相対パス（`base: "./"`）で、入口は `index.html` と `gallery.html` の2つ

## 6. 進め方

### 終わりの条件（どの作業でも）
1. `npm run check` が通る（型チェック2つ・テスト・ビルド）。main 以外のブランチへの push と PR では GitHub Actions が同じものを回す
2. 画面を変えたら、スマホ幅（390×844）でスクショか録画を撮り、自分の目で確かめる
3. 変えた内容に合わせて `CLAUDE.md` と `docs/` を直す
4. **main に入れるのは、しおみずが確認したあと**（main は本番にそのまま出る）

### 確認用のURL
- `main` への push → 本番 https://barcode-lot.shiomizu.workers.dev
- それ以外のブランチ → プレビューURL。Cloudflare の Settings > Build > Branch control で Preview Builds を有効にする（**しおみずの作業**）。2026-11-17 時点では、ブランチの build は失敗している（ログは Cloudflare の管理画面でしか見られない）

### 役割分担（Orca で指示役と実装役に分けるとき）
**指示役がやること**
- 型（インターフェース）と受け入れテストを先に書く。実装役の仕事は「このテストを通すこと」になる
- 作業を下の形の依頼にして渡す。同じファイルを2人に同時に触らせない
- 出てきた差分をレビューする。見る点：決まり（`battle-plan.md` の4.、この文書の層の決まり）、テストが条件を本当に確かめているか、頼んでいない変更が混ざっていないか

**依頼の形**
```
目的：（1文）
触るファイル：
触らないファイル：
通すテスト：
終わりの条件：npm run check ＋（画面なら録画）
```

**聞かずに決めてよいこと**：変数名・関数の分け方、ファイル内の構成、テストの追加、`TUNE` / `LIVE` の仮の数値、演出の細かいタイミング、文言の言い回し

**止まって聞くこと**：`docs/` に書いてある決まりと違うことをしたくなったとき、`fixtures/golden.json` が変わるとき、依存パッケージを足すとき、保存データの形を変えるとき、main に入れるとき
