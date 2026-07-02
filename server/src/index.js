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
import { runAgent, runPipeline, writeNextChapter, rewriteChapter, adaptEpisode, extractCast } from './orchestrator.js';
import {
  createClipTask, queryClipTask,
  createReferenceImageTask, createKeyframeTask, queryImageTask, createI2VTask,
} from './wan.js';
import { AGENTS } from './agents/index.js';
import { GENRES, LENGTHS } from './agents/methodology.js';
import { mirrorAsset, rateLimit, DATA_DIR } from './ops.js';
import { startAssembleJob, getAssembleJob } from './assemble.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 镜像资产静态服务(定妆图/视频下载到本地后从这里回发,规避 24h 过期)
app.use('/assets', express.static(DATA_DIR, { maxAge: '7d' }));

// 限流器:保护公网 Space 的额度(本地部署无此限制)
const limVideo = rateLimit('video', 40, 600);   // 视频最贵;放宽到可跑完一整集(15+镜)
const limImage = rateLimit('image', 80, 1200);
const limText = rateLimit('text', 20, 400);      // 全流程/选角(文本)

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

// 续写下一章（含质检自我修复）
app.post('/api/next-chapter', async (req, res) => {
  try {
    res.json({ ok: true, data: await writeNextChapter(req.body || {}) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 按作者意见重写指定章节（含复检）
app.post('/api/rewrite-chapter', async (req, res) => {
  try {
    res.json({ ok: true, data: await rewriteChapter(req.body || {}) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 把某一章改编成一集短剧（逐集累加）
app.post('/api/adapt-episode', async (req, res) => {
  try {
    res.json({ ok: true, data: await adaptEpisode(req.body || {}) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 短剧分镜 → Wan 文生视频(竖屏 5 秒)。提交拿 task_id,前端按 id 轮询。
app.post('/api/clip/start', limVideo, async (req, res) => {
  try {
    const { prompt, resolution, ratio, duration } = req.body || {};
    res.json({ ok: true, data: await createClipTask(prompt, { resolution, ratio, duration }) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/clip/status/:taskId', async (req, res) => {
  try {
    const data = await queryClipTask(req.params.taskId);
    if (data.videoUrl) data.videoUrl = await mirrorAsset(data.videoUrl, 'mp4'); // 镜像,规避24h过期
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 角色一致性:① 定妆图 ② 换场景关键帧 ③ 图片状态 ④ 关键帧→视频
app.post('/api/image/reference', limImage, async (req, res) => {
  try {
    res.json({ ok: true, data: await createReferenceImageTask((req.body || {}).desc) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/image/keyframe', limImage, async (req, res) => {
  try {
    const { refUrl, refUrls, sceneDesc } = req.body || {};
    res.json({ ok: true, data: await createKeyframeTask(refUrls || refUrl, sceneDesc) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 选角/定妆抽取：分镜 → 角色表(名字+定妆描述) + 每镜出场角色
app.post('/api/cast/extract', limText, async (req, res) => {
  try {
    const { scenes, context } = req.body || {};
    res.json({ ok: true, data: await extractCast({ scenes: scenes || [], context: context || '' }) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/image/status/:taskId', async (req, res) => {
  try {
    const data = await queryImageTask(req.params.taskId);
    if (data.imageUrl) data.imageUrl = await mirrorAsset(data.imageUrl, 'png'); // 镜像,规避24h过期
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/clip/i2v', limVideo, async (req, res) => {
  try {
    const { imgUrl, prompt, resolution, duration } = req.body || {};
    res.json({ ok: true, data: await createI2VTask(imgUrl, prompt, { resolution, duration }) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// 拼整集：把各分镜视频合成一条竖屏成片(烧字幕),异步任务
app.post('/api/episode/assemble', limText, async (req, res) => {
  try {
    const { items } = req.body || {};
    res.json({ ok: true, data: startAssembleJob(items || []) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/episode/assemble/status/:jobId', (req, res) => {
  res.json({ ok: true, data: getAssembleJob(req.params.jobId) });
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
app.post('/api/pipeline', limText, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, payload) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

  // 心跳：单章写作常 >60s 零字节,防 HF 反向代理掐断空闲连接
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch { /* ignore */ } }, 15000);
  req.on('close', () => clearInterval(hb));

  try {
    const { idea, genre, length } = req.body || {};
    if (!idea) throw new Error('缺少 idea');
    const result = await runPipeline(idea, { genre, length }, (step) => send('step', step));
    send('done', result);
  } catch (e) {
    send('error', { error: String(e.message || e) });
  } finally {
    clearInterval(hb);
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
