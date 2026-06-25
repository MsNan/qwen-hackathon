/**
 * 烬渊·创作工坊 后端服务。
 * - /api/agent  单个 Agent 调用（分步交互用）
 * - /api/pipeline  全流程 SSE 流式编排（demo 主场景）
 * - /api/health  健康检查
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { runAgent, runPipeline, writeNextChapter, adaptDrama } from './orchestrator.js';
import { AGENTS } from './agents/index.js';
import { GENRES, LENGTHS } from './agents/methodology.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 生产环境：后端直接托管前端打包产物（单服务部署）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, '../../web/dist');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, agents: Object.keys(AGENTS), hasKey: !!process.env.QWEN_API_KEY });
});

// 可选项：题材 + 篇幅（给前端渲染选择器）
app.get('/api/options', (_req, res) => {
  res.json({ genres: Object.keys(GENRES), lengths: Object.keys(LENGTHS) });
});

// 续写下一章
app.post('/api/next-chapter', async (req, res) => {
  try {
    res.json({ ok: true, data: await writeNextChapter(req.body || {}) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 全篇改编短剧
app.post('/api/adapt-drama', async (req, res) => {
  try {
    res.json({ ok: true, data: await adaptDrama(req.body || {}) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 单个 Agent
app.post('/api/agent', async (req, res) => {
  try {
    const { name, input, memory } = req.body || {};
    const data = await runAgent(name, input, memory || {});
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 全流程：SSE 流式推送每一步
app.post('/api/pipeline', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, payload) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

  try {
    const { idea, genre, length } = req.body || {};
    if (!idea) throw new Error('缺少 idea');
    const result = await runPipeline(idea, { genre, length }, (step) => send('step', step));
    send('done', result);
  } catch (e) {
    send('error', { error: String(e.message || e) });
  } finally {
    res.end();
  }
});

// 托管前端静态资源 + SPA 兜底（仅当已构建 web/dist 时生效）
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`✦ 创作工坊已就绪 http://localhost:${port}`));
