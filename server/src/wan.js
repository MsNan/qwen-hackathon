/**
 * Wan 视频生成客户端 —— DashScope 国际站原生异步 API(非 OpenAI 兼容端点)。
 * 复用同一把 QWEN_API_KEY;失败不扣费,成功按生成秒数计费/耗免费额度。
 * 范式:提交任务拿 task_id → 轮询 tasks/{id} 直到 SUCCEEDED → 取 output.video_url(24h 有效)。
 *
 * 为避免反向代理把"等 1-2 分钟的长请求"判超时,后端只做"提交"和"单次查询"两个轻动作,
 * 由前端按 task_id 轮询。
 */
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const CREATE_URL = `${BASE}/services/aigc/video-generation/video-synthesis`;
const IMAGE_URL = `${BASE}/services/aigc/image-generation/generation`;
const taskUrl = (id) => `${BASE}/tasks/${id}`;

const MODEL = process.env.WAN_MODEL || 'wan2.7-t2v';
const REF_MODEL = process.env.WAN_T2I_MODEL || 'wan2.6-t2i'; // 文生图:主角定妆图
const EDIT_MODEL = process.env.WAN_EDIT_MODEL || 'wan2.7-image-pro'; // 图像编辑:同人换场景关键帧
const I2V_MODEL = process.env.WAN_I2V_MODEL || 'wan2.2-i2v-plus'; // 图生视频:关键帧动起来

function apiKey() {
  const k = process.env.QWEN_API_KEY;
  if (!k) throw new Error('缺少 QWEN_API_KEY');
  return k;
}

// 通用:提交一个异步任务,返回 task_id
async function postTask(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json().catch(() => ({}));
  const taskId = j?.output?.task_id;
  if (!res.ok || !taskId) throw new Error(j?.message || j?.code || `提交失败 HTTP ${res.status}`);
  return { taskId, status: j.output.task_status };
}

/**
 * 提交一个文生视频任务,返回 task_id。
 * @param {string} prompt 画面/分镜描述
 * @param {object} opts { resolution='720P', ratio='9:16', duration=5 }
 */
export async function createClipTask(prompt, opts = {}) {
  if (!prompt || !prompt.trim()) throw new Error('缺少 prompt');
  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: MODEL,
      input: { prompt: prompt.slice(0, 5000) },
      parameters: {
        resolution: opts.resolution || '720P',
        ratio: opts.ratio || '9:16',
        duration: opts.duration || 5,
      },
    }),
  });
  const j = await res.json().catch(() => ({}));
  const taskId = j?.output?.task_id;
  if (!res.ok || !taskId) {
    throw new Error(j?.message || j?.code || `提交失败 HTTP ${res.status}`);
  }
  return { taskId, status: j.output.task_status };
}

/**
 * 查询一次任务状态。
 * @returns {{status:string, videoUrl?:string, usage?:object}}
 */
export async function queryClipTask(taskId) {
  if (!taskId) throw new Error('缺少 taskId');
  const res = await fetch(taskUrl(taskId), {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `查询失败 HTTP ${res.status}`);
  const out = j?.output || {};
  return {
    status: out.task_status, // PENDING | RUNNING | SUCCEEDED | FAILED | UNKNOWN
    videoUrl: out.video_url || null,
    error: out.message || null,
    usage: j.usage || null,
  };
}

/* ───────── 角色一致性:定妆图 → 换场景关键帧 → 图生视频 ───────── */

// 1) 主角定妆图(纯文生图,纯色底)
export async function createReferenceImageTask(desc) {
  if (!desc || !desc.trim()) throw new Error('缺少主角描述');
  return postTask(IMAGE_URL, {
    model: REF_MODEL,
    input: { messages: [{ role: 'user', content: [{ text: desc.slice(0, 2000) }] }] },
    parameters: { n: 1, size: '720*1280', watermark: false },
  });
}

// 2) 换场景关键帧(1 张或多张定妆图 + 场景指令,锁住每个人)
export async function createKeyframeTask(refImageUrls, sceneDesc) {
  const refs = (Array.isArray(refImageUrls) ? refImageUrls : [refImageUrls]).filter(Boolean);
  if (!refs.length) throw new Error('缺少参考图');
  if (!sceneDesc || !sceneDesc.trim()) throw new Error('缺少场景描述');
  const instruction =
    refs.length > 1
      ? `There are ${refs.length} reference people. Keep EACH person's face, hair and features identical to their own reference image. Place these same people together into the following scene with full identity consistency, cinematic, vertical: ${sceneDesc.slice(0, 1500)}`
      : `Keep the EXACT same person from the reference image — identical face, hair and features. Place this same person into the following scene with full character consistency, cinematic, vertical half-body: ${sceneDesc.slice(0, 1500)}`;
  const content = [...refs.map((u) => ({ image: u })), { text: instruction }];
  return postTask(IMAGE_URL, {
    model: EDIT_MODEL,
    input: { messages: [{ role: 'user', content }] },
    parameters: { n: 1, size: '720*1280', watermark: false },
  });
}

// 查询图片任务 → 取生成图 URL(适配两种返回结构)
export async function queryImageTask(taskId) {
  if (!taskId) throw new Error('缺少 taskId');
  const res = await fetch(taskUrl(taskId), { headers: { Authorization: `Bearer ${apiKey()}` }, signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.message || `查询失败 HTTP ${res.status}`);
  const out = j?.output || {};
  const imageUrl =
    out?.choices?.[0]?.message?.content?.[0]?.image || out?.results?.[0]?.url || null;
  return { status: out.task_status, imageUrl, error: out.message || null };
}

// 3) 关键帧 → 视频(图生视频,锁场景+加运动)
export async function createI2VTask(imgUrl, prompt, opts = {}) {
  if (!imgUrl) throw new Error('缺少关键帧图片');
  return postTask(CREATE_URL, {
    model: I2V_MODEL,
    input: { img_url: imgUrl, prompt: (prompt || '').slice(0, 800) },
    parameters: { resolution: opts.resolution || '480P', duration: opts.duration || 5 },
  });
}
