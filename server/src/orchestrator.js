/**
 * 编排器 —— 把多个 Agent 串成一条"创作工业化"流水线，并带记忆。
 * 这就是赛道2 要的 "orchestrate creative content at scale"。
 */
import { AGENTS } from './agents/index.js';
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
 * 全流程编排：创意 → 选题 → 大纲 → 首章 → 质检 →（不过则重写一次）→ 短剧分镜
 * onStep 回调用于把每步进度实时推给前端。
 */
export async function runPipeline(idea, onStep = () => {}) {
  const memory = { idea };

  onStep({ step: 'hook', status: 'running', label: AGENTS.hook.label });
  const hook = await runAgent('hook', `创意：${idea}`, memory);
  memory.hook = hook;
  onStep({ step: 'hook', status: 'done', data: hook });

  onStep({ step: 'outline', status: 'running', label: AGENTS.outline.label });
  const outline = await runAgent('outline', `选题：${JSON.stringify(hook)}`, memory);
  memory.outline = outline;
  onStep({ step: 'outline', status: 'done', data: outline });

  const firstChap = outline?.chapters?.[0] || { no: 1, title: '第一章', beat: '开篇钩子' };
  onStep({ step: 'chapter', status: 'running', label: AGENTS.chapter.label });
  let chapter = await runAgent('chapter', `写第 ${firstChap.no} 章《${firstChap.title}》，本章作用：${firstChap.beat}`, memory);
  const draft = chapter; // 留存初稿，供 demo 展示"重写前后"
  onStep({ step: 'chapter', status: 'done', data: chapter });

  onStep({ step: 'qc', status: 'running', label: AGENTS.qc.label });
  let qc = await runAgent('qc', chapter, memory);
  qc.attempt = 1;
  const qcHistory = [qc];
  onStep({ step: 'qc', status: 'done', data: qc });

  // 质检不过则按全部硬伤意见重写一次（自我修复闭环）
  if (qc?.verdict && qc.verdict !== '过') {
    const advice = [qc.topFix, ...(qc.flags || []).map((f) => `【${f.name}】${f.fix}`)]
      .filter(Boolean)
      .join('\n');
    onStep({ step: 'chapter', status: 'running', label: AGENTS.chapter.label + '（按质检意见重写）' });
    chapter = await runAgent(
      'chapter',
      `下面是初稿与签约编辑的修改意见。请据此重写本章：必须逐条消除每个硬伤——尤其把主角从"观察/被动反应"改为"用主动选择直接造成关键转折"。保留钩子与章末断章，强化戏剧张力。只输出重写后的正文：\n\n[修改意见]\n${advice}\n\n[初稿]\n${chapter}`,
      memory,
      { temperature: 0.6 }
    );
    onStep({ step: 'chapter', status: 'done', data: chapter, rewritten: true });
    onStep({ step: 'qc', status: 'running', label: AGENTS.qc.label + '（复检）' });
    qc = await runAgent('qc', `【复检稿】请独立公允重新评分，已修复的硬伤不要再列：\n\n${chapter}`, memory);
    qc.attempt = 2;
    qcHistory.push(qc);
    onStep({ step: 'qc', status: 'done', data: qc });
  }
  memory.chapter = chapter;

  onStep({ step: 'screenplay', status: 'running', label: AGENTS.screenplay.label });
  const screenplay = await runAgent('screenplay', chapter, memory);
  onStep({ step: 'screenplay', status: 'done', data: screenplay });

  return { idea, hook, outline, draft, chapter, qc, qcHistory, screenplay };
}

function formatMemory(memory) {
  const parts = [];
  if (memory.idea) parts.push(`原始创意：${memory.idea}`);
  if (memory.hook) parts.push(`选题：${memory.hook.oneLineHook || ''}（题材：${memory.hook.genre || ''}）`);
  if (memory.outline?.logline) parts.push(`故事梗概：${memory.outline.logline}`);
  return parts.join('\n');
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
