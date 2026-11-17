// 「読む」：カメラ・写真・数字の入力からバーコードを読む。

import { withCheck } from "../../core/ean";
import { detectFromImage, startCamera, type CameraSession } from "../../device/reader";
import { advanceDays, resetClock } from "../../store/clock";
import { resetDaily } from "../../store/daily";
import { allLots, resetLots } from "../../store/lots";
import { pendingLetter } from "../battle-session";
import { isDebug } from "../debug";
import { $, on } from "../dom";
import { hatch } from "../hatch";
import { refresh, type View } from "../router";

// 試し用の番号（架空。チェック数字だけ正しく計算）
const SAMPLES = [withCheck("490000001234"), withCheck("456789012345"), withCheck("491234500004")];

export const scanView: View = ({ root }) => {
  const first = allLots().length === 0;
  const letter = first && pendingLetter() !== null;

  root.innerHTML = `
    <section class="scan" aria-labelledby="scan-title">
      ${letter ? `<p class="notice">挑戦状が届いています。まず1体生んでから、「バトル」で受けて立とう。</p>` : ""}
      ${
        first
          ? `<h1 id="scan-title" class="hero">そのバーコード、<br />だれかの体です。</h1>
             <p class="lead">商品のバーコードを読むと、その縞をまとったキャラが生まれます。同じ商品からは同じ姿。買い直すと、ちょっと違うロットに会えます。</p>`
          : `<h1 id="scan-title" class="page-title">バーコードを読む</h1>`
      }

      <div class="scanner">
        <video playsinline muted></video>
        <button type="button" class="scanner-start" tabindex="-1" aria-hidden="true">タップしてカメラで読む</button>
        <div class="laser" aria-hidden="true"></div>
      </div>

      <div class="actions">
        <button type="button" id="btn-camera" class="btn primary">カメラで読む</button>
        <label class="btn">
          写真から読む
          <input id="file" type="file" accept="image/*" capture="environment" class="visually-hidden" />
        </label>
      </div>
      <p class="msg" role="status" aria-live="polite"></p>

      <form class="manual" autocomplete="off">
        <label for="jan">バーコードの下の数字を打って生む</label>
        <div class="manual-row">
          <input id="jan" inputmode="numeric" pattern="[0-9 ]*" maxlength="15" placeholder="4900000012345" />
          <button type="submit" class="btn">生む</button>
        </div>
      </form>

      <details class="samples"${first ? " open" : ""}>
        <summary>手元に商品がない時の、架空の番号</summary>
        <div class="samples-list">
          ${SAMPLES.map((j) => `<button type="button" class="chip" data-jan="${j}">${j}</button>`).join("")}
        </div>
      </details>

      <p class="credit">商品の中身の分類に <a href="https://world.openfoodfacts.org" target="_blank" rel="noopener">Open Food Facts</a> のデータ（ODbL）を使っています。</p>

      ${
        isDebug()
          ? `<div class="debug-panel">
               <p>試作用の操作</p>
               <button type="button" id="dbg-day" class="btn">時間を1日すすめる</button>
               <button type="button" id="dbg-reset" class="btn">記録を消す</button>
             </div>`
          : ""
      }
    </section>`;

  const video = $<HTMLVideoElement>("video", root);
  const scanner = $(".scanner", root);
  const msg = $(".msg", root);
  const btnCamera = $<HTMLButtonElement>("#btn-camera", root);
  const fileInput = $<HTMLInputElement>("#file", root);
  const janInput = $<HTMLInputElement>("#jan", root);

  let camera: CameraSession | null = null;
  let gone = false;

  const say = (text: string, tone: "info" | "error" = "info") => {
    msg.textContent = text;
    msg.dataset.tone = tone;
  };

  function stopCamera() {
    camera?.stop();
    camera = null;
    scanner.classList.remove("live");
    btnCamera.textContent = "カメラで読む";
  }

  async function toggleCamera() {
    if (camera) {
      stopCamera();
      return;
    }
    say("カメラを準備しています");
    try {
      const session = await startCamera(video, (code) => {
        stopCamera();
        hatch(code, "read", say);
      });
      if (gone) {
        session.stop(); // 準備している間に別の画面へ移った
        return;
      }
      camera = session;
      scanner.classList.add("live");
      btnCamera.textContent = "カメラを止める";
      say("バーコードを赤い線に合わせてください");
    } catch {
      stopCamera();
      say("このページではカメラが使えません。「写真から読む」か、数字の入力で試せます。", "error");
    }
  }

  btnCamera.addEventListener("click", toggleCamera);
  $(".scanner-start", root).addEventListener("click", toggleCamera);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    say("写真を調べています");
    try {
      const code = await detectFromImage(file);
      if (code) hatch(code, "read", say);
      else say("写真からバーコードが見つかりませんでした。バーコードを大きく、まっすぐ写して撮り直してください。", "error");
    } catch {
      say("写真を読み込めませんでした。別の写真で試してください。", "error");
    }
  });

  $<HTMLFormElement>(".manual", root).addEventListener("submit", (e) => {
    e.preventDefault();
    stopCamera();
    hatch(janInput.value, "typed", say);
  });

  on(root, "click", ".chip[data-jan]", (b) => {
    stopCamera();
    hatch(b.dataset.jan!, "typed", say);
  });

  // ---- 試作用の操作（#debug で表示） ----
  if (isDebug()) {
    $("#dbg-day", root).addEventListener("click", () => {
      advanceDays(1);
      refresh();
      $(".msg").textContent = "時間を1日すすめました";
    });
    $("#dbg-reset", root).addEventListener("click", () => {
      resetLots();
      resetClock();
      resetDaily();
      refresh();
      $(".msg").textContent = "記録を消しました";
    });
  }

  return () => {
    gone = true;
    stopCamera();
  };
};
