/**
 * 生成 demo 旁白:克隆用户声音(Qwen-TTS)→ 逐段合成 9 段中文旁白到 /tmp/narr/segN.mp3
 * 运行: cd server && node gen-narration.js
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.QWEN_API_KEY;
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const ENROLL = `${BASE}/services/audio/tts/customization`;
const TTS = `${BASE}/services/aigc/multimodal-generation/generation`;
const TARGET = 'qwen3-tts-vc-2026-01-22';
const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const SEGMENTS = [
  '市面上的 AI 写作工具大多是套壳,通用、不懂行。我是签约网文作者,也是开发者——我把真正能让稿子签约的创作方法论,做进了一组协作的 AI 智能体。给它一句话创意,选好题材和篇幅。',
  '五个智能体接力:先出钩子标题和卖点,再排双线大纲——明线暗线,每个反转都埋了前文可回溯的物证。',
  '核心是卡点质检官。它像签约编辑,对照拒稿硬伤清单审稿,抓出旁观主角这个硬伤,并给出证据和改法;评分按固定公式算出、可追溯。不合格自动重写复检,分数从八十五提到八十八——这是套壳工具做不到的把关。',
  '可以无限续写下一章,每一章都自动过质检。',
  '接着改编成竖屏短剧,系统自动从剧情里选角,给每个角色生成定妆图。',
  '关键在这:每个分镜生成真实视频时,都锁定同一批角色,跨分镜、跨场景都是同一个人——解决了 AI 视频最难的角色一致性。',
  '一键成片,自动跑完选角、定妆、逐镜生成,全程自主。',
  '最后自动拼成一条带字幕的完整短剧。从一句话,到能拍、能发的竖屏成片。',
  '一句话进,一套能发表、能拍、角色一致的内容出,全程 Qwen 与通义万相驱动。这正是赛道二 AI Showrunner。谢谢观看。',
];

async function main() {
  mkdirSync('/tmp/narr', { recursive: true });
  console.log('▶ 克隆声音...');
  const b64 = readFileSync('/tmp/voice_sample.mp3').toString('base64');
  const er = await fetch(ENROLL, { method: 'POST', headers: h, body: JSON.stringify({
    model: 'qwen-voice-enrollment',
    input: { action: 'create', target_model: TARGET, preferred_name: 'jinyuan', audio: { data: `data:audio/mpeg;base64,${b64}` } },
  }) });
  const ej = await er.json();
  const voice = ej?.output?.voice;
  if (!voice) { console.error('克隆失败:', JSON.stringify(ej)); process.exit(2); }
  console.log('✅ 音色:', voice);

  for (let i = 0; i < SEGMENTS.length; i++) {
    process.stdout.write(`▶ 合成第 ${i + 1}/9 段... `);
    const sr = await fetch(TTS, { method: 'POST', headers: h, body: JSON.stringify({
      model: TARGET, input: { text: SEGMENTS[i], voice },
    }) });
    const sj = await sr.json();
    const url = sj?.output?.audio?.url;
    const data = sj?.output?.audio?.data;
    let buf;
    if (url) buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    else if (data) buf = Buffer.from(data.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
    else { console.error('无音频:', JSON.stringify(sj).slice(0, 300)); process.exit(3); }
    writeFileSync(`/tmp/narr/seg${i + 1}.mp3`, buf);
    console.log(buf.length, 'bytes');
  }
  console.log('🎉 9 段旁白已生成 → /tmp/narr/');
}
main().catch((e) => { console.error('异常:', e.message); process.exit(1); });
