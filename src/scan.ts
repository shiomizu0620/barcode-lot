// バーコードの読み取り。
// 端末に標準の読み取り機能があればそれを使い、無ければ（iPhoneのSafariなど）ZXingのWASM版で読む。

import { BarcodeDetector as Ponyfill, prepareZXingModule } from "barcode-detector/ponyfill";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? new URL("./zxing_reader.wasm", document.baseURI).href : prefix + path,
  },
});

type Detector = { detect(src: ImageBitmapSource): Promise<{ rawValue: string }[]> };

let detectorPromise: Promise<Detector> | null = null;

function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const Native = (globalThis as any).BarcodeDetector;
      if (Native) {
        try {
          const fmts: string[] = await Native.getSupportedFormats();
          if (fmts.includes("ean_13")) return new Native({ formats: FORMATS.filter((x) => fmts.includes(x)) });
        } catch {
          /* fall through */
        }
      }
      return new Ponyfill({ formats: [...FORMATS] }) as unknown as Detector;
    })();
  }
  return detectorPromise;
}

export async function detectFromImage(file: Blob): Promise<string | null> {
  const d = await getDetector();
  const res = await d.detect(file);
  return res[0]?.rawValue ?? null;
}

export interface CameraSession {
  stop(): void;
}

/** カメラを起動して、読めたら onCode を呼ぶ。使えなければ例外。 */
export async function startCamera(video: HTMLVideoElement, onCode: (code: string) => void): Promise<CameraSession> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "");
  video.muted = true;
  await video.play();
  const d = await getDetector();
  let alive = true;
  let busy = false;
  const tick = async () => {
    if (!alive) return;
    if (!busy && video.readyState >= 2) {
      busy = true;
      try {
        const res = await d.detect(video);
        if (alive && res[0]?.rawValue) {
          alive = false;
          onCode(res[0].rawValue);
        }
      } catch {
        /* 次のフレームで再挑戦 */
      }
      busy = false;
    }
    if (alive) setTimeout(tick, 140);
  };
  tick();
  return {
    stop() {
      alive = false;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** 「ピッ」 */
export function beep() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 2100;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.09);
    o.onended = () => ctx.close();
  } catch {
    /* 音が出せなくても続ける */
  }
}
