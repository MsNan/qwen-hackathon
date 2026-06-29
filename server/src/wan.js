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
const taskUrl = (id) => `${BASE}/tasks/${id}`;

const MODEL = process.env.WAN_MODEL || 'wan2.7-t2v';

function apiKey() {
  const k = process.env.QWEN_API_KEY;
  if (!k) throw new Error('缺少 QWEN_API_KEY');
  return k;
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
