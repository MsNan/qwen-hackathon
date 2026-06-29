/**
 * 关键帧测试:参考图(同一个人)+ 文字指令 → 换到新场景的静态关键帧。
 * 用 wan2.6 图像生成的多模态 messages(图+文)做主体参考。
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = process.env.QWEN_API_KEY;
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
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
async function main() {
  const b64 = 'data:image/png;base64,' + readFileSync('/tmp/neutral_ref.png').toString('base64');
  console.log('▶ 参考图+指令 → 换场景关键帧(wan2.6-t2i 多模态)...');
  const cr = await fetch(`${BASE}/services/aigc/image-generation/generation`, { method: 'POST', headers: h,
    body: JSON.stringify({ model: 'wan2.7-image-pro',
      input: { messages: [{ role: 'user', content: [
        { image: b64 },
        { text: '保持这张照片里这个人的长相、发型、五官完全一致,把他放到一个阳光明亮的高层总裁办公室里,落地窗外是城市天际线,他穿同样的黑色夹克站在窗前,电影写实风格,竖构图半身' },
      ] }] },
      parameters: { n: 1, size: '720*1280', watermark: false } }) });
  const cj = await cr.json();
  if (!cj?.output?.task_id) { console.error('提交失败:', JSON.stringify(cj, null, 2)); process.exit(3); }
  const j = await poll(cj.output.task_id, 'kf');
  const url = j?.output?.choices?.[0]?.message?.content?.[0]?.image || j?.output?.results?.[0]?.url;
  console.log('✅ 关键帧:', url);
  writeFileSync('/Users/guotao/Desktop/关键帧测试_办公室.png', Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log('🎉 看桌面 关键帧测试_办公室.png:是不是"同一个人 + 真的在办公室"');
}
main().catch((e) => { console.error('异常:', e.message); process.exit(2); });
