/**
 * 中性定妆图 → 不同场景 i2v 测试。
 * 看用"纯色底定妆图"能否让 i2v 一边锁人、一边换到全新场景。
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
const KEY = process.env.QWEN_API_KEY;
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function poll(id, label) {
  for (let i = 1; i <= 40; i++) { await sleep(6000);
    const j = await (await fetch(`${BASE}/tasks/${id}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
    const st = j?.output?.task_status; console.log(`  [${label} ${i}] ${st}`);
    if (st === 'SUCCEEDED') return j;
    if (st === 'FAILED' || st === 'UNKNOWN') { console.error(JSON.stringify(j.output, null, 2)); throw new Error(st); } }
  throw new Error('timeout');
}
async function main() {
  console.log('▶ 中性定妆图(纯灰底影棚肖像)...');
  const cr = await fetch(`${BASE}/services/aigc/image-generation/generation`, { method: 'POST', headers: h,
    body: JSON.stringify({ model: 'wan2.6-t2i', input: { messages: [{ role: 'user', content: [{ text:
      '影棚证件照风格,纯浅灰色背景,一个二十二岁的亚洲男性,圆脸,短黑发,浓眉,不戴帽子,穿黑色夹克,正面清晰半身肖像,均匀打光,高细节' }] }] },
      parameters: { n: 1, size: '720*1280', watermark: false } }) });
  const cj = await cr.json();
  const ij = await poll(cj.output.task_id, 't2i');
  const ref = ij?.output?.choices?.[0]?.message?.content?.[0]?.image || ij?.output?.results?.[0]?.url;
  console.log('✅ 中性定妆图:', ref);
  writeFileSync('/tmp/neutral_ref.png', Buffer.from(await (await fetch(ref)).arrayBuffer()));

  console.log('▶ i2v → 全新场景(明亮总裁办公室)...');
  const vr = await fetch(`${BASE}/services/aigc/video-generation/video-synthesis`, { method: 'POST', headers: h,
    body: JSON.stringify({ model: 'wan2.2-i2v-plus',
      input: { img_url: ref, prompt: '他站在阳光明亮的高层总裁办公室里,落地窗外是城市天际线,他转身看向镜头,室内现代简约,镜头缓推' },
      parameters: { resolution: '480P', duration: 5 } }) });
  const vj = await vr.json();
  const vfin = await poll(vj.output.task_id, 'i2v');
  const vurl = vfin?.output?.video_url;
  console.log('✅ 视频:', vurl);
  writeFileSync('/Users/guotao/Desktop/中性测试_办公室.mp4', Buffer.from(await (await fetch(vurl)).arrayBuffer()));
  console.log('🎉 看桌面 中性测试_办公室.mp4:场景变没变、人还在不在');
}
main().catch((e) => { console.error('异常:', e.message); process.exit(2); });
