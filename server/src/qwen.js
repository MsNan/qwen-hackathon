/**
 * Qwen Cloud 客户端 —— 走 OpenAI 兼容模式。
 * 黑客松要求使用 Qwen 模型；API 与 OpenAI SDK 完全兼容，
 * 只需把 baseURL 指向 dashscope-intl 即可。
 */
import OpenAI from 'openai';

const baseURL =
  process.env.QWEN_BASE_URL ||
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

export const MODELS = {
  // 文本主力：长文创作/推理
  text: process.env.QWEN_TEXT_MODEL || 'qwen-plus',
  // 高质量/复杂编排时切到 max
  pro: process.env.QWEN_PRO_MODEL || 'qwen-max',
};

// ── token 用量累计(供预算面板)──
let _usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };
export function resetUsage() { _usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 }; }
export function getUsage() { return { ..._usage }; }

export function makeClient() {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new Error(
      '缺少 QWEN_API_KEY，请在 server/.env 里填入 Qwen Cloud 的 API Key'
    );
  }
  return new OpenAI({ apiKey, baseURL });
}

/**
 * 单次对话补全。
 * @param {string} system 系统提示
 * @param {string} user 用户输入
 * @param {object} opts { model, temperature, json }
 */
export async function complete(system, user, opts = {}) {
  const client = makeClient();
  const res = await client.chat.completions.create({
    model: opts.model || MODELS.text,
    temperature: opts.temperature ?? 0.8,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
  });
  const u = res.usage || {};
  _usage.promptTokens += u.prompt_tokens || 0;
  _usage.completionTokens += u.completion_tokens || 0;
  _usage.totalTokens += u.total_tokens || 0;
  _usage.calls += 1;
  return res.choices[0]?.message?.content?.trim() || '';
}
