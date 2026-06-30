/**
 * 多角色同框测试:两张定妆图 → 同一场景关键帧,各自保持长相。
 * 验证 wan2.7-image-pro 能否多主体参考。
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = process.env.QWEN_API_KEY;
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const IMG = `${BASE}/services/aigc/image-generation/generation`;
const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(id, label) {
  for (let i = 1; i <= 30; i++) { await sleep(5000);
    const j = await (await fetch(`${BASE}/tasks/${id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
    const st = j?.output?.task_status; console.log(`  [${label} ${i}] ${st}`);
    if (st === 'SUCCEEDED') return j;
    if (st === 'FAILED' || st === 'UNKNOWN') { console.error(JSON.stringify(j.output, null, 2)); throw new Error(st); } }
  throw new Error('timeout');
}
async function imgUrlOf(j) { return j?.output?.choices?.[0]?.message?.content?.[0]?.image || j?.output?.results?.[0]?.url; }
async function t2i(text, tag) {
  const r = await fetch(IMG, { method: 'POST', headers: h, body: JSON.stringify({
    model: 'wan2.6-t2i', input: { messages: [{ role: 'user', content: [{ text }] }] },
    parameters: { n: 1, size: '720*1280', watermark: false } }) });
  const cj = await r.json();
  return imgUrlOf(await poll(cj.output.task_id, tag));
}
async function main() {
  // 角色A:复用已有外卖小哥定妆图(base64);角色B:新生成总裁
  const a = 'data:image/png;base64,' + readFileSync('/tmp/neutral_ref.png').toString('base64');
  console.log('▶ 生成角色B(总裁)定妆图...');
  const bUrl = await t2i('影棚证件照,纯灰底,一个三十五岁亚洲男性,方脸,梳背头,穿深灰色西装,气场强,正面清晰半身肖像,均匀打光', 'B总裁');
  console.log('  总裁:', bUrl);
  const b = 'data:image/png;base64,' + Buffer.from(await (await fetch(bUrl)).arrayBuffer()).toString('base64');

  console.log('▶ 多参考关键帧:两人同框办公室对话...');
  const r = await fetch(IMG, { method: 'POST', headers: h, body: JSON.stringify({
    model: 'wan2.7-image-pro',
    input: { messages: [{ role: 'user', content: [
      { image: a }, { image: b },
      { text: 'Two people in one scene: the FIRST reference person (delivery rider, casual jacket) stands facing the SECOND reference person (the boss in a grey suit) inside a bright high-rise office, city skyline outside, they are talking. Keep BOTH faces identical to their references. Cinematic, vertical.' },
    ] }] },
    parameters: { n: 1, size: '720*1280', watermark: false } }) });
  const cj = await r.json();
  if (!cj?.output?.task_id) { console.error('提交失败:', JSON.stringify(cj, null, 2)); process.exit(3); }
  const url = await imgUrlOf(await poll(cj.output.task_id, 'multi'));
  console.log('✅ 同框关键帧:', url);
  writeFileSync('/Users/guotao/Desktop/多角色测试_两人同框.png', Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log('🎉 看桌面 多角色测试_两人同框.png:两个人是不是各自和定妆图一致');
}
main().catch((e) => { console.error('异常:', e.message); process.exit(2); });
