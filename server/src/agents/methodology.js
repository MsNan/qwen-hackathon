/**
 * 创作方法论规则库 —— 本项目的护城河。
 *
 * 这里把"真实签约作者的商业化创作方法论"结构化成机器可用的规则，
 * 注入到每个 Agent 的系统提示与质检环节。套壳工具没有这一层，
 * 所以它们的产出"通用但不懂行"，而我们的产出符合签约级商业标准。
 *
 * 作者(烬渊行纪)后续可在此持续补充/校准，规则越细，护城河越深。
 */

// 题材"甜区"：商业化体量与节奏的经验区间
export const SWEET_SPOT = {
  // 知乎盐选中短篇的付费转化甜区体量（字）
  yanxuanWords: { min: 16000, max: 20000, ideal: 18000 },
  // 单章建议体量（网文连载）
  chapterWords: { min: 2000, max: 3000 },
  // 付费墙建议位置（占全文比例）：钩子拉满后断章
  paywallAt: 0.18,
};

// 钩子工程：标题与开篇的硬规则
export const HOOK_RULES = {
  titleMaxLen: 15, // 钩子标题 ≤15 字
  titlePrinciples: [
    '前 6 字必须制造信息差或反常识，让人想点开',
    '避免抽象/文艺/概念词，用具体名词+动作+悬念',
    '可用"身份反差 / 倒计时 / 禁忌 / 未解之谜"四类钩子',
  ],
  openingPrinciples: [
    '前 300 字内抛出核心悬念或异常事件，不做背景铺垫',
    '主角必须"入场即行动"，不能旁观',
    '第一个钩子在首章结尾断章，制造追读欲',
  ],
};

// 结构方法论：双线 + 反转
export const STRUCTURE_RULES = {
  dualLine: {
    desc: '双线结构：明线(当下事件推进) + 暗线(过去真相/隐藏动机)，交替释放信息',
    requirement: '两条线必须在高潮处合流，互为因果，不能各走各的',
  },
  reversal: {
    // "物证扣死的再反转"：反转必须有前文埋设的实证支撑，不能凭空翻案
    desc: '物证扣死的再反转：每一次反转都要有前文已出现、读者可复盘的物证/细节支撑',
    requirement: '反转前必须埋"可回溯的实证"，让读者重读时拍案——而非作者强行翻案',
  },
  protectiveLie: {
    desc: '保护性说谎反转：关键角色的"谎言"动机是守护而非作恶，揭穿时完成情感升华',
  },
};

// 拒稿硬伤清单：质检 Agent 据此逐条扣分并给修改建议
export const REJECTION_FLAGS = [
  {
    key: 'weak_healing',
    name: '淡治愈',
    detect: '冲突轻、情绪平、靠氛围和小确幸收尾，缺乏强戏剧张力',
    fix: '加一个"不可调和的核心冲突"，把治愈建立在真实代价之上',
  },
  {
    key: 'anticlimax_dissolved',
    name: '消解反高潮',
    detect: '在该爆发的高潮处用回避/和解/淡化把张力消解掉',
    fix: '高潮处正面硬碰，先把矛盾推到顶点再给解法，不提前泄气',
  },
  {
    key: 'bystander_protagonist',
    name: '旁观主角',
    detect: '主角主要在观察/被动反应，关键转折由配角或巧合推动',
    fix: '让主角的主动选择直接造成关键转折，承担后果',
  },
  {
    key: 'symbolic_character',
    name: '符号化角色',
    detect: '角色只承担功能、无矛盾欲望，像工具人/标签',
    fix: '给角色一个"自相矛盾的欲望"和一个具体到能被记住的行为细节',
  },
  {
    key: 'too_short',
    name: '体量偏短',
    detect: '低于商业化甜区体量，付费感不足',
    fix: `扩到 ${SWEET_SPOT.yanxuanWords.ideal} 字甜区：增信息差与支线，而非注水`,
  },
];

// 拼装成可注入系统提示的文本块
export function methodologyBrief() {
  const flags = REJECTION_FLAGS.map(
    (f) => `  - 【${f.name}】症状:${f.detect}；救法:${f.fix}`
  ).join('\n');
  return `你内置一位资深签约作者的商业化创作方法论，必须严格遵循：

[钩子工程]
  - 标题 ≤${HOOK_RULES.titleMaxLen} 字，${HOOK_RULES.titlePrinciples.join('；')}
  - 开篇：${HOOK_RULES.openingPrinciples.join('；')}

[结构]
  - ${STRUCTURE_RULES.dualLine.desc}（${STRUCTURE_RULES.dualLine.requirement}）
  - ${STRUCTURE_RULES.reversal.desc}（${STRUCTURE_RULES.reversal.requirement}）
  - ${STRUCTURE_RULES.protectiveLie.desc}

[体量甜区]
  - 中短篇商业化甜区约 ${SWEET_SPOT.yanxuanWords.ideal} 字；付费墙置于全文约 ${Math.round(
    SWEET_SPOT.paywallAt * 100
  )}% 处的强断章。

[必须规避的拒稿硬伤]
${flags}`;
}
