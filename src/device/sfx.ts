// バトルの効果音と振動。音源ファイルは使わず、その場で鳴らす（レジの「ピッ」が基本）。
// battle-feel ブランチで作ったものを移した。手を出せる試合は音が重なりやすいので、同じ音は短い間隔で鳴らし直さない。

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

/** ボタンを押したときなど、ユーザー操作の中で呼んで音を出せる状態にする。 */
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

/** 同じ種類の音を、gapMs より短い間隔では鳴らさない。 */
const lastAt = new Map<string, number>();
function once(key: string, gapMs: number): boolean {
  const now = performance.now();
  if (now - (lastAt.get(key) ?? -1e9) < gapMs) return false;
  lastAt.set(key, now);
  return true;
}

export const sfx = {
  start() {
    tone(1320, 0.06);
    tone(1760, 0.09, 0.09);
  },
  windup() {
    if (once("windup", 120)) tone(300, 0.08, 0, "triangle", 0.025, 520);
  },
  dash() {
    if (once("dash", 90)) tone(420, 0.09, 0, "triangle", 0.05, 900);
  },
  hit(match: "strong" | "weak" | "even") {
    if (!once("hit", 70)) return;
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
  /** あじ攻撃：しぶきが飛ぶ。 */
  splash() {
    if (once("splash", 90)) tone(1100, 0.08, 0, "sine", 0.04, 520);
  },
  /** 効き目が付いた。 */
  stain() {
    if (once("stain", 150)) tone(240, 0.12, 0, "triangle", 0.04, 180);
  },
  heal() {
    if (once("heal", 150)) [1319, 1760].forEach((f, i) => tone(f, 0.07, i * 0.06, "sine", 0.04));
  },
  wipe() {
    tone(900, 0.12, 0, "triangle", 0.04, 1800);
    tone(1500, 0.06, 0.1, "sine", 0.03);
  },
  aim() {
    tone(1760, 0.04, 0, "square", 0.03);
  },
  /** 技のため：上がっていく音。 */
  charge() {
    tone(260, 0.7, 0, "sawtooth", 0.035, 1300);
    [1568, 2093].forEach((f, i) => tone(f, 0.05, 0.55 + i * 0.07, "square", 0.04));
  },
  move() {
    [880, 1175, 1568].forEach((f, i) => tone(f, 0.07, i * 0.05, "square", 0.06));
    tone(70, 0.3, 0.12, "sawtooth", 0.07, 40);
    buzz(60);
  },
  ready() {
    if (once("ready", 200)) tone(2093, 0.07, 0, "square", 0.04);
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
