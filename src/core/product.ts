// 商品の中身 → キャラの「味」と「色」。
// 商品名やカテゴリの文字から、ルール（キーワード辞書）で決める。AIは使わない。
// 実在の商品名やブランド名は保存も表示もしない。残すのは「ぶどう系」のような分類だけ。

import type { Palette, Taste } from "./creature";

export interface Flavor {
  id: string;
  label: string; // 表示用（例：ぶどう）
  taste: Taste;
  palette: Palette;
  moves: string[];
  words: string[]; // 小文字・ひらがな/カタカナ混在で照合
}

// 上から順に照合する。具体的なものを先に置く。
export const FLAVORS: Flavor[] = [
  { id: "habanero", label: "激辛", taste: "からい", palette: { name: "とうがらし", body: "#EF5D4E", shade: "#A92D24" }, moves: ["激辛ストレート", "火吹きスパイス"], words: ["激辛", "ハバネロ", "唐辛子", "とうがらし", "一味", "七味", "辛口", "spicy", "chili", "hot sauce"] },
  { id: "wasabi", label: "わさび", taste: "からい", palette: { name: "わさび", body: "#C5E07A", shade: "#7FA02C" }, moves: ["ツーンと一撃", "わさびショット"], words: ["わさび", "山葵", "wasabi"] },
  { id: "curry", label: "カレー", taste: "からい", palette: { name: "カレー", body: "#F3A63D", shade: "#BE6A12" }, moves: ["スパイス渦巻き", "ルウのしぶき"], words: ["カレー", "curry", "curries", "キムチ", "麻婆"] },
  { id: "matcha", label: "抹茶", taste: "にがい", palette: { name: "抹茶", body: "#9FCB86", shade: "#4F8A40" }, moves: ["抹茶の一服", "ほろにがバリア"], words: ["抹茶", "matcha"] },
  { id: "greentea", label: "お茶", taste: "にがい", palette: { name: "緑茶", body: "#B8D98A", shade: "#5E8E3A" }, moves: ["渋みの構え", "ほっと一息"], words: ["緑茶", "煎茶", "玄米茶", "ほうじ茶", "麦茶", "烏龍茶", "ウーロン茶", "ジャスミン茶", "生茶", "お茶", "グリーンティー", "green tea", "oolong", "茶葉"] },
  { id: "blacktea", label: "紅茶", taste: "にがい", palette: { name: "紅茶", body: "#C9774F", shade: "#7E3A1E" }, moves: ["アールグレイの香り", "ティータイム"], words: ["紅茶", "ミルクティー", "レモンティー", "アイスティー", "ストレートティー", "アールグレイ", "ダージリン", "black tea", "earl grey"] },
  { id: "coffee", label: "コーヒー", taste: "にがい", palette: { name: "コーヒー", body: "#8C6B56", shade: "#4E382A" }, moves: ["深煎りの目覚め", "カフェインラッシュ"], words: ["コーヒー", "珈琲", "coffee", "カフェオレ", "カフェラテ", "カフェモカ", "ラテ", "latte", "espresso", "エスプレッソ", "ドリップ", "モカ", "ブレンディ", "blendy", "タリーズ", "tullys", "ネスカフェ", "nescafe", "モンカフェ"] },
  { id: "beer", label: "麦", taste: "にがい", palette: { name: "麦", body: "#F2C14E", shade: "#B9811A" }, moves: ["泡立ちタックル", "ホップの一撃"], words: ["ビール", "beer", "発泡酒", "ハイボール", "麦酒", "ノンアルコール"] },
  { id: "cola", label: "コーラ", taste: "あまい", palette: { name: "コーラ", body: "#8A4430", shade: "#45180E" }, moves: ["炭酸はじけ", "シュワッと突進"], words: ["コーラ", "cola"] },
  { id: "soda", label: "ラムネ", taste: "すっぱい", palette: { name: "ラムネ", body: "#9BDCF5", shade: "#3E97CB" }, moves: ["炭酸はじけ", "ビー玉ころがし"], words: ["ラムネ", "サイダー", "ソーダ", "soda", "炭酸", "スパークリング", "sparkling"] },
  { id: "grapefruit", label: "グレープフルーツ", taste: "すっぱい", palette: { name: "グレープフルーツ", body: "#F7A88F", shade: "#D25E48" }, moves: ["ほろにが果汁", "ルビーしぶき"], words: ["グレープフルーツ", "grapefruit"] },
  { id: "pineapple", label: "パイン", taste: "すっぱい", palette: { name: "パイン", body: "#F8D84A", shade: "#C99A12" }, moves: ["トロピカルスピン", "とげとげガード"], words: ["パイナップル", "パイン", "pineapple"] },
  { id: "grape", label: "ぶどう", taste: "あまい", palette: { name: "ぶどう", body: "#B596E6", shade: "#6B47B3" }, moves: ["グレープしぶき", "ひとふさアタック"], words: ["ぶどう", "葡萄", "グレープ", "grape", "巨峰", "ウェルチ", "welch"] },
  { id: "muscat", label: "マスカット", taste: "あまい", palette: { name: "マスカット", body: "#C8E68F", shade: "#7DA73A" }, moves: ["みずみずしいタッチ", "ひとつぶ投げ"], words: ["マスカット", "シャインマスカット", "muscat"] },
  { id: "strawberry", label: "いちご", taste: "あまい", palette: { name: "いちご", body: "#F6A3B8", shade: "#D24D6E" }, moves: ["とろけるハグ", "つぶつぶ連打"], words: ["いちご", "苺", "イチゴ", "ストロベリー", "strawberry", "strawberries", "あまおう"] },
  { id: "peach", label: "もも", taste: "あまい", palette: { name: "もも", body: "#FFC4B0", shade: "#E07B66" }, moves: ["ふわふわ包み", "白桃のささやき"], words: ["もも", "桃", "ピーチ", "peach", "白桃"] },
  { id: "melon", label: "メロン", taste: "あまい", palette: { name: "メロン", body: "#A9E2A1", shade: "#4E9F53" }, moves: ["網目ガード", "メロンスプラッシュ"], words: ["メロン", "melon"] },
  { id: "apple", label: "りんご", taste: "あまい", palette: { name: "りんご", body: "#F27C6E", shade: "#B23B33" }, moves: ["シャキッと一撃", "蜜のしずく"], words: ["りんご", "林檎", "アップル", "apple"] },
  { id: "lemon", label: "レモン", taste: "すっぱい", palette: { name: "レモン", body: "#F2EE6B", shade: "#B7AE25" }, moves: ["キュッと酸っぱ", "ビタミンビーム"], words: ["レモン", "檸檬", "lemon", "レモネード", "ゆず", "柚子", "ライム", "lime"] },
  { id: "citrus", label: "みかん", taste: "すっぱい", palette: { name: "みかん", body: "#FFB547", shade: "#D27A17" }, moves: ["果汁スプラッシュ", "皮むきスピン"], words: ["みかん", "蜜柑", "オレンジ", "orange", "柑橘", "ネーブル"] },
  { id: "vinegar", label: "お酢", taste: "すっぱい", palette: { name: "うめ", body: "#F2A0A6", shade: "#C9525E" }, moves: ["ビネガーショット", "すっぱ顔"], words: ["酢", "ビネガー", "vinegar", "梅", "うめ", "ume"] },
  { id: "chocolate", label: "チョコ", taste: "あまい", palette: { name: "チョコ", body: "#9A6648", shade: "#52301E" }, moves: ["とろけるハグ", "ビターガナッシュ"], words: ["チョコ", "ショコラ", "chocolate", "ココア", "cocoa", "カカオ"] },
  { id: "milk", label: "ミルク", taste: "あまい", palette: { name: "ミルク", body: "#EEF1F7", shade: "#9FAAC2" }, moves: ["ミルキーウェーブ", "まろやかガード"], words: ["牛乳", "ミルク", "milk", "ヨーグルト", "yogurt", "乳酸菌", "乳飲料", "カルピス", "クリープ"] },
  { id: "sweets", label: "おかし", taste: "あまい", palette: { name: "はちみつ", body: "#FFD36B", shade: "#D99A2B" }, moves: ["シュガーコート", "サクサク連打"], words: ["クッキー", "ビスケット", "グミ", "キャンディ", "飴", "アイス", "プリン", "ケーキ", "ドーナツ", "はちみつ", "蜂蜜", "キャラメル", "あんこ", "まんじゅう", "ようかん", "cookie", "candy", "candies", "biscuit", "sweet", "dessert"] },
  { id: "soy", label: "しょうゆ", taste: "うまい", palette: { name: "しょうゆ", body: "#A65E40", shade: "#62301D" }, moves: ["とろみロック", "香ばしい一撃"], words: ["しょうゆ", "醤油", "ソース", "soy", "てりやき", "照り焼き", "焼きそば"] },
  { id: "miso", label: "みそ", taste: "うまい", palette: { name: "みそ", body: "#D9A866", shade: "#94652B" }, moves: ["発酵パワー", "みそ玉ころがし"], words: ["みそ", "味噌", "miso", "納豆"] },
  { id: "noodle", label: "めん", taste: "うまい", palette: { name: "だし", body: "#E9C68C", shade: "#AE8443" }, moves: ["だし巻きタックル", "ずるずる旋風"], words: ["ラーメン", "らーめん", "ヌードル", "noodle", "うどん", "そば", "スープ", "soup", "だし", "出汁", "カップ麺", "即席"] },
  { id: "seaweed", label: "のり", taste: "うまい", palette: { name: "のり", body: "#3F6E5C", shade: "#203F33" }, moves: ["パリッと包囲", "うまみ爆発"], words: ["海苔", "焼きのり", "味付けのり", "味のり", "韓国のり", "のり巻", "のり弁", "おにぎり", "わかめ", "昆布", "seaweed"] },
  { id: "salty", label: "しお", taste: "しょっぱい", palette: { name: "しお", body: "#E6EDF2", shade: "#9AAAB8" }, moves: ["ひとつまみ", "うす塩ガード"], words: ["しお", "塩", "ポテト", "チップス", "chips", "crisps", "スナック", "snack", "プレッツェル", "柿の種", "あられ", "おかき", "せんべい", "煎餅", "ナッツ", "nuts", "peanut", "salt", "salted"] },
  { id: "water", label: "みず", taste: "しょっぱい", palette: { name: "みず", body: "#CDEBF5", shade: "#6FA9C4" }, moves: ["ミネラルシャワー", "すきとおる盾"], words: ["天然水", "ミネラルウォーター", "スポーツドリンク", "ポカリ", "アクエリアス", "経口補水", "water"] },
];

const BY_ID = new Map(FLAVORS.map((f) => [f.id, f]));
export function flavorById(id: string | undefined): Flavor | undefined {
  return id ? BY_ID.get(id) : undefined;
}

// どの味の言葉にも当たらなかったときだけ見る、ざっくりした言葉。
// 1文字の言葉は別の言葉の中にも出てくる（「清涼飲料水」の水など）ので、上の辞書には入れずここで拾う。
const FALLBACKS: [word: string, id: string][] = [
  ["茶", "greentea"],
  ["水", "water"],
];

function norm(s: string): string {
  // カタカナ→ひらがなはせず、そのまま小文字化だけ。辞書側に両方書く。ハイフンは空白として扱う（en:grape-juices など）。
  return s.normalize("NFKC").toLowerCase().replace(/[-_]/g, " ");
}

/**
 * 言葉1つぶんの照合。
 * 英語の言葉は、単語として出てきたときだけ当てる（複数形の s / es は許す）。
 * そうしないと chocolate の中の cola、legumes の中の ume、hot-beverages の hot に当たってしまう。
 * 日本語は単語の切れ目が無いので、含まれていれば当たり。
 */
function matcher(word: string): (hay: string) => boolean {
  const w = norm(word);
  if (!/^[a-z ]+$/.test(w)) return (hay) => hay.includes(w);
  const re = new RegExp(`(?<![a-z])${w}(?:e?s)?(?![a-z])`);
  return (hay) => re.test(hay);
}

const MATCHERS = FLAVORS.map((f) => ({ flavor: f, tests: f.words.map(matcher) }));

/** 商品名・カテゴリの文字から味を決める。決まらなければ undefined。 */
export function classify(texts: string[]): Flavor | undefined {
  const hay = norm(texts.filter(Boolean).join(" "));
  if (!hay.trim()) return undefined;
  for (const { flavor, tests } of MATCHERS) {
    if (tests.some((t) => t(hay))) return flavor;
  }
  for (const [word, id] of FALLBACKS) {
    if (hay.includes(word)) return BY_ID.get(id);
  }
  return undefined;
}

/** サーバーが返し、端末に保存する商品プロフィール。商品名は含めない。 */
export interface ProductProfile {
  flavor?: string; // Flavor.id
  source: "off" | "maker" | "none"; // off＝Open Food Facts で決まった / maker＝メーカー番号から推測した / none＝中身なし（品番だけで決まる）
}
