// JAN（EAN-13）まわりの計算。読み取った数字の検証と、縞模様（95モジュール）の再現。

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function checkDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** 入力を13桁のJANにそろえる。不正なら null。 */
export function normalize(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  let code: string;
  if (d.length === 13) code = d;
  else if (d.length === 12) code = "0" + d; // UPC-A
  else if (d.length === 8) {
    // EAN-8 はチェック数字を確かめてから、識別用に13桁へ伸ばす
    let s = 0;
    for (let i = 0; i < 7; i++) s += Number(d[i]) * (i % 2 === 0 ? 3 : 1);
    if ((10 - (s % 10)) % 10 !== Number(d[7])) return null;
    return "00000" + d;
  } else return null;
  return checkDigit(code.slice(0, 12)) === Number(code[12]) ? code : null;
}

/** 95モジュールの白黒列（"1"=黒）。 */
export function modules(jan: string): string {
  const first = Number(jan[0]);
  const parity = PARITY[first];
  let s = "101";
  for (let i = 0; i < 6; i++) {
    const n = Number(jan[1 + i]);
    s += parity[i] === "L" ? L[n] : G[n];
  }
  s += "01010";
  for (let i = 0; i < 6; i++) s += R[Number(jan[7 + i])];
  s += "101";
  return s;
}

export interface Bar {
  x: number; // モジュール単位の開始位置
  w: number; // モジュール単位の幅
  guard: boolean; // 両端と中央の長い棒
}

/** 黒い棒の一覧。EAN-13 は必ず30本。 */
export function bars(jan: string): Bar[] {
  const m = modules(jan);
  const out: Bar[] = [];
  let i = 0;
  while (i < m.length) {
    if (m[i] === "1") {
      let j = i;
      while (j < m.length && m[j] === "1") j++;
      const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
      out.push({ x: i, w: j - i, guard });
      i = j;
    } else i++;
  }
  return out;
}

export type CodeKind = "product" | "store" | "book" | "magazine" | "short";

export function kindOf(jan: string): CodeKind {
  if (jan.startsWith("00000")) return "short";
  const p2 = jan.slice(0, 2);
  if (p2 === "02" || p2 === "04" || (Number(p2) >= 20 && Number(p2) <= 29)) return "store";
  if (jan.startsWith("978") || jan.startsWith("979")) return "book";
  if (jan.startsWith("491")) return "magazine";
  return "product";
}

export const KIND_LABEL: Record<CodeKind, string> = {
  product: "商品",
  store: "お店のラベル",
  book: "本",
  magazine: "雑誌",
  short: "短縮バーコード",
};

/** 試し用の番号（チェック数字つき）を作る。 */
export function withCheck(first12: string): string {
  return first12 + checkDigit(first12);
}
