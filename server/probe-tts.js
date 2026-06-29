/**
 * Qwen-TTS 声音复刻探针 —— 验证用现有 key 能否克隆用户声音并合成旁白。
 * base64 内联音频(不上传公网)。失败/不像可弃用。
 * 运行: cd server && node probe-tts.js
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';

const KEY = process.env.QWEN_API_KEY;
if (!KEY) { console.error('缺少 QWEN_API_KEY'); process.exit(1); }

const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const ENROLL_URL = `${BASE}/services/audio/tts/customization`;
const TTS_URL = `${BASE}/services/aigc/multimodal-generation/generation`;
const TARGET_MODEL = 'qwen3-tts-vc-2026-01-22';

const NARRATION =
  '而且,分镜不只是图。点一下,就能直接生成真实的短剧视频片段——从一句话,到能拍的画面。';

const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function main() {
  // 1) 创建克隆音色(base64 内联样本)
  const b64 = readFileSync('/tmp/voice_sample.mp3').toString('base64');
  console.log('▶ 1) 创建克隆音色...');
  const er = await fetch(ENROLL_URL, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      model: 'qwen-voice-enrollment',
      input: {
        action: 'create',
        target_model: TARGET_MODEL,
        preferred_name: 'jinyuan',
        audio: { data: `data:audio/mpeg;base64,${b64}` },
      },
    }),
  });
  const ej = await er.json().catch(() => ({}));
  console.log(`  HTTP ${er.status}`);
  const voice = ej?.output?.voice;
  if (!er.ok || !voice) {
    console.error('❌ 创建音色失败,完整返回:');
    console.error(JSON.stringify(ej, null, 2));
    process.exit(2);
  }
  console.log(`✅ 音色已创建 voice=${voice}`);

  // 2) 用克隆音色合成旁白
  console.log('▶ 2) 合成旁白...');
  const sr = await fetch(TTS_URL, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      model: TARGET_MODEL,
      input: { text: NARRATION, voice },
    }),
  });
  const sj = await sr.json().catch(() => ({}));
  console.log(`  HTTP ${sr.status}`);
  if (!sr.ok) { console.error('❌ 合成失败:', JSON.stringify(sj, null, 2)); process.exit(3); }

  // 输出可能是 url 或 base64,打印结构以适配
  const audioUrl = sj?.output?.audio?.url;
  const audioB64 = sj?.output?.audio?.data;
  if (audioUrl) {
    console.log('🎧 合成音频 URL:', audioUrl);
    const buf = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
    writeFileSync('/tmp/narration.mp3', buf);
    console.log('✅ 已下载 → /tmp/narration.mp3', buf.length, 'bytes');
  } else if (audioB64) {
    const raw = audioB64.replace(/^data:audio\/\w+;base64,/, '');
    writeFileSync('/tmp/narration.mp3', Buffer.from(raw, 'base64'));
    console.log('✅ 已解码 → /tmp/narration.mp3');
  } else {
    console.log('⚠ 未识别音频字段,完整返回:');
    console.log(JSON.stringify(sj, null, 2));
  }
}
main().catch((e) => { console.error('异常:', e.message); process.exit(5); });
