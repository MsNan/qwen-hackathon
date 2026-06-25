/**
 * 编排器 —— 把多个 Agent 串成一条"创作工业化"流水线，并带记忆。
 * 这就是赛道2 要的 "orchestrate creative content at scale"。
 */
import { AGENTS } from './agents/index.js';
import { runtimeBrief, scoreFromChecks } from './agents/methodology.js';
import { complete } from './qwen.js';

/** 运行单个 Agent */
export async function runAgent(name, userInput, memory = {}, overrides = {}) {
  const agent = AGENTS[name];
  if (!agent) throw new Error(`未知 Agent: ${name}`);

  // 记忆注入：把已确定的世界观/人物/前情拼进上下文，保证跨步一致
  const memoryBlock = formatMemory(memory);
  const system = memoryBlock ? `${agent.system}\n\n[已确定的创作记忆]\n${memoryBlock}` : agent.system;

  const raw = await complete(system, userInput, {
    model: agent.model,
    temperature: overrides.temperature ?? agent.temperature,
    json: agent.json,
  });

  return agent.json ? safeJson(raw) : raw;
}

/**
 * 对一章正文跑「质检 → 不过则按意见重写 → 复检」自我修复闭环。
 * 返回 { chapter(终稿), draft(初稿), qcHistory }。onStep 可选，用于流式。
 */
// 跑一次质检：Agent 只检测硬伤，分数由 scoreFromChecks 按固定权重算出（可追溯）
async function runQC(text, memory) {
  const raw = await runAgent('qc', text, memory);
  const { score, verdict, deduct, breakdown } = scoreFromChecks(raw?.checks || []);
  return {
    score, verdict, deduct, breakdown,
    flags: breakdown.map((b) => ({ name: b.name, severity: b.severity, penalty: b.penalty, evidence: b.evidence, fix: b.fix })),
    topFix: breakdown[0]?.fix || '',
  };
}

async function qcAndRepair(chapterText, memory, onStep = () => {}) {
  onStep({ step: 'qc', status: 'running', label: AGENTS.qc.label });
  let qc = await runQC(chapterText, memory);
  qc.attempt = 1;
  const qcHistory = [qc];
  onStep({ step: 'qc', status: 'done', data: qc });

  let chapter = chapterText;
  if (qc.verdict !== '过' && qc.flags.length) {
    const advice = qc.flags.map((f) => `【${f.name}】${f.fix}`).join('\n');
    onStep({ step: 'chapter', status: 'running', label: AGENTS.chapter.label + '（按质检意见重写）' });
    chapter = await runAgent(
      'chapter',
      `下面是初稿与签约编辑的修改意见。请据此重写本章：必须逐条消除每个硬伤——尤其把主角从"观察/被动反应"改为"用主动选择直接造成关键转折"。保留钩子与章末断章，强化戏剧张力。只输出重写后的正文：\n\n[修改意见]\n${advice}\n\n[初稿]\n${chapterText}`,
      memory,
      { temperature: 0.6 }
    );
    onStep({ step: 'chapter', status: 'done', data: chapter, rewritten: true });
    onStep({ step: 'qc', status: 'running', label: AGENTS.qc.label + '（复检）' });
    qc = await runQC(chapter, memory);
    qc.attempt = 2;
    qcHistory.push(qc);
    onStep({ step: 'qc', status: 'done', data: qc });
  }
  return { chapter, draft: chapterText, qcHistory };
}

/** 全流程编排：创意 → 选题 → 大纲 → 首章(质检自我修复) → 首章短剧分集 */
export async function runPipeline(idea, opts = {}, onStep = () => {}) {
  const { genre, length } = opts;
  const memory = { idea, genre, length };

  onStep({ step: 'hook', status: 'running', label: AGENTS.hook.label });
  const hook = await runAgent('hook', `创意：${idea}`, memory);
  memory.hook = hook;
  onStep({ step: 'hook', status: 'done', data: hook });

  onStep({ step: 'outline', status: 'running', label: AGENTS.outline.label });
  const outline = await runAgent('outline', `选题：${JSON.stringify(hook)}`, memory);
  memory.outline = outline;
  onStep({ step: 'outline', status: 'done', data: outline });

  const meta = outline?.chapters?.[0] || { no: 1, title: '第一章', beat: '开篇钩子' };
  onStep({ step: 'chapter', status: 'running', label: AGENTS.chapter.label });
  const draft = await runAgent('chapter', `写第 ${meta.no} 章《${meta.title}》，本章作用：${meta.beat}`, memory);
  onStep({ step: 'chapter', status: 'done', data: draft });

  const { chapter, qcHistory } = await qcAndRepair(draft, memory, onStep);
  memory.chapter = chapter;

  onStep({ step: 'screenplay', status: 'running', label: AGENTS.screenplay.label });
  const episode = await adaptEpisode({ hook, outline, genre, length, chapter, chapterNo: meta.no, chapterTitle: meta.title });
  onStep({ step: 'screenplay', status: 'done', data: episode });

  return {
    idea, genre, length, hook, outline,
    firstChapter: { no: meta.no, title: meta.title, draft, chapter, qcHistory },
    firstEpisode: episode,
  };
}

function formatMemory(memory) {
  const parts = [];
  const rt = runtimeBrief(memory.genre, memory.length);
  if (rt) parts.push(rt);
  if (memory.idea) parts.push(`原始创意：${memory.idea}`);
  if (memory.hook) parts.push(`选题：${memory.hook.oneLineHook || ''}（题材：${memory.hook.genre || ''}）`);
  if (memory.outline?.logline) parts.push(`故事梗概：${memory.outline.logline}`);
  if (memory.prevTail) parts.push(`上一章结尾：${memory.prevTail}`);
  return parts.join('\n');
}

/** 续写下一章（含质检自我修复）。前端持有 state 回传 chapters[] 文本数组。 */
export async function writeNextChapter({ hook, outline, genre, length, chapters = [] }) {
  const memory = { genre, length, hook, outline };
  const nextIdx = chapters.length;
  const meta = outline?.chapters?.[nextIdx] || { no: nextIdx + 1, title: `第${nextIdx + 1}章`, beat: '推进主线' };
  memory.prevTail = (chapters[chapters.length - 1] || '').slice(-400);
  const draft = await runAgent(
    'chapter',
    `这是连载的第 ${meta.no} 章《${meta.title}》，本章作用：${meta.beat}。承接上一章结尾，自然衔接、不重复前文，写出本章正文。`,
    memory,
    { temperature: 0.85 }
  );
  const { chapter, qcHistory } = await qcAndRepair(draft, memory);
  return { index: nextIdx, no: meta.no, title: meta.title, draft, chapter, qcHistory };
}

/** 按"人类编辑的修改意见"重写指定章节（含复检）。 */
export async function rewriteChapter({ hook, outline, genre, length, chapters = [], index = 0, instruction = '' }) {
  const memory = { genre, length, hook, outline };
  if (index > 0) memory.prevTail = (chapters[index - 1] || '').slice(-400);
  const original = chapters[index] || '';
  const meta = outline?.chapters?.[index] || { no: index + 1, title: `第${index + 1}章` };
  const draft = await runAgent(
    'chapter',
    `请按作者的修改意见重写第 ${meta.no} 章，保留钩子与断章，只输出重写后的正文：\n\n[作者意见]\n${instruction}\n\n[原文]\n${original}`,
    memory,
    { temperature: 0.7 }
  );
  const { chapter, qcHistory } = await qcAndRepair(draft, memory);
  return { index, no: meta.no, title: meta.title, chapter, qcHistory };
}

/** 把单独一章改编成一集短剧（逐集累加，不覆盖旧集）。 */
export async function adaptEpisode({ hook, outline, genre, length, chapter, chapterNo, chapterTitle }) {
  const memory = { genre, length, hook, outline };
  const input = `把下面这一章改编成竖屏微短剧的「一集」（对应第 ${chapterNo} 章《${chapterTitle || ''}》），保留本章的钩子与反转，节奏适配 1-2 分钟单集：\n\n${chapter}`;
  const ep = await runAgent('screenplay', input, memory);
  return { chapterNo, chapterTitle, ...ep };
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    return { _raw: raw, _parseError: true };
  }
}
