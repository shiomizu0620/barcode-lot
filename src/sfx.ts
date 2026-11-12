// バトルの効果音。音源ファイルは使わず、その場で鳴らす（レジの「ピッ」が基本）。

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem("sfx") === "off";
} catch {
  /* 使えない環境では鳴らす設定のまま */
}

export function isMuted() {
  return muted;
}

export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem("sfx", v ? "off" : "on");
  } catch {
    /* 保存できなくても動く */
  }
}

/** ボタンを押したときなど、ユーザー操作の中で呼んで音を出せる状態にする */
export function unlock() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, dur: number, at = 0, type: OscillatorType = "square", gain = 0.08, toFreq?: number) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function buzz(ms: number) {
  if (muted) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 振動できない端末 */
  }
}

export const sfx = {
  start() {
    tone(1320, 0.06);
    tone(1760, 0.09, 0.09);
  },
  dash() {
    tone(420, 0.09, 0, "triangle", 0.05, 900);
  },
  hit(match: "strong" | "weak" | "even") {
    if (match === "strong") {
      tone(1568, 0.05);
      tone(2093, 0.09, 0.06);
      tone(90, 0.16, 0, "sawtooth", 0.06, 50);
      buzz(40);
    } else if (match === "weak") {
      tone(660, 0.05, 0, "square", 0.05);
      buzz(8);
    } else {
      tone(1320, 0.06);
      tone(110, 0.1, 0, "sawtooth", 0.04, 60);
      buzz(18);
    }
  },
  down() {
    tone(700, 0.35, 0, "triangle", 0.08, 120);
    buzz(60);
  },
  combo() {
    [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.08, i * 0.07, "square", 0.06));
  },
  win() {
    [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, i * 0.12, "square", 0.07));
    tone(2093, 0.3, 0.36, "square", 0.07);
  },
  lose() {
    [523, 494, 440].forEach((f, i) => tone(f, 0.18, i * 0.18, "triangle", 0.08));
  },
};
