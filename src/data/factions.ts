import { assetUrl } from "../utils/assetUrl";
export type FactionCategory = "ORDER" | "SHADOW" | "SEEKER" | "TRANSCENDENT" | "SANCTUARY" | "COURIER";

export const CATEGORY_META: Record<FactionCategory, { label: string; color: string; icon: string }> = {
  ORDER: { label: "守序", color: "#9c7a2e", icon: "scales" },
  SHADOW: { label: "暗影", color: "#6b2fae", icon: "moon" },
  SEEKER: { label: "求知", color: "#2f6d8a", icon: "sun" },
  TRANSCENDENT: { label: "超然", color: "#7a7a7a", icon: "star" },
  SANCTUARY: { label: "庇护", color: "#2f8a5c", icon: "ankh" },
  COURIER: { label: "传递", color: "#a04f1f", icon: "scroll" },
};

export interface FactionDef {
  id: number;
  name: string;
  category: FactionCategory;
  quote: string;
  intro: string;
  win: string;
  image: string;
}

export const FACTIONS: FactionDef[] = [
  // ORDER 守序
  { id: 1, name: "灰塔", category: "ORDER", image: assetUrl("images/factions/huita.jpg"), quote: "塔尖看见的风暴，塔底的人还在晒太阳。", intro: "守望和监视叙事异常，预警危险；囚禁危险的叙事者或封印危险的畸变物。", win: "淘汰2名其他玩家。" },
  { id: 2, name: "白纸城", category: "ORDER", image: assetUrl("images/factions/baizhicheng.jpg"), quote: "白纸之上，不问来处。", intro: "任何势力不得在此动武的中立地带，新觉醒的叙事者可在此寻求庇护。", win: "存活到自己的第8回合结束。" },
  { id: 3, name: "镜湖议会", category: "ORDER", image: assetUrl("images/factions/jinghuyihui.jpg"), quote: "湖面平静时，才能看见自己的倒影。", intro: "由多个势力代表组成的议会，试图通过协商解决势力间的冲突。", win: "不以自己为使用者打出笔伐，且成为最后存活的2人之一。" },
  { id: 4, name: "长夜档案馆", category: "ORDER", image: assetUrl("images/factions/changye.jpg"), quote: "长夜漫漫，档案是唯一的灯火。", intro: "专门保存重叙日前后的历史文献，试图还原真实的历史。", win: "通过篡取获得，或累计装备获得3件畸变物。" },
  // SHADOW 暗影
  { id: 5, name: "焚稿人", category: "SHADOW", image: assetUrl("images/factions/fengaoren.jpg"), quote: "有些火焰不是为了温暖，而是为了净化。", intro: "专门销毁和封印危险的叙事片段和畸变物，行事激进。", win: "淘汰当前篇幅最高的其他玩家。" },
  { id: 6, name: "第十三书签", category: "SHADOW", image: assetUrl("images/factions/dishisanshuqian.jpg"), quote: "第十三页的书签，总是翻到最不该看的那一章。", intro: "标记世界叙事中的关键节点和人物，也接受暗杀委托。", win: "淘汰1名玩家后存活到自己的下一回合结束。" },
  { id: 7, name: "黑帆书库", category: "SHADOW", image: assetUrl("images/factions/heifanshuku.jpg"), quote: "知识不问出处，只问谁能读懂。", intro: "像海盗一样掠夺和收集叙事知识，收藏大量禁书和秘密知识。", win: "累计从其他玩家处获得5张手牌或畸变物。" },
  { id: 8, name: "无名海岸", category: "SHADOW", image: assetUrl("images/factions/wuminghaian.jpg"), quote: "名字是别人给的，海岸是自己选的。", intro: "收养流落在外或被通缉的叙事者，不问来处不问过往。", win: "淘汰守序阵营的1名玩家。" },
  // SEEKER 求知
  { id: 9, name: "远星", category: "SEEKER", image: assetUrl("images/factions/yuanxing.jpg"), quote: "星星之所以远，是因为有人还没走到。", intro: "致力于探索叙事边界和未知领域的组织。", win: "叙事等级达到四阶时仍存活。" },
  { id: 10, name: "旧日读书会", category: "SEEKER", image: assetUrl("images/factions/jiuridushuhui.jpg"), quote: "旧书重读，不是为了怀旧，是为了找回丢失的页码。", intro: "研究古老叙事，试图恢复旧世界。", win: "同时装备3件畸变物。" },
  { id: 11, name: "锈字修道院", category: "SEEKER", image: assetUrl("images/factions/xiuzixiudao.jpg"), quote: "锈迹是时间的批注，修道院是时间的编辑。", intro: "守护古老叙事，修复破损叙事遗迹和文本。", win: "累计恢复篇幅达到15段。" },
  { id: 12, name: "纸鸢社", category: "SEEKER", image: assetUrl("images/factions/zhiyuanshe.jpg"), quote: "飞得最高的纸鸢，看到的风景也最孤独。", intro: "像风筝一样收集和传递高空远方的信息。", win: "查看过所有其他玩家的全部手牌至少各1次。" },
  // TRANSCENDENT 超然
  { id: 13, name: "白烛修会", category: "TRANSCENDENT", image: assetUrl("images/factions/baizhuxiuhui.jpg"), quote: "烛光摇曳时，叙事在倾听。", intro: "基于传统宗教但融入叙事元素，认为叙事是神圣的。", win: "全程篇幅不低于初始最大篇幅的50%，且成为最后存活的2人之一。" },
  { id: 14, name: "留白", category: "TRANSCENDENT", image: assetUrl("images/factions/liubai.jpg"), quote: "未写之处，自有天地。", intro: "主张在叙事中保持适度距离，不过度干预世界。", win: "不主动使用角色技能，存活到最后2人。" },
  { id: 15, name: "冬夜学派", category: "TRANSCENDENT", image: assetUrl("images/factions/dongyexuepai.jpg"), quote: "冬夜最冷的时候，故事才刚开始。", intro: "研究寒冷与死亡叙事，认为死亡是叙事的另一种形式。", win: "淘汰1名玩家，且淘汰时你的篇幅不低于最大篇幅的75%。" },
  { id: 16, name: "墨冢", category: "TRANSCENDENT", image: assetUrl("images/factions/mozhong.jpg"), quote: "墨染的故事终有尽头，但纸张会记住每一笔。", intro: "为死去的叙事者举行特殊葬礼，处理其遗留篇幅。", win: "拾取2个叙事残片。" },
  // SANCTUARY 庇护
  { id: 17, name: "第七灯塔", category: "SANCTUARY", image: assetUrl("images/factions/diqidengta.jpg"), quote: "灯塔不是为了照亮整片海，是为了让迷途者看见方向。", intro: "引导迷失在叙事副本或畸变区域中的人，守望预警叙事灾难。", win: "对2名被淘汰的玩家均造成过至少1段篇幅伤害。" },
  { id: 18, name: "迷途", category: "SANCTUARY", image: assetUrl("images/factions/mitu.jpg"), quote: "迷途的人，往往比认路的人看得更清。", intro: "由迷失者、流浪者组成的互助组织。", win: "从2段及以下篇幅恢复到满篇幅2次。" },
  { id: 19, name: "失语者同盟", category: "SANCTUARY", image: assetUrl("images/factions/shiyuzhe.jpg"), quote: "失去声音的人，最懂得沉默的重量。", intro: "失去叙事能力的叙事者组成的互助组织。", win: "不主动使用技能且不装备畸变物，存活到最后2人。" },
  // COURIER 传递
  { id: 20, name: "渡鸦邮局", category: "COURIER", image: assetUrl("images/factions/duyayouju.jpg"), quote: "渡鸦从不迷路，因为它们飞的路线不在地图上。", intro: "使用特殊训练的渡鸦作为信使，在叙事层面飞行。", win: "累计从牌堆摸牌数达到20张。" },
  { id: 21, name: "纸船会", category: "COURIER", image: assetUrl("images/factions/zhichuanhui.jpg"), quote: "纸船载不动逝者，但能载动思念。", intro: "用纸船纪念被归档的逝者，寻找废稿真相。", win: "直接淘汰1名玩家时，你的篇幅不低于最大篇幅的50%。" },
  { id: 22, name: "乌墨海", category: "COURIER", image: assetUrl("images/factions/wumohai.jpg"), quote: "墨色的海洋下，藏着比陆地更古老的故事。", intro: "以海洋为基地，成员多为水相关能力者。", win: "全程不装备畸变物，且存活到最后2人。" },
];

export function getFactionsByCategory(cat: FactionCategory) {
  return FACTIONS.filter((f) => f.category === cat);
}
