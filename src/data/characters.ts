import { assetUrl } from "../utils/assetUrl";
export type SkillType = "被动" | "触发式被动" | "主动" | "终极";

export interface Skill {
  key: string;
  name: string;
  type: SkillType;
  rankReq: 1 | 2 | 3 | 4;
  cost: number;
  desc: string;
}

export interface CharacterDef {
  id: number;
  name: string;
  ability: string;
  quote: string;
  desc: string;
  maxFragments: number;
  portrait: string;
  color: string;
  skills: Skill[];
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 1, name: "萧难", ability: "空白", maxFragments: 4, color: "#d9d3c4",
    portrait: assetUrl("images/characters/xiaonan.jpg"),
    quote: "当一切被剥去，你才会看见真正的世界。",
    desc: "所有其余叙事无法作用于其身，如同世界文本中的空白页，任何叙事操作触及其身都会滑开。",
    skills: [
      { key: "blank_body", name: "空白之身", type: "被动", rankReq: 1, cost: 0, desc: "每回合限1次，免疫1张以你为目标的策略牌。" },
      { key: "blank_field", name: "空白领域", type: "主动", rankReq: 3, cost: 1, desc: "直到你的下回合开始，所有笔伐对你无效。使用后下回合不能使用空白之身。" },
    ],
  },
  {
    id: 2, name: "秦骁", ability: "王寇", maxFragments: 5, color: "#b23b3b",
    portrait: assetUrl("images/characters/qinxiao.jpg"),
    quote: "胜者为王，败者为寇。",
    desc: "主动发起对决，胜则夺取对方资源，败则损失自身。",
    skills: [
      { key: "duel_challenge", name: "王寇对决", type: "主动", rankReq: 1, cost: 2, desc: "选择1名玩家发起对决，先无法出笔伐者受到1段伤害，胜方额外摸1张牌。" },
      { key: "king_or_bandit", name: "胜者为王", type: "被动", rankReq: 2, cost: 0, desc: "对决获胜时随机夺取败者1张手牌，若无手牌则恢复1段篇幅。" },
    ],
  },
  {
    id: 3, name: "苏予", ability: "心锚", maxFragments: 4, color: "#7a4fa0",
    portrait: assetUrl("images/characters/suyu.jpg"),
    quote: "我不是在操控你的人生，而是你叙事的第一个锚点。",
    desc: "锚定他人心理状态，既能锁定现状，也能植入并锁定特定状态。",
    skills: [
      { key: "anchor", name: "锚定", type: "主动", rankReq: 1, cost: 1, desc: "指定1名玩家，其下回合不能使用策略牌。" },
      { key: "heart_lock", name: "心锁", type: "主动", rankReq: 3, cost: 1, desc: "指定1名玩家，其下回合不能使用笔伐或不能使用角色技能。" },
    ],
  },
  {
    id: 4, name: "方妍", ability: "正身", maxFragments: 5, color: "#c9a24b",
    portrait: assetUrl("images/characters/fangyan.jpg"),
    quote: "法律不保护你，是因为你从未真正理解它。",
    desc: "正身以除恶，身正当破万法，对邪恶扭曲的叙事有极强抵抗与反制能力。",
    skills: [
      { key: "law_body", name: "万法不侵", type: "被动", rankReq: 1, cost: 0, desc: "每回合限1次，你的1张留白可抵消2次笔伐。" },
      { key: "purge_evil", name: "破邪", type: "主动", rankReq: 3, cost: 2, desc: "本回合内，指定玩家的所有畸变物失效。" },
    ],
  },
  {
    id: 5, name: "江戾", ability: "冥礼", maxFragments: 4, color: "#5c0d0d",
    portrait: assetUrl("images/characters/jiangli.jpg"),
    quote: "阴阳之间，代价是对等的。",
    desc: "涉及鬼神祭祀，等价交换，以特定代价换取特定效果。",
    skills: [
      { key: "equal_exchange", name: "等价交换", type: "主动", rankReq: 1, cost: 1, desc: "弃1张手牌，摸2张牌。" },
      { key: "sacrifice", name: "祭祀", type: "主动", rankReq: 2, cost: 1, desc: "强制指定玩家弃1张手牌，若其手牌为0则受到1段伤害。" },
    ],
  },
  {
    id: 6, name: "殷泽", ability: "咫尺", maxFragments: 4, color: "#2f6d5c",
    portrait: assetUrl("images/characters/yinze.jpg"),
    quote: "当叙事之剑挥向终点。",
    desc: "一定范围内将空间缩短为咫尺，大幅缩短距离但仍有实际距离。",
    skills: [
      { key: "close_range", name: "咫尺天涯", type: "被动", rankReq: 1, cost: 0, desc: "你的攻击范围始终+1。" },
      { key: "shrink_land", name: "缩地成寸", type: "主动", rankReq: 3, cost: 1, desc: "本回合内，你的攻击范围变为全场。" },
    ],
  },
  {
    id: 7, name: "何笙", ability: "止戈", maxFragments: 5, color: "#8a6d2f",
    portrait: assetUrl("images/characters/hesheng.jpg"),
    quote: "止戈非怯战，是不忍见无谓的伤亡。",
    desc: "强制让双方停止斗争，以极强的说服让人相信此刻不应战斗。",
    skills: [
      { key: "stop_war", name: "止戈", type: "主动", rankReq: 2, cost: 2, desc: "指定1名玩家，直到你的下回合开始其不能使用笔伐。" },
      { key: "quell_strife", name: "息争", type: "触发式被动", rankReq: 1, cost: 1, desc: "受到笔伐时可消耗1段篇幅将其转移给距离1以内的另一玩家，每回合限1次。" },
    ],
  },
  {
    id: 8, name: "周闻", ability: "流言", maxFragments: 4, color: "#4a4a4a",
    portrait: assetUrl("images/characters/zhouwen.jpg"),
    quote: "我只提供选择，你信什么，关我什么事。",
    desc: "通过网络传播信息，流言一旦发布会自主传播、变异、放大。",
    skills: [
      { key: "spread_rumor", name: "散布流言", type: "主动", rankReq: 1, cost: 2, desc: "指定玩家须展示1张指定类型手牌，否则受到1段伤害。" },
      { key: "rumor_amp", name: "流言放大", type: "触发式被动", rankReq: 3, cost: 1, desc: "使用策略牌时可额外消耗1段篇幅，使该牌额外指定1个目标。" },
    ],
  },
  {
    id: 9, name: "崔攸", ability: "藏锋", maxFragments: 4, color: "#3b3b6b",
    portrait: assetUrl("images/characters/cuiyou.jpg"),
    quote: "有些事，不是忘了，而是我还没打算讲出来。",
    desc: "将一次攻击藏入叙事，在任意未来时刻释放，释放时威力不减。",
    skills: [
      { key: "hide_edge", name: "藏锋", type: "主动", rankReq: 1, cost: 1, desc: "将1张笔伐暗置储存，最多储存1张。" },
      { key: "edge_release", name: "锋芒乍现", type: "主动", rankReq: 2, cost: 0, desc: "释放储存的笔伐，无法被留白抵消，每回合限1次。" },
    ],
  },
  {
    id: 10, name: "韩魏", ability: "怀古", maxFragments: 4, color: "#7a5f27",
    portrait: assetUrl("images/characters/hanwei.jpg"),
    quote: "我从过去中来，却不属于任何时代。",
    desc: "回溯历史，感知或重现某地的历史场景，唤醒沉睡的古老力量。",
    skills: [
      { key: "retrospect", name: "回溯", type: "主动", rankReq: 1, cost: 1, desc: "查看牌堆顶3张牌，以任意顺序放回。" },
      { key: "awaken_scroll", name: "唤醒古卷", type: "主动", rankReq: 3, cost: 1, desc: "从弃牌堆中取1张策略牌加入手牌。" },
    ],
  },
  {
    id: 11, name: "齐仇", ability: "裁纸", maxFragments: 4, color: "#6b2f2f",
    portrait: assetUrl("images/characters/qichou.jpg"),
    quote: "裁纸，断万物之联。连接即是枷锁。",
    desc: "切断两个叙事之间的任何联系，被切断的联系难以恢复。",
    skills: [
      { key: "cut_link", name: "断联", type: "主动", rankReq: 1, cost: 1, desc: "弃置指定玩家的1件畸变物并摸1张牌。" },
      { key: "sever", name: "裁断", type: "主动", rankReq: 3, cost: 2, desc: "指定2名玩家，直到你的下回合开始他们不能互相成为目标。" },
    ],
  },
  {
    id: 12, name: "林休", ability: "天眷", maxFragments: 4, color: "#c9a24b",
    portrait: assetUrl("images/characters/linxiu.jpg"),
    quote: "我从未选择命运，是命运选择了将我遗忘。",
    desc: "被动好运，拥有者会不自觉地获得好运与眷顾。",
    skills: [
      { key: "heaven_luck", name: "天眷好运", type: "被动", rankReq: 1, cost: 0, desc: "每回合限1次可重新判定；每回合限1次摸牌可多摸1张。" },
      { key: "pray_luck", name: "祈求天眷", type: "主动", rankReq: 2, cost: 1, desc: "摸1张牌，若为残墨则额外恢复1段篇幅并再摸1张。" },
    ],
  },
  {
    id: 13, name: "齐凌云", ability: "天命", maxFragments: 4, color: "#3f5f7a",
    portrait: assetUrl("images/characters/qilingyun.jpg"),
    quote: "我不窥天命，天命也从不放过窥视我的人。",
    desc: "感知并干预事件潜藏的必然性，不改变结果，只调整路径。",
    skills: [
      { key: "fate_predict", name: "天命预判", type: "主动", rankReq: 2, cost: 1, desc: "预测指定玩家下回合使用的第1张牌类型，猜中则其受到2段伤害。" },
      { key: "fate_intervene", name: "命运干预", type: "被动", rankReq: 1, cost: 0, desc: "每回合限1次抵消1段伤害，每局限3次。" },
    ],
  },
  {
    id: 14, name: "苏言", ability: "盲签", maxFragments: 4, color: "#5c4a7a",
    portrait: assetUrl("images/characters/suyan.jpg"),
    quote: "签下的不是名字，是你未曾预见的命运。",
    desc: "让他人在不知情的情况下进入抽签状态，结果未知。",
    skills: [
      { key: "blind_sign", name: "盲签", type: "主动", rankReq: 1, cost: 1, desc: "指定玩家摸1张牌并展示，笔伐须对最近玩家使用，其他牌归你所有。" },
      { key: "fate_draw", name: "命运抽签", type: "主动", rankReq: 3, cost: 1, desc: "所有其他玩家各摸1张并展示，摸到基本牌者受到1段伤害。" },
    ],
  },
  {
    id: 15, name: "叶寻", ability: "万影", maxFragments: 4, color: "#2f2f2f",
    portrait: assetUrl("images/characters/yexun.jpg"),
    quote: "我从不寻找影子，它们自愿为我记住一切。",
    desc: "制造多个自己的影子分身，影子并非实体复制品，而是记忆的投射。",
    skills: [
      { key: "memory_project", name: "记忆投射", type: "主动", rankReq: 1, cost: 1, desc: "查看指定玩家的所有手牌。" },
      { key: "shadow_clone", name: "万影分身", type: "主动", rankReq: 3, cost: 2, desc: "创建1个拥有2段篇幅的分身，可将伤害转移给它承担。" },
    ],
  },
  {
    id: 16, name: "宋凉", ability: "嫁衣", maxFragments: 5, color: "#7a2f4f",
    portrait: assetUrl("images/characters/songliang.jpg"),
    quote: "嫁衣织就，穿的人却未必是我。",
    desc: "将自身代价转嫁给替身或傀儡承担。",
    skills: [
      { key: "cost_transfer", name: "代价转嫁", type: "触发式被动", rankReq: 1, cost: 1, desc: "受到伤害时可消耗1段篇幅将伤害转移给距离1以内的另一玩家，每回合限1次。" },
      { key: "puppet", name: "替身傀儡", type: "主动", rankReq: 3, cost: 2, desc: "指定1名距离1以内玩家，直到你的下回合开始，你受到的伤害由其承担。" },
    ],
  },
  {
    id: 17, name: "陈鹤", ability: "画押", maxFragments: 4, color: "#8a6d2f",
    portrait: assetUrl("images/characters/chenhe.jpg"),
    quote: "画押落笔，契约已成，天地为证。",
    desc: "强制目标在契约上签字，让普通契约获得叙事层面的强制力。",
    skills: [
      { key: "sign_seal", name: "画押", type: "主动", rankReq: 1, cost: 1, desc: "指定玩家须交给你1张手牌（由其选择）。" },
      { key: "breach_penalty", name: "违约之罚", type: "被动", rankReq: 2, cost: 0, desc: "每回合限1次，破题成功抵消策略牌后，使用者受到1段伤害。" },
    ],
  },
  {
    id: 18, name: "付流", ability: "回音", maxFragments: 4, color: "#3f7a6b",
    portrait: assetUrl("images/characters/fuliu.jpg"),
    quote: "刚刚发生的，只是我现在的回声。",
    desc: "复制刚发生的叙事效果，威力减半，高阶可复制更早的效果。",
    skills: [
      { key: "narrative_echo", name: "叙事回音", type: "主动", rankReq: 2, cost: 1, desc: "复制本回合上一张被打出的策略牌，效果由你重新指定目标。" },
      { key: "echo_strike", name: "回响连击", type: "触发式被动", rankReq: 1, cost: 1, desc: "使用笔伐后可额外消耗1段篇幅再使用1次笔伐，每回合限1次。" },
    ],
  },
  {
    id: 19, name: "吕柒", ability: "千面", maxFragments: 4, color: "#7a3f6b",
    portrait: assetUrl("images/characters/lvqi.jpg"),
    quote: "我不是在模仿你，我是在成为你，同时超越你。",
    desc: "改变外貌，也可以完全变成另一个人，包括记忆甚至部分能力。",
    skills: [
      { key: "disguise", name: "伪装", type: "主动", rankReq: 1, cost: 1, desc: "直到你的下回合开始，其他玩家无法用策略牌指定你为目标。" },
      { key: "steal_power", name: "千面窃能", type: "终极", rankReq: 4, cost: 2, desc: "选择1名已淘汰角色的1个技能，临时获得并使用1次，每局限2次。" },
    ],
  },
  {
    id: 20, name: "凌渊", ability: "祸水", maxFragments: 4, color: "#2f3f7a",
    portrait: assetUrl("images/characters/lingyuan.jpg"),
    quote: "你的泥沼，是我最隐秘的渴望。",
    desc: "将厄运、灾难、不幸的叙事转移或引发，效果往往不可控。",
    skills: [
      { key: "misfortune", name: "祸水东引", type: "主动", rankReq: 2, cost: 1, desc: "指定1名玩家受到2段伤害，你受到1段伤害。" },
      { key: "curse_transfer", name: "厄运转移", type: "主动", rankReq: 1, cost: 1, desc: "将你身上的1个负面效果转移给另1名距离1以内的玩家。" },
    ],
  },
  {
    id: 21, name: "李汐", ability: "红尘", maxFragments: 4, color: "#a02f5c",
    portrait: assetUrl("images/characters/lixi.jpg"),
    quote: "红尘万丈，谁不是执迷不悟。",
    desc: "与情感、欲望、执念相关，可放大或缩小目标情感，植入欲望或切断执念。",
    skills: [
      { key: "obsession", name: "执念植入", type: "主动", rankReq: 1, cost: 1, desc: "指定1名玩家，其下回合不能使用某种牌型。" },
      { key: "worldly_echo", name: "红尘余波", type: "被动", rankReq: 3, cost: 0, desc: "篇幅为1时，所有技能消耗降为0，且笔伐造成2段伤害。" },
    ],
  },
  {
    id: 22, name: "周也", ability: "穿肠", maxFragments: 5, color: "#7a1f1f",
    portrait: assetUrl("images/characters/zhouye.jpg"),
    quote: "穿肠之痛，不在于刃，在于无法愈合。",
    desc: "与伤害、痛苦、穿透相关，可让攻击穿透防御、痛苦加倍或持续蔓延。",
    skills: [
      { key: "piercing_blade", name: "穿肠之刃", type: "主动", rankReq: 2, cost: 1, desc: "你的下1张笔伐无法被留白抵消。" },
      { key: "spreading_pain", name: "痛苦蔓延", type: "被动", rankReq: 1, cost: 0, desc: "造成伤害后，受击者下回合开始时不进行自然恢复。" },
    ],
  },
  {
    id: 23, name: "楚菁", ability: "不朽", maxFragments: 7, color: "#c9a24b",
    portrait: assetUrl("images/characters/chujing.jpg"),
    quote: "不朽不是永恒，而是拒绝被遗忘。",
    desc: "不会死亡，也不会被叙事修改或删除，高阶几乎无法被任何手段消灭。",
    skills: [
      { key: "immortal_body", name: "不朽之躯", type: "被动", rankReq: 1, cost: 0, desc: "每局限1次，篇幅将降至0时保留为1段。" },
      { key: "seal_guard", name: "封印自守", type: "终极", rankReq: 4, cost: 3, desc: "直到你的下回合开始，你不能被任何牌指定为目标。" },
    ],
  },
  {
    id: 24, name: "赵裘", ability: "烬余", maxFragments: 5, color: "#a04f1f",
    portrait: assetUrl("images/characters/zhaoqiu.jpg"),
    quote: "故事从不死亡，它只会被我用完。",
    desc: "濒死时爆发剩余叙事能量，随后陷入沉睡，每次使用永久损失部分篇幅。",
    skills: [
      { key: "burnout", name: "烬余爆发", type: "主动", rankReq: 1, cost: 0, desc: "篇幅为1时，可恢复至3段，但永久-1点最大篇幅，每局限2次。" },
      { key: "ember_power", name: "燃烬之力", type: "被动", rankReq: 2, cost: 0, desc: "篇幅≤2时，笔伐造成2段伤害。" },
    ],
  },
];

export function getCharacter(id: number) {
  return CHARACTERS.find((c) => c.id === id)!;
}
