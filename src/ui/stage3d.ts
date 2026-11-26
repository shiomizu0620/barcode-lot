// バトルの舞台を three.js で描く（お試し）。売り場の床と棚の上で、キャラの絵を「シール」にして立たせる。
// ここは見た目だけ。勝敗や数値は core/live.ts が決め、battle-live.ts がその出来事をここに渡す。
// 舞台も小物もコードで組み立てる（Blenderや外部の3Dファイルは使わない）。
// 重いので、バトル画面を開いたときだけ読み込む（battle-live.ts の import()）。

import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CircleGeometry,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Matrix4,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Kind, LiveFighter } from "../core/live";
import { GROUND, VIEW } from "../art/render";
import { reducedMotion } from "./dom";
import { characterSvg } from "./parts";

const INK = "#1d1d22";
const PAPER = "#f3f5f2";
const POP = "#ffd83d";
const SALE = "#e63b2e";

type Power = "strong" | "weak" | "even" | "move";

// ---- 置き場所（0＝こちら＝手前、1＝あいて＝奥）。先頭はなく、3体が横に並ぶ（真ん中は少し前） ----
const SPOTS: Record<0 | 1, Vector3[]> = {
  0: [new Vector3(-1.3, 0, 2.45), new Vector3(0, 0, 2.2), new Vector3(1.3, 0, 2.45)],
  1: [new Vector3(-1.65, 0, -2.2), new Vector3(0, 0, -2.0), new Vector3(1.65, 0, -2.2)],
};
const ART = 1.75; // 絵の板の大きさ（余白込み）
const MINE = 0.86; // こちらの3体の大きさ。カメラに近いぶん大きく見えて、横どうしが重なるので少し小さくする
const TEX = 512;
const MARGIN = 30; // シールのふち用の余白（テクスチャのpx）

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** キャラの絵をシールにしたテクスチャ（白いふち＋薄い黒の外線）。 */
async function stickerTexture(svg: string): Promise<CanvasTexture> {
  const sized = svg.replace("<svg ", `<svg width="${TEX}" height="${TEX}" `);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sized);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = TEX;
  const g = c.getContext("2d")!;
  const inner = TEX - MARGIN * 2;
  // 形だけを塗りつぶした版を作り、周りにずらして押してふちにする
  const silhouette = (color: string) => {
    const s = document.createElement("canvas");
    s.width = s.height = TEX;
    const sg = s.getContext("2d")!;
    sg.drawImage(img, MARGIN, MARGIN, inner, inner);
    sg.globalCompositeOperation = "source-in";
    sg.fillStyle = color;
    sg.fillRect(0, 0, TEX, TEX);
    return s;
  };
  const stamp = (s: HTMLCanvasElement, r: number) => {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.drawImage(s, Math.cos(a) * r, Math.sin(a) * r);
    }
  };
  stamp(silhouette(INK), 15);
  stamp(silhouette("#ffffff"), 12);
  g.drawImage(img, MARGIN, MARGIN, inner, inner);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * 動かない売り場（棚・商品の箱）をまとめて描くための入れ物。
 * 箱を1つずつ別の部品にすると、棚5台で200回以上描くことになり、安いスマホで重い。
 * 面は色つきの1つの形に、黒いふちは1本の線にまとめて、2回で描く。
 */
class StaticBatch {
  private solids: BufferGeometry[] = [];
  private edges: BufferGeometry[] = [];
  private tmp = new Color();
  /** 黒いふちのついた箱を足す。m は置き場所（棚の位置と向き）。 */
  box(m: Matrix4, w: number, h: number, d: number, x: number, y: number, z: number, color: string) {
    const at = new Matrix4().makeTranslation(x, y, z).premultiply(m);
    const geo = new BoxGeometry(w, h, d).applyMatrix4(at);
    this.tmp.set(color);
    const n = geo.getAttribute("position").count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    geo.setAttribute("color", new BufferAttribute(cols, 3));
    this.solids.push(geo);
    this.edges.push(new EdgesGeometry(new BoxGeometry(w, h, d)).applyMatrix4(at));
  }
  /** まとめた2つの部品を返す。 */
  build(): Group {
    const g = new Group();
    g.add(new Mesh(mergeGeometries(this.solids), new MeshLambertMaterial({ vertexColors: true })));
    g.add(new LineSegments(mergeGeometries(this.edges), new LineBasicMaterial({ color: INK })));
    this.solids.forEach((x) => x.dispose());
    this.edges.forEach((x) => x.dispose());
    return g;
  }
}

// ---- 1体ぶんの動き ----
interface Clip {
  t0: number;
  dur: number;
  run: (k: number, rig: Rig) => void;
  done?: () => void;
}

interface Rig {
  side: 0 | 1;
  slot: number;
  root: Group; // 床の上の位置
  art: Mesh; // 絵の板
  mat: MeshBasicMaterial;
  shadow: Mesh;
  warn: Mesh; // あいてのため中の「！」
  home: Vector3;
  off: Vector3; // 体当たり・のけぞりのずれ
  squash: [number, number];
  tilt: number;
  lift: number;
  flash: number;
  down: number; // 0〜1（倒れた度合い）
  phase: number;
  clip: Clip | null; // 自分の動き（ため・体当たり）
  hurt: Clip | null; // 受けた動き
}

export interface Stage {
  windup(side: 0 | 1, slot: number, target: number): void;
  /** からだは体当たり、あじは味のしぶきが飛んでいく。当たった瞬間に onImpact（画面の座標）。 */
  hit(side: 0 | 1, slot: number, target: number, kind: Kind, power: Power, color: string, onImpact: (x: number, y: number) => void): void;
  /** こちらがねらう相手の足もとに輪を出す（null で消す）。 */
  aim(target: number | null): void;
  wipe(side: 0 | 1, slot: number): void;
  /** その子の体の真ん中が、画面のどこにあるか。 */
  where(side: 0 | 1, slot: number): { x: number; y: number };
  down(side: 0 | 1, slot: number): void;
  cheer(side: 0 | 1): void;
  /** 試合が終わった。動きが落ち着いたら描くのを止める。 */
  settle(): void;
  dispose(): void;
}

/** 舞台を作る。WebGLが使えなければ例外を投げる（呼ぶ側で2Dに戻す）。 */
export async function createStage(host: HTMLElement, fighters: LiveFighter[][]): Promise<Stage> {
  const calm = reducedMotion();
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  // 細かさは最大1.5倍まで（2倍だと描く点の数が1.8倍になり、安いスマホで重い）。遅ければ下で1倍に下げる
  let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(PAPER);
  const canvas = renderer.domElement;
  canvas.className = "stage3d-canvas";
  host.prepend(canvas);

  const scene = new Scene();
  scene.fog = new Fog(PAPER, 13, 22);
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  const CAM = new Vector3(0, 5.1, 9.5);
  const LOOK = new Vector3(0, 0.75, -0.55);
  camera.position.copy(CAM);
  camera.lookAt(LOOK);

  scene.add(new HemisphereLight("#ffffff", "#c9cfcc", 2.2));
  const sun = new DirectionalLight("#ffffff", 1.4);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  // ---- 売り場 ----
  const floorTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#eef1ee";
    g.fillRect(0, 0, 128, 128);
    g.fillRect(128, 128, 128, 128);
    g.strokeStyle = "#d7dcd9";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    g.beginPath();
    g.moveTo(128, 0);
    g.lineTo(128, 256);
    g.moveTo(0, 128);
    g.lineTo(256, 128);
    g.stroke();
  });
  floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
  floorTex.repeat.set(9, 9);
  const floor = new Mesh(new PlaneGeometry(26, 26), new MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // 真ん中の線（売り場の床のテープ）
  const tape = new Mesh(new PlaneGeometry(8.5, 0.16), new MeshBasicMaterial({ color: POP }));
  tape.rotation.x = -Math.PI / 2;
  tape.position.set(0, 0.004, 0.05);
  scene.add(tape);
  for (const dz of [-0.09, 0.09]) {
    const l = new Mesh(new PlaneGeometry(8.5, 0.025), new MeshBasicMaterial({ color: INK }));
    l.rotation.x = -Math.PI / 2;
    l.position.set(0, 0.005, 0.05 + dz);
    scene.add(l);
  }

  // 奥の棚（商品の箱は色だけ。文字やロゴは描かない）
  const goods = ["#F6B3C7", "#FFD36B", "#9BDCF5", "#B9E58A", "#EF5D4E", "#F3A63D", "#C3AAEC", "#E9C68C", "#8C6B56", "#F2EE6B", "#3F6E5C", "#ffffff"];
  let gi = 0;
  const batch = new StaticBatch();
  const shelf = (x: number, z: number, ry: number) => {
    const m = new Matrix4().makeRotationY(ry).setPosition(x, 0, z);
    const W = 2.6, H = 2.3, D = 0.7;
    batch.box(m, W, 0.12, D, 0, 0.06, 0, "#ffffff");
    for (const y of [0.85, 1.6, 2.3]) batch.box(m, W, 0.07, D, 0, y, 0, "#ffffff");
    batch.box(m, 0.08, H, D, -W / 2, H / 2, 0, "#ffffff");
    batch.box(m, 0.08, H, D, W / 2, H / 2, 0, "#ffffff");
    batch.box(m, W, H, 0.05, 0, H / 2, -D / 2, "#e6eae7");
    for (const [y0, h] of [[0.12, 0.62], [0.89, 0.6], [1.64, 0.55]] as const) {
      let cx = -W / 2 + 0.12;
      while (cx < W / 2 - 0.3) {
        const w = 0.26 + ((gi * 37) % 5) * 0.05;
        const hh = h * (0.7 + ((gi * 13) % 4) * 0.08);
        batch.box(m, w, hh, 0.42, cx + w / 2, y0 + hh / 2, 0.05, goods[gi++ % goods.length]);
        cx += w + 0.05;
      }
    }
    // 値札のレール
    for (const y of [0.88, 1.63]) batch.box(m, W, 0.09, 0.02, 0, y - 0.07, D / 2 + 0.01, POP);
  };
  shelf(-2.75, -5.6, 0);
  shelf(0, -5.6, 0);
  shelf(2.75, -5.6, 0);
  shelf(-6.0, -3.2, Math.PI / 2.6);
  shelf(6.0, -3.2, -Math.PI / 2.6);
  scene.add(batch.build());

  // 天井からさがる特売のPOP
  const popTex = canvasTexture(256, 128, (g) => {
    g.fillStyle = SALE;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = INK;
    g.lineWidth = 10;
    g.strokeRect(5, 5, 246, 118);
    g.fillStyle = "#fff";
    g.font = "900 64px 'Dela Gothic One', 'Hiragino Sans', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("バトル", 128, 68);
  });
  const pop = new Mesh(new PlaneGeometry(1.5, 0.75), new MeshBasicMaterial({ map: popTex }));
  pop.position.set(0, 2.95, -5.1);
  scene.add(pop);

  // ---- 印（ねらう輪、ため中の「！」） ----
  const shadowTex = canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    r.addColorStop(0, "rgba(29,29,34,.34)");
    r.addColorStop(1, "rgba(29,29,34,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  const warnTex = canvasTexture(128, 128, (g) => {
    g.fillStyle = SALE;
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = INK;
    g.stroke();
    g.fillStyle = "#fff";
    g.font = "900 84px 'Dela Gothic One', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("！", 66, 70);
  });
  const aimRing = (() => {
    const g = new Group();
    const ring = new Mesh(new RingGeometry(0.56, 0.74, 40), new MeshBasicMaterial({ color: SALE, transparent: true, opacity: 0.95 }));
    const edge = new Mesh(new RingGeometry(0.74, 0.79, 40), new MeshBasicMaterial({ color: INK }));
    ring.rotation.x = edge.rotation.x = -Math.PI / 2;
    ring.position.y = edge.position.y = 0.01;
    g.add(ring, edge);
    g.visible = false;
    g.userData.target = null;
    scene.add(g);
    return g;
  })();

  // ---- キャラ ----
  const disposables: { dispose(): void }[] = [];
  const planeGeo = new PlaneGeometry(ART, ART);
  const groundFrac = 1 - (MARGIN + (GROUND / VIEW) * (TEX - MARGIN * 2)) / TEX; // 足もとが板の下から何割か
  planeGeo.translate(0, ART / 2 - groundFrac * ART, 0);
  const rigs: Rig[][] = fighters.map((team) =>
    team.map((f) => {
      const root = new Group();
      const mat = new MeshBasicMaterial({ transparent: true, alphaTest: 0.02, color: "#ffffff", opacity: 0 });
      const art = new Mesh(planeGeo, mat);
      art.renderOrder = 2;
      const shadow = new Mesh(new CircleGeometry(0.62, 32), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.012;
      const warn = new Mesh(new PlaneGeometry(0.42, 0.42), new MeshBasicMaterial({ map: warnTex, transparent: true, depthTest: false }));
      warn.position.y = ART * 0.98;
      warn.visible = false;
      warn.renderOrder = 5;
      root.add(shadow, art, warn);
      scene.add(root);
      disposables.push(mat);
      stickerTexture(characterSvg(f)).then((t) => {
        mat.map = t;
        mat.needsUpdate = true;
        disposables.push(t);
      }, () => {});
      const home = new Vector3();
      return {
        side: f.side as 0 | 1, slot: f.slot, root, art, mat, shadow, warn,
        home,
        off: new Vector3(), squash: [1, 1] as [number, number], tilt: 0, lift: 0, flash: 0, down: 0,
        phase: f.slot * 1.9 + f.side * 0.7, clip: null, hurt: null,
      };
    }),
  );

  // ---- 縞の破片（使い回す）。1つの部品でまとめて描く（1枚ずつだと飛び散るたびに数十回描くことになる） ----
  const SHARDS = 72;
  const shardMesh = new InstancedMesh(new BoxGeometry(0.045, 0.36, 0.045), new MeshBasicMaterial({ color: "#ffffff" }), SHARDS);
  shardMesh.renderOrder = 4;
  shardMesh.frustumCulled = false;
  const hidden = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SHARDS; i++) {
    shardMesh.setMatrixAt(i, hidden);
    shardMesh.setColorAt(i, new Color(INK));
  }
  scene.add(shardMesh);
  const shards = Array.from({ length: SHARDS }, () => ({ m: new Object3D(), v: new Vector3(), spin: new Vector3(), life: 0, max: 1, len: 1, alive: false }));
  let shardAt = 0;
  const shardColor = new Color();
  function spray(at: Vector3, dir: Vector3, color: string, power: Power) {
    if (calm) return;
    const n = power === "move" ? 26 : power === "strong" ? 18 : power === "weak" ? 6 : 12;
    const speed = power === "move" ? 6.5 : power === "strong" ? 5 : 3.6;
    for (let i = 0; i < n; i++) {
      const idx = shardAt++ % SHARDS;
      const s = shards[idx];
      s.alive = true;
      shardMesh.setColorAt(idx, shardColor.set(i % 2 ? INK : color));
      s.m.position.copy(at);
      s.m.rotation.set(0, 0, 0);
      s.len = 0.6 + Math.random() * 0.9;
      const a = Math.random() * Math.PI * 2;
      s.v.set(Math.cos(a), Math.abs(Math.sin(a)) * 0.9 + 0.5, (Math.random() - 0.5) * 0.6).normalize().multiplyScalar(speed * (0.6 + Math.random() * 0.6));
      s.v.addScaledVector(dir, speed * 0.4);
      s.spin.set(Math.random() * 18 - 9, Math.random() * 18 - 9, Math.random() * 18 - 9);
      s.life = 0;
      s.max = 0.5 + Math.random() * 0.35;
    }
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  }

  // ---- 味のしぶき（使い回す） ----
  const dropGeo = new SphereGeometry(0.17, 14, 10);
  const drops = Array.from({ length: 8 }, () => {
    const m = new Mesh(dropGeo, new MeshBasicMaterial({ color: "#ffffff" }));
    const rim = new Mesh(dropGeo, new MeshBasicMaterial({ color: INK, side: BackSide })); // 裏面だけ少し大きく描いて、ふちの線にする
    rim.scale.setScalar(1.22);
    m.add(rim);
    m.visible = false;
    m.renderOrder = 4;
    scene.add(m);
    return { m, from: new Vector3(), to: new Vector3(), t0: 0, dur: 1, big: false, alive: false };
  });
  let dropAt = 0;

  // ---- 時計（当たった瞬間に少し止める） ----
  let clock = 0; // 演出の時刻（ms）。止めている間は進まない
  let freeze = 0;
  let lastReal = performance.now();
  const timers: { at: number; fn: () => void }[] = [];
  const after = (ms: number, fn: () => void) => timers.push({ at: clock + ms, fn });

  // カメラの揺れと寄り
  let quake = 0;
  let zoom = 0;
  const lean = new Vector3();

  for (const team of rigs) {
    for (const r of team) {
      const at = SPOTS[r.side][r.slot] ?? SPOTS[r.side][1];
      r.home.copy(at);
    }
  }

  const dirTo = (a: Rig, b: Rig) => {
    const d = b.home.clone().sub(a.home);
    d.y = 0;
    const len = d.length() || 1;
    return { d: d.divideScalar(len), len };
  };

  const stage: Stage = {
    windup(side, slot, target) {
      const a = rigs[side][slot], t = rigs[1 - side][target];
      if (!a || !t) return;
      if (side === 1) a.warn.visible = true;
      if (calm) return;
      const { d } = dirTo(a, t);
      a.clip = {
        t0: clock, dur: 400,
        run: (k, r) => {
          const e = easeOut(k);
          r.off.copy(d).multiplyScalar(-0.32 * e);
          r.squash = [1 - 0.08 * e, 1 + 0.08 * e];
          r.tilt = -0.12 * e * Math.sign(d.x || 0.0001);
        },
      };
    },
    hit(side, slot, target, kind, power, color, onImpact) {
      const a = rigs[side][slot], t = rigs[1 - side][target];
      if (!a || !t) return;
      a.warn.visible = false;
      const { d, len } = dirTo(a, t);
      const big = power === "move";
      // 相手まで走り込むのは、からだの技だけ。ふつうの体当たりは途中まで踏み込む。
      // 全員が相手まで走ると、真ん中で3〜4体が重なって何が起きているか分からなくなるため。
      // あじは、その場で体をしぼってしぶきを飛ばす
      const reach = kind === "aji" ? 0.22 : big ? Math.max(0.6, len - 1.35) : Math.min(1.1, len * 0.3);
      const dur = big ? 520 : 300;
      const HIT = 0.34;
      const flight = kind === "aji" ? (big ? 380 : 270) : 0;
      const impact = () => {
        const p = t.root.position.clone().add(new Vector3(0, ART * 0.42, 0));
        spray(p, d, color, power);
        t.flash = 1;
        if (!calm) {
          t.hurt = {
            t0: clock, dur: 300,
            run: (k, r) => {
              const e = Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k * 0.3);
              r.off.copy(d).multiplyScalar((big ? 0.45 : power === "strong" ? 0.32 : 0.2) * e);
              r.tilt = (d.x >= 0 ? -1 : 1) * 0.28 * e;
              r.squash = [1 + 0.06 * e, 1 - 0.06 * e];
            },
          };
          freeze = big ? 140 : power === "strong" ? 85 : power === "weak" ? 30 : 55;
          quake = Math.max(quake, big ? 0.22 : power === "strong" ? 0.13 : power === "weak" ? 0.03 : 0.07);
          zoom = Math.max(zoom, big ? 1 : power === "strong" ? 0.55 : 0.2);
          if (big) lean.copy(t.home).multiplyScalar(0.35);
        }
        const s = project(p);
        onImpact(s.x, s.y);
      };
      if (calm) {
        impact();
        return;
      }
      if (kind === "aji") {
        const dr = drops[dropAt++ % drops.length];
        dr.alive = true;
        (dr.m.material as MeshBasicMaterial).color.set(color);
        dr.from.copy(a.home).add(new Vector3(0, ART * 0.45, 0)).addScaledVector(d, 0.4);
        dr.to.copy(t.home).add(new Vector3(0, ART * 0.42, 0));
        dr.t0 = clock + dur * HIT;
        dr.dur = flight;
        dr.big = big;
        dr.m.position.copy(dr.from);
      }
      a.clip = {
        t0: clock, dur,
        run: (k, r) => {
          if (k < HIT) {
            const e = easeInOut(k / HIT);
            r.off.copy(d).multiplyScalar(-0.32 + (reach + 0.32) * e);
            r.lift = Math.sin(Math.PI * (k / HIT)) * (big ? 0.55 : 0.22);
            r.squash = [1 + 0.12 * e, 1 - 0.1 * e];
          } else if (k < 0.55) {
            r.off.copy(d).multiplyScalar(reach);
            r.lift = 0;
            r.squash = [1.1, 0.9];
          } else {
            const e = easeOut((k - 0.55) / 0.45);
            r.off.copy(d).multiplyScalar(reach * (1 - e));
            r.lift = Math.sin(Math.PI * e) * 0.12;
            r.squash = [1.1 - 0.1 * e, 0.9 + 0.1 * e];
          }
          r.tilt = 0.18 * Math.sign(d.x || 0.0001) * (1 - k);
        },
        done: () => {
          a.off.set(0, 0, 0);
          a.squash = [1, 1];
          a.tilt = 0;
          a.lift = 0;
        },
      };
      after(dur * HIT + flight, impact);
    },
    aim(target) {
      aimRing.userData.target = target;
    },
    wipe(side, slot) {
      const r = rigs[side][slot];
      if (!r || calm) return;
      r.flash = 0.6;
      r.hurt = {
        t0: clock, dur: 320,
        run: (k, rr) => {
          rr.tilt = Math.sin(k * Math.PI * 3) * 0.14 * (1 - k);
        },
      };
    },
    where(side, slot) {
      const r = rigs[side][slot];
      if (!r) return { x: 0, y: 0 };
      return project(new Vector3(r.home.x, ART * 0.42, r.home.z));
    },
    down(side, slot) {
      const r = rigs[side][slot];
      if (!r) return;
      r.warn.visible = false;
      r.clip = null;
      const start = clock;
      r.hurt = {
        t0: start, dur: calm ? 1 : 520,
        run: (k, rr) => {
          rr.down = easeOut(k);
          rr.lift = Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.35 * (1 - k);
          rr.off.set(0, 0, 0);
        },
      };
    },
    cheer(side) {
      if (calm) return;
      rigs[side].forEach((r, i) => {
        if (r.down > 0) return;
        after(i * 110, () => {
          r.clip = {
            t0: clock, dur: 800,
            run: (k, rr) => {
              rr.lift = Math.abs(Math.sin(k * Math.PI * 2)) * 0.45 * (1 - k * 0.4);
              rr.squash = [1, 1];
              rr.off.set(0, 0, 0);
            },
          };
        });
      });
    },
    settle() {
      ending = true;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as Material[];
        mats.forEach((x) => {
          (x as MeshBasicMaterial).map?.dispose();
          x.dispose();
        });
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };

  const tmp = new Vector3();
  function project(p: Vector3) {
    tmp.copy(p).project(camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h };
  }

  // ---- 大きさ ----
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // こちらの後ろの2体（いちばん手前で左右に広い）が、左右からはみ出さない広さにする
    const fwd = LOOK.clone().sub(CAM).normalize();
    const back = SPOTS[0][0];
    const depth = new Vector3(back.x, ART * 0.4, back.z).sub(CAM).dot(fwd);
    const half = Math.abs(back.x) + ART * 0.5 + 0.12;
    const fitH = 2 * Math.atan(Math.tan(Math.atan(half / depth)) / camera.aspect) * (180 / Math.PI);
    camera.fov = Math.max(30, fitH);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ---- 毎フレーム ----
  let raf = 0;
  let ending = false; // 試合が終わった
  let skip = false; // 静かなときは1つおきに描く
  let slowFrames = 0;
  const camTarget = new Vector3();
  /** 動いているもの（体当たり・しぶき・破片・揺れ・止め・これからの出来事・シールが出てくる途中）があるか。 */
  const busy = () =>
    freeze > 0 || quake > 0.002 || zoom > 0.002 || lean.lengthSq() > 1e-4 || timers.length > 0 ||
    shards.some((x) => x.alive) ||
    drops.some((x) => x.alive) ||
    rigs.some((team) => team.some((r) => r.clip || r.hurt || r.flash > 0 || (r.mat.map && r.mat.opacity < 1)));
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const gap = now - lastReal;
    const active = busy();
    // 試合が終わって落ち着いたら、もう描かない（電池と熱のため）
    if (ending && !active) {
      lastReal = now;
      return;
    }
    // 静かなとき（ゆらゆらしているだけ）は1つおきに描く
    const afterSkip = skip;
    skip = !active && !skip;
    if (skip) return;
    // 遅い端末では細かさを1倍に下げる（1コマ45ms以上が続いたら）。1つ飛ばした直後は間が倍になるので数えない
    if (!afterSkip) slowFrames = gap > 45 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 40 && pixelRatio > 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      resize();
    }
    let dt = Math.min(50, gap);
    lastReal = now;
    if (freeze > 0) {
      freeze -= dt;
      dt = 0;
    }
    clock += dt;
    const sec = clock / 1000;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= clock) {
        const t = timers.splice(i, 1)[0];
        t.fn();
      }
    }

    for (const team of rigs) {
      for (const r of team) {
        r.off.set(0, 0, 0);
        r.squash = [1, 1];
        r.tilt = 0;
        r.lift = 0;
        for (const key of ["hurt", "clip"] as const) {
          const c = r[key];
          if (!c) continue;
          const k = Math.min(1, (clock - c.t0) / c.dur);
          c.run(k, r);
          if (k >= 1) {
            r[key] = null;
            c.done?.();
          }
        }
        const alive = r.down < 1;
        const bob = alive && !calm ? Math.sin(sec * 2.6 + r.phase) * 0.035 : 0;
        r.root.position.set(r.home.x + r.off.x, 0, r.home.z + r.off.z);
        r.art.position.y = r.lift + bob;
        // 倒れる：後ろに寝る
        r.art.rotation.set(-r.down * 1.35, 0, r.tilt);
        const breathe = alive && !calm ? 1 + Math.sin(sec * 2.6 + r.phase + 1) * 0.015 : 1;
        const size = r.side === 0 ? MINE : 1;
        r.art.scale.set(r.squash[0] * breathe * size, (r.squash[1] / breathe) * size, 1);
        // 板はカメラのほうを向く（横回転だけ）
        r.root.rotation.y = Math.atan2(camera.position.x - r.root.position.x, camera.position.z - r.root.position.z);
        r.flash = Math.max(0, r.flash - dt / 170);
        const gray = 1 - r.down * 0.45;
        const f = 1 + r.flash * 2.2;
        r.mat.color.setRGB(gray * f, gray * f, gray * f);
        r.mat.opacity = Math.min(1, r.mat.opacity + dt / 300) * (r.mat.map ? 1 : 0);
        if (r.down > 0) r.mat.opacity = Math.min(r.mat.opacity, 1 - r.down * 0.35);
        r.shadow.scale.setScalar(1 - Math.min(0.4, r.lift * 0.5) - r.down * 0.3);
        if (r.warn.visible) r.warn.scale.setScalar(1 + Math.sin(sec * 18) * 0.08);
      }
    }

    // ねらう輪：ねらっている相手の足もと
    const aimed = aimRing.userData.target === null ? null : rigs[1][aimRing.userData.target as number];
    aimRing.visible = !!aimed && aimed.down < 1;
    if (aimed) {
      aimRing.position.set(aimed.home.x, 0, aimed.home.z);
      aimRing.scale.setScalar(1 + (calm ? 0 : Math.sin(sec * 6) * 0.04));
    }

    // 味のしぶき：山なりに飛んで、着いたら消える（当たりは hit の impact が出す）
    for (const dr of drops) {
      if (!dr.alive) continue;
      const k = (clock - dr.t0) / dr.dur;
      dr.m.visible = k >= 0 && k < 1;
      if (k < 0) continue;
      if (k >= 1) {
        dr.alive = false;
        continue;
      }
      dr.m.position.lerpVectors(dr.from, dr.to, k);
      dr.m.position.y += Math.sin(Math.PI * k) * (dr.big ? 0.9 : 0.55);
      dr.m.scale.setScalar((dr.big ? 1.6 : 1) * (0.6 + 0.4 * Math.min(1, k * 3)));
    }

    // 縞の破片
    const g = dt / 1000;
    let shardsMoved = false;
    shards.forEach((s, idx) => {
      if (!s.alive) return;
      shardsMoved = true;
      s.life += g;
      s.v.y -= 11 * g;
      s.m.position.addScaledVector(s.v, g);
      if (s.m.position.y < 0.02) {
        s.m.position.y = 0.02;
        s.v.multiplyScalar(0.4);
        s.v.y = Math.abs(s.v.y) * 0.3;
      }
      s.m.rotation.x += s.spin.x * g;
      s.m.rotation.y += s.spin.y * g;
      s.m.rotation.z += s.spin.z * g;
      // 消えぎわは細く小さくする（1つの部品なので、1枚ずつ透けさせられない）
      const fade = Math.max(0, 1 - Math.max(0, s.life / s.max - 0.6) / 0.4);
      s.m.scale.set(fade, s.len * fade, fade);
      s.m.updateMatrix();
      if (s.life >= s.max) s.alive = false;
      shardMesh.setMatrixAt(idx, s.alive ? s.m.matrix : hidden);
    });
    if (shardsMoved) shardMesh.instanceMatrix.needsUpdate = true;

    // カメラ：揺れ・寄り・技のときに少し傾く
    quake = Math.max(0, quake - dt / 1000 * 0.9);
    zoom = Math.max(0, zoom - dt / 1000 * 2.4);
    lean.multiplyScalar(Math.max(0, 1 - dt / 380));
    const q = quake * quake * 4;
    camTarget.copy(CAM).addScaledVector(new Vector3(0, -0.35, -1.6), zoom).add(new Vector3(lean.x * 0.6, 0, lean.z * 0.3));
    camera.position.set(
      camTarget.x + (Math.random() - 0.5) * q,
      camTarget.y + (Math.random() - 0.5) * q,
      camTarget.z,
    );
    camera.lookAt(LOOK.x + lean.x, LOOK.y, LOOK.z + lean.z * 0.5);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // 開発中だけ：描画の回数と、キャラの絵が画面のどこにあるかを外から見られるようにする（重さと重なりを測るため）
  if (import.meta.env.DEV) {
    (globalThis as unknown as { __stage3d?: unknown }).__stage3d = {
      info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio() }),
      rects: () =>
        rigs.flat().map((r) => {
          const pts = [-ART / 2, ART / 2].flatMap((dx) => [0, ART * (1 - groundFrac) * 0.92].map((dy) => project(new Vector3(r.home.x + dx, dy, r.home.z))));
          const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
          return { side: r.side, slot: r.slot, down: r.down >= 1, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
        }),
    };
  }
  return stage;
}
