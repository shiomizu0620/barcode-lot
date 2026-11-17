# barcode-lot（仮）

商品のバーコードを読むと、その縞をまとったキャラが生まれるWebゲームの試作。

## 文書
| 文書 | 中身 |
|---|---|
| `docs/brief.md` | 企画の要点（何を作るか、決まっていること、使わない言葉） |
| `docs/spec.md` | 仕様（画面、キャラの決まり方、ロット、バトル） |
| `docs/design.md` | 見た目と画面設計（色・文字・部品、画面の流れ） |
| `docs/architecture.md` | 技術構成（フォルダと層、データの流れ、保存、API、配信） |
| `docs/decisions.md` | 決めたことの記録。上に「前提」（しおみずが大事にしていること・大きな方針・まだ決めていないこと） |
| `docs/battle-plan.md` | バトルの計画。できたところと、しおみずに決めてほしいこと（バトルを触る前に読む） |
| `docs/ideas.md` | 範囲外で気づいたこと・あとでやる案 |

## 変えてはいけないこと
- 品番（JAN）が同じなら、どの端末でも同じ姿・名前・味・技。`src/core/` の結果は `fixtures/golden.json` と完全一致させる（アプリ版をFlutterで作るときの答え合わせ）
- 生成ルールを意図して変えたときだけ `npm run golden` で作り直す。それ以外で `npm test` の答え合わせが落ちたら、直すのはコード側
- 商品名・ブランド名は返さない・保存しない・表示しない（残すのは「ぶどう」のような分類だけ）
- 外部のAPIは、規約で使い道が合うものだけ使う（Yahoo!ショッピングのAPIは、Yahoo!に確かめるまで使わない。`docs/decisions.md`）
- 画像生成AIは使わない
- 用語は品番・ロット・限定パッケージ。使わない言葉は `docs/brief.md`
- 挑戦状のURL（`?vs=`）と端末内の保存キー（`docs/architecture.md`）は、形を変えると前のデータが読めなくなる

## 技術構成（要約）
- Vite + TypeScript（フレームワークなし）。キャラはSVGを文字列で組み立てる
- `src/` は層で分ける。`core`（決まり方・計算）← `art`（絵）・`store`（端末内の記録）・`device`（カメラ）← `ui`（画面）。矢印の向きにしか読まない（`tests/layers.test.ts` で確認）
- データは端末内（localStorage）。品番ごとの中身（味）だけ Cloudflare Worker（`worker/index.ts`）が D1 に1つ持ち、全員に同じものを配る
- 配信は Cloudflare Workers。`main` へのpushで自動デプロイ

## 起動
- `npm i` → `npm run dev`（スマホから試すときは同じWi-Fiで表示されたURLへ。カメラはHTTPSかlocalhostでのみ動く）
- `npm test` テスト（答え合わせ、バトル、ロット、層の決まり）
- `npm run typecheck` 型チェック（画面側とWorker側）
- `npm run check` 型チェック・テスト・ビルドをまとめて（作業の終わりに必ず通す。GitHub Actions も同じものを回す）
- `npm run balance` 手を出せる試合の釣り合い（何もしない人・技だけ押す人・上手い人の勝率と試合の長さ）
- `npm run build` で `dist/`（相対パスなので、どこに置いても動く）
- `npm run golden` 答え合わせ用データの作り直し（生成ルールを意図して変えたときだけ）
- D1 の用意と更新の手順は `docs/architecture.md` の「配信」。表を変えるときは `migrations/` に番号付きのSQLを足す
- `#debug` を付けて開くと、「読む」の下に「時間を1日すすめる」「記録を消す」が出る
- `gallery.html` はキャラ見本帳（`#文字列` で並びが変わる）

## 進め方
- main に入れる前に、しおみずが確認する（main は本番にそのまま出る）。終わりの条件と役割分担は `docs/architecture.md` の「6. 進め方」
- 仕様・画面・技術構成を変えたら、上の表の文書も同じ変更で直す
- 自分で決めたことは `docs/decisions.md` に1〜3行で残す。範囲外の気づきは `docs/ideas.md`
