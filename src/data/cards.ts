import { assetUrl } from "../utils/assetUrl";
import { shuffled } from "../engine/rng";
export type Suit = "spade" | "heart" | "club" | "diamond";
export const SUIT_SYMBOL: Record<Suit, string> = { spade: "♠", heart: "♥", club: "♣", diamond: "♦" };
export const SUIT_COLOR: Record<Suit, string> = {
  spade: "#1a1a1a", club: "#1a1a1a", heart: "#8a1f1f", diamond: "#8a1f1f",
};

export type CardKind = "basic" | "strategy" | "equip";
export type EquipSlot = "weapon" | "armor" | "mount+" | "mount-" | "trinket";

export interface CardDef {
  uid: string;
  key: string;
  name: string;
  kind: CardKind;
  suit: Suit;
  rank: string;
  desc: string;
  flavor: string;
  range?: number;
  equipSlot?: EquipSlot;
  image?: string;
}

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["spade", "heart", "club", "diamond"];

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `c${uidCounter}`;
}

function makeCards(key: string, name: string, kind: CardKind, count: number, desc: string, flavor: string, extra?: Partial<CardDef>): CardDef[] {
  const cards: CardDef[] = [];
  for (let i = 0; i < count; i++) {
    const suit = SUITS[i % 4];
    const rank = RANKS[(i * 3 + key.length) % RANKS.length];
    cards.push({ uid: uid(), key, name, kind, suit, rank, desc, flavor, ...extra });
  }
  return cards;
}

// Card image mapping
export const CARD_IMAGE: Record<string, string> = {
  bifa:      assetUrl("images/cards/bifa.jpg"),
  liubai:    assetUrl("images/cards/liubai.jpg"),
  canmo:     assetUrl("images/cards/canmo.jpg"),
  poti:      assetUrl("images/cards/poti.jpg"),
  pangzhu:   assetUrl("images/cards/pangzhu.jpg"),
  cuanqu:    assetUrl("images/cards/cuanqu.jpg"),
  xubi:      assetUrl("images/cards/xubi.jpg"),
  fengbi:    assetUrl("images/cards/fengbi.jpg"),
  lunbian:   assetUrl("images/cards/lunbian.jpg"),
  mochao:    assetUrl("images/cards/mochao.jpg"),
  liuyan:    assetUrl("images/cards/liuyan.jpg"),
  gongxu:    assetUrl("images/cards/gongxu.jpg"),
  jiemo:     assetUrl("images/cards/jiemo.jpg"),
  chongxu:   assetUrl("images/cards/chongxu.jpg"),
  suoshi:    assetUrl("images/cards/suoshi.jpg"),
  buying:    assetUrl("images/cards/buying.jpg"),
  caizhi:    assetUrl("images/cards/caizhi.jpg"),
  ranxue:    assetUrl("images/cards/ranxue.jpg"),
  xiuji:     assetUrl("images/cards/xiuji.jpg"),
  bilei:     assetUrl("images/cards/bilei.jpg"),
  liubaiping:assetUrl("images/cards/liubaiping.jpg"),
  zhengshen: assetUrl("images/cards/zhengshen.jpg"),
  zhichi:    assetUrl("images/cards/zhichi.jpg"),
  zhezhi:    assetUrl("images/cards/zhezhi.jpg"),
  duya:      assetUrl("images/cards/duya.jpg"),
  mitu:      assetUrl("images/cards/mitu.jpg"),
};

export function buildFullDeck(): CardDef[] {
  const deck: CardDef[] = [];
  // 基本牌
  deck.push(...makeCards("bifa", "笔伐", "basic", 28, "对攻击范围内1名玩家使用，目标须打出留白，否则受到1段篇幅伤害。", "以叙事之力改写对手的存在段落，从文本层面发起攻击。", { image: CARD_IMAGE.bifa }));
  deck.push(...makeCards("liubai", "留白", "basic", 24, "抵消1次笔伐，或1次流言风暴。", "在叙事文本中留下一片空白，让攻击性的修改无法找到落笔之处。", { image: CARD_IMAGE.liubai }));
  deck.push(...makeCards("canmo", "残墨", "basic", 12, "恢复1段篇幅，亦可用于濒死救援。", "收集散落的叙事残片，重新融入自身的文本段落。", { image: CARD_IMAGE.canmo }));
  // 策略牌
  deck.push(...makeCards("poti", "破题", "strategy", 6, "当1张策略牌生效时，打出破题使其失效。", "审阅对手的叙事操作，在其生效前识破并瓦解。", { image: CARD_IMAGE.poti }));
  deck.push(...makeCards("pangzhu", "旁注", "strategy", 4, "弃置指定玩家的1件畸变物或判定区的1张牌。", "在世界文本的边缘写下旁注，以注释之力干扰目标的叙事装备。", { image: CARD_IMAGE.pangzhu }));
  deck.push(...makeCards("cuanqu", "篡取", "strategy", 4, "获得指定玩家距离1以内的1张手牌或畸变物。", "从他人的叙事文本中删除一段，并将其据为己有。", { image: CARD_IMAGE.cuanqu }));
  deck.push(...makeCards("xubi", "续笔", "strategy", 4, "从牌堆摸2张牌。", "在世界文本中插入全新的段落，从虚无中创造叙事资源。", { image: CARD_IMAGE.xubi }));
  deck.push(...makeCards("fengbi", "封笔", "strategy", 3, "放置于判定区，若判定非红桃则跳过对方书写阶段。", "以极高阶的叙事操作锁定目标的修改权限。", { image: CARD_IMAGE.fengbi }));
  deck.push(...makeCards("lunbian", "论辨", "strategy", 3, "与指定玩家对决，轮流出笔伐，先无法出者受到1段伤害，胜者摸1张牌。", "在叙事层面发起一场论辨，以笔为刃，以墨为血。", { image: CARD_IMAGE.lunbian }));
  deck.push(...makeCards("mochao", "墨潮", "strategy", 2, "所有其他玩家须打出笔伐，否则受到1段篇幅伤害。", "叙事能量如墨色的潮水般席卷全场。", { image: CARD_IMAGE.mochao }));
  deck.push(...makeCards("liuyan", "流言风暴", "strategy", 2, "所有其他玩家须打出留白，否则受到1段伤害。", "一则流言在叙事网络中疯狂传播，最终形成信息洪流。", { image: CARD_IMAGE.liuyan }));
  deck.push(...makeCards("gongxu", "共叙", "strategy", 1, "你和你指定的1名玩家各恢复1段篇幅。", "所有叙事者共同续写一段新的篇章，为在场所有人恢复篇幅。", { image: CARD_IMAGE.gongxu }));
  deck.push(...makeCards("jiemo", "借墨", "strategy", 1, "指定1名玩家，令其对其射程内另1名玩家使用笔伐；若其无笔伐则受到1段伤害。", "以叙事之力驱使他人为你执笔，借他人之墨达成目的。", { image: CARD_IMAGE.jiemo }));
  deck.push(...makeCards("chongxu", "重叙", "strategy", 1, "放置于判定区。回合开始时判定：黑桃2~9则受到3段伤害；否则传给下家。", "重叙日的力量在桌面重现，那毁灭性的三十七秒。", { image: CARD_IMAGE.chongxu }));
  // 畸变物 - 武器
  deck.push(...makeCards("suoshi", "溯时沙漏", "equip", 1, "攻击范围2。造成伤害后，受击者下回合不进行自然篇幅恢复。", "一座古老的沙漏，沙粒倒流时最近发生的事件会以幻影重现。", { range: 2, equipSlot: "weapon", image: CARD_IMAGE.suoshi }));
  deck.push(...makeCards("buying", "捕影画框", "equip", 1, "攻击范围3。使用笔伐时查看目标1张手牌（结算防御前）。", "一个无名的空相框，能窥见对手叙事文本中的片段。", { range: 3, equipSlot: "weapon", image: CARD_IMAGE.buying }));
  deck.push(...makeCards("caizhi", "裁纸利刃", "equip", 1, "攻击范围2。笔伐命中后弃置目标1件畸变物。", "一柄能切断叙事联系的利刃，挥出时留下不可愈合的裂痕。", { range: 2, equipSlot: "weapon", image: CARD_IMAGE.caizhi }));
  deck.push(...makeCards("ranxue", "染血墨笔", "equip", 1, "攻击范围1。每回合限1次，笔伐造成2段伤害。", "一支被叙事者鲜血浸染的墨笔，落笔皆是毁灭之力。", { range: 1, equipSlot: "weapon", image: CARD_IMAGE.ranxue }));
  deck.push(...makeCards("xiuji", "锈迹刻刀", "equip", 1, "攻击范围4。纯远程武器：无法攻击距离1以内的目标。", "一把布满锈迹的刻刀，能在极远的距离上刻下叙事的痕迹。", { range: 4, equipSlot: "weapon", image: CARD_IMAGE.xiuji }));
  // 畸变物 - 护甲
  deck.push(...makeCards("bilei", "叙事壁垒", "equip", 2, "每回合完全抵消第1次受到的笔伐伤害。", "由凝固的叙事能量构成的壁垒，环绕在叙事者周身。", { equipSlot: "armor", image: CARD_IMAGE.bilei }));
  deck.push(...makeCards("liubaiping", "留白屏障", "equip", 1, "需要打出留白时，可改为弃1张手牌抵消。", "在自身周围构建一片留白区域，攻击性的修改会在空白中迷失。", { equipSlot: "armor", image: CARD_IMAGE.liubaiping }));
  deck.push(...makeCards("zhengshen", "正身符印", "equip", 1, "每回合限1次，免疫1张以你为目标的策略牌。", "一枚刻有正身二字的符印，正气凛然则万法不侵。", { equipSlot: "armor", image: CARD_IMAGE.zhengshen }));
  // 畸变物 - 坐骑/辅助
  deck.push(...makeCards("zhichi", "咫尺之靴", "equip", 2, "与所有其他玩家的距离-1（进攻用）。", "一双能将空间缩短为咫尺的靴子。", { equipSlot: "mount-", image: CARD_IMAGE.zhichi }));
  deck.push(...makeCards("zhezhi", "折纸之翼", "equip", 2, "与所有其他玩家的距离+1（防御用）。", "将三维空间折叠为二维平面的能力凝结为翼。", { equipSlot: "mount+", image: CARD_IMAGE.zhezhi }));
  deck.push(...makeCards("duya", "渡鸦信使", "equip", 1, "摸牌阶段额外摸1张牌。", "一只在叙事层面飞行的渡鸦，搜集额外的叙事资源。", { equipSlot: "trinket", image: CARD_IMAGE.duya }));
  deck.push(...makeCards("mitu", "迷途指南针", "equip", 1, "距离为2的玩家不能以你为策略牌目标。", "一个永远指向迷途的指南针，制造迷惑而非指引。", { equipSlot: "trinket", image: CARD_IMAGE.mitu }));
  return deck;
}

/**
 * 洗牌。走 engine/rng 的统一随机源而不是 Math.random —— 否则整副牌的顺序
 * 无法复现，simulation.test.ts 的偶发失败就永远查不下去。
 */
export function shuffle<T>(arr: T[]): T[] {
  return shuffled(arr);
}
