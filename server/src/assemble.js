/**
 * 用 ffmpeg 把各分镜短视频拼成"一集完整竖屏短剧":
 * 逐镜归一化(统一 720x1280/30fps + 烧入字幕) → concat 拼接 → 输出到 /assets。
 * 异步任务(可能几十秒),前端按 jobId 轮询。
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './ops.js';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// 预设音色 TTS(给每镜配旁白;失败则回退静音)
const TTS_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const TTS_MODEL = process.env.TTS_MODEL || 'qwen3-tts-flash';
const TTS_VOICE = process.env.TTS_VOICE || 'Cherry';
async function ttsNarration(text) {
  try {
    const key = process.env.QWEN_API_KEY;
    if (!key || !text || !text.trim()) return null;
    const r = await fetch(TTS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, input: { text: text.slice(0, 300), voice: TTS_VOICE } }),
      signal: AbortSignal.timeout(60000),
    });
    const j = await r.json().catch(() => ({}));
    const url = j?.output?.audio?.url;
    if (!url) return null;
    const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
    const fp = path.join(DATA_DIR, 'tts_' + createHash('sha1').update(text).digest('hex').slice(0, 12) + '.mp3');
    writeFileSync(fp, buf);
    return fp;
  } catch { return null; }
}
// 容器内 CJK 字体(Dockerfile 装 fonts-noto-cjk);本地可用 FONT 覆盖
const FONT = process.env.CJK_FONT || '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
const W = 720, H = 1280, FPS = 30;

function run(cmd, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    const timer = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* noop */ } reject(new Error('ffmpeg 超时')); }, timeoutMs);
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg 退出 ${code}: ${err.slice(-400)}`)); });
  });
}

// 探测视频时长(秒);解析失败默认 5(用 -i 解析 stderr,不依赖 ffprobe)
function probeDur(file) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ['-i', file]);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('error', () => resolve(5));
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      resolve(m ? (+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) : 5);
    });
  });
}

// 把 /assets/x.mp4 解析为本地路径;远端则下载到本地(带路径穿越 + SSRF 守卫)
async function resolveLocal(videoUrl) {
  if (typeof videoUrl !== 'string' || !videoUrl) throw new Error('无效视频地址');
  if (videoUrl.startsWith('/assets/')) {
    const base = path.resolve(DATA_DIR);
    const fp = path.resolve(base, videoUrl.slice('/assets/'.length));
    if (!fp.startsWith(base + path.sep)) throw new Error('非法资源路径');
    if (existsSync(fp)) return fp;
    throw new Error('分镜视频已过期或丢失,请重新生成');
  }
  let u;
  try { u = new URL(videoUrl); } catch { throw new Error('无效视频地址'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('仅支持 http(s) 视频地址');
  if (/^(localhost$|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)) throw new Error('不允许的地址');
  const name = 'dl_' + createHash('sha1').update(videoUrl).digest('hex').slice(0, 16) + '.mp4';
  const fp = path.join(DATA_DIR, name);
  if (!existsSync(fp)) {
    const r = await fetch(videoUrl, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`下载分镜失败 HTTP ${r.status}`);
    if (Number(r.headers.get('content-length') || 0) > 60 * 1024 * 1024) throw new Error('视频过大');
    writeFileSync(fp, Buffer.from(await r.arrayBuffer()));
  }
  return fp;
}

// ffmpeg drawtext 文本转义
function escText(s = '') {
  return String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’')
    .replace(/%/g, '\\%').replace(/\n/g, ' ').slice(0, 120);
}

export async function assembleEpisode(items) {
  const list = (items || []).filter((it) => it && it.videoUrl);
  if (!list.length) throw new Error('没有可拼接的分镜视频');
  const norm = [];
  for (let i = 0; i < list.length; i++) {
    const src = await resolveLocal(list[i].videoUrl);
    const out = path.join(DATA_DIR, `norm_${createHash('sha1').update(src + i).digest('hex').slice(0, 12)}.mp4`);
    const text = list[i].subtitle || '';
    const sub = escText(text);
    const vf = [
      `scale=${W}:${H}:force_original_aspect_ratio=decrease`,
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`,
      'setsar=1', `fps=${FPS}`,
      sub ? `drawtext=fontfile='${FONT}':text='${sub}':fontcolor=white:fontsize=38:borderw=3:bordercolor=black@0.85:x=(w-text_w)/2:y=h-150` : null,
    ].filter(Boolean).join(',');
    const narr = await ttsNarration(text); // 旁白音轨(失败=null→静音)
    const enc = ['-r', String(FPS), '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', out];
    if (narr) {
      // 旁白铺底,apad=whole_dur 精确补齐到视频时长(HF ffmpeg 对无限 apad+shortest 会挂,故显式定长)
      const dur = (await probeDur(src)).toFixed(2);
      await run(FFMPEG, [
        '-y', '-i', src, '-i', narr,
        '-filter_complex', `[0:v]${vf}[v];[1:a]apad=whole_dur=${dur},aformat=sample_rates=48000:channel_layouts=stereo[a]`,
        '-map', '[v]', '-map', '[a]', '-t', dur, ...enc,
      ]);
    } else {
      await run(FFMPEG, [
        '-y', '-i', src, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
        '-vf', vf, '-map', '0:v:0', '-map', '1:a:0', '-shortest', ...enc,
      ]);
    }
    norm.push(out);
  }
  // concat
  const listFile = path.join(DATA_DIR, `list_${createHash('sha1').update(norm.join()).digest('hex').slice(0, 12)}.txt`);
  writeFileSync(listFile, norm.map((f) => `file '${f}'`).join('\n'));
  const outName = `episode_${createHash('sha1').update(norm.join()).digest('hex').slice(0, 16)}.mp4`;
  const outFp = path.join(DATA_DIR, outName);
  await run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outFp]);
  // 清理中间产物
  try { unlinkSync(listFile); norm.forEach((f) => existsSync(f) && unlinkSync(f)); } catch { /* ignore */ }
  return `/assets/${outName}`;
}

// ── 异步任务 ──
const jobs = new Map(); // jobId -> { status, videoUrl?, error? }
export function startAssembleJob(items) {
  const jobId = 'asm_' + createHash('sha1').update(JSON.stringify(items) + jobs.size).digest('hex').slice(0, 12);
  jobs.set(jobId, { status: 'RUNNING' });
  assembleEpisode(items)
    .then((videoUrl) => jobs.set(jobId, { status: 'SUCCEEDED', videoUrl }))
    .catch((e) => jobs.set(jobId, { status: 'FAILED', error: String(e.message || e) }));
  return { jobId, status: 'RUNNING' };
}
export function getAssembleJob(jobId) {
  return jobs.get(jobId) || { status: 'UNKNOWN', error: '任务不存在或已过期' };
}
