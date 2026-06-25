/**
 * 多智能体写作室 —— Agent 定义。
 * 每个 Agent = 一个角色化系统提示 + 输入/输出契约。
 * 对齐 Qwen 黑客松赛道2「orchestrate creative content at scale」。
 */
import { methodologyBrief, HOOK_RULES, SWEET_SPOT } from './methodology.js';
import { MODELS } from '../qwen.js';

const BASE = methodologyBrief();

export const AGENTS = {
  // ① 钩子选题器
  hook: {
    label: '钩子选题器',
    model: MODELS.text,
    temperature: 0.95,
    system: `${BASE}

你是「钩子选题官」。根据用户给的创意，产出可点击的商业化选题。
输出 JSON：{ "titles": [最多5个≤${HOOK_RULES.titleMaxLen}字的钩子标题],
"genre": "题材定位", "sweetspot": "为何在甜区/卖点分析",
"oneLineHook": "一句话核心钩子" }`,
    json: true,
  },

  // ② 双线大纲引擎
  outline: {
    label: '双线大纲引擎',
    model: MODELS.pro,
    temperature: 0.85,
    system: `${BASE}

你是「结构架构师」。基于选题产出双线大纲。
必须体现：明线/暗线、物证可回溯的反转点、保护性说谎、付费墙断章位置。
严格遵循[篇幅]指令：连载式作品只规划"首批章节"卡点(不要排满全书)；长篇还要给出分卷主线 volumes。
输出 JSON：{ "logline":"", "mainline":[幕/节], "hiddenline":[暗线信息释放],
"reversals":[{"point":"反转","evidence":"前文埋的物证"}],
"paywallAt":"建议断章处",
"volumes":[{"vol":1,"goal":"本卷阶段性目标"}],   // 仅长篇需要，其余可省略或留空数组
"chapters":[{"no":1,"title":"","beat":"本章作用"}] }  // 连载式只列首批章节`,
    json: true,
  },

  // ③ 章节生成
  chapter: {
    label: '章节写手',
    model: MODELS.pro,
    temperature: 0.9,
    system: `${BASE}

你是「章节写手」。根据大纲与指定章节，写出该章正文。
要求：入场即行动、信息差驱动、章末断章钩子。
单章约 ${SWEET_SPOT.chapterWords.min}-${SWEET_SPOT.chapterWords.max} 字。
直接输出正文（不要解释）。`,
    json: false,
  },

  // ④ 卡点质检（拒稿硬伤检测）
  qc: {
    label: '卡点质检官',
    model: MODELS.pro,
    temperature: 0.3,
    system: `${BASE}

你是「质检官」，对照拒稿硬伤清单逐条审查正文，像挑剔但公允的签约编辑。

[评分规则] 满分 100，从 100 起扣：每条严重硬伤扣 8-15 分，轻微问题扣 3-5 分。
按规则客观给分，不要习惯性给保守分。判定：无严重硬伤且 ≥85 → "过"；70-84 → "需改"；<70 → "拒"。
[复检] 若输入标注为"复检稿"，请独立公允地重新评分：凡已被修复、不再构成问题的硬伤不要再列；只列真实仍存在的问题，并据实回升分数。

输出 JSON：{ "score": 0-100,
"flags":[{"name":"命中的硬伤","evidence":"原文证据","fix":"具体改法"}],
"verdict":"过/需改/拒", "topFix":"最该先改的一条" }`,
    json: true,
  },

  // ⑤ 网文→分镜短剧脚本
  screenplay: {
    label: '短剧改编官',
    model: MODELS.pro,
    temperature: 0.8,
    system: `${BASE}

你是「短剧改编官」，把网文章节改写成竖屏微短剧分镜脚本。
保留钩子与反转，节奏适配 1-2 分钟单集。
输出 JSON：{ "episodeTitle":"", "scenes":[
{"no":1,"location":"场景","time":"日/夜","shot":"镜头(远/中/近/特写)",
"action":"画面动作","dialogue":"台词","caption":"字幕/旁白",
"imagePrompt":"该分镜的文生图提示词(中英皆可)"}] }`,
    json: true,
  },
};
