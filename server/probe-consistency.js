/**
 * 角色一致性探针 —— 验证「定妆图 → 图生视频」能否锁住同一主角。
 * t2i 生成参考图(OSS公网URL) → 该URL作为 img_url 喂 i2v 生成两个不同分镜。
 * 全在 dashscope-intl,同一把 key。
 * 运行: cd server && node probe-consistency.js
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';

const KEY = process.env.QWEN_API_KEY;
if (!KEY) { console.error('缺少 QWEN_API_KEY'); process.exit(1); }
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const h = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(taskId, label) {
  for (let i = 1; i <= 40; i++) {
    await sleep(6000);
    const j = await (await fetch(`${BASE}/tasks/${taskId}`, { headers: { Authorization: `Bearer ${KEY}` } })).json();
    const st = j?.output?.task_status;
    process.stdout.write(`  [${label} ${i}] ${st}\n`);
    if (st === 'SUCCEEDED') return j;
    if (st === 'FAILED' || st === 'UNKNOWN') { console.error(JSON.stringify(j, null, 2)); throw new Error(`${label} ${st}`); }
  }
  throw new Error(`${label} 超时`);
}

// 1) 文生图：主角定妆图
async function genReference() {
  if (process.env.REF_URL) { console.log('▶ 1) 复用已有定妆图'); return process.env.REF_URL; }
  console.log('▶ 1) 生成主角定妆图(wan2.6-t2i)...');
  const r = await fetch(`${BASE}/services/aigc/image-generation/generation`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      model: 'wan2.6-t2i',
      input: { messages: [{ role: 'user', content: [{ text:
        '电影写实风格,一个二十二岁的外卖配送员,亚洲男性,圆脸,短黑发,浓眉,戴深蓝色头盔,穿黑色配送风衣,夜晚城市霓虹背景,清晰正面半身肖像,高细节' }] }] },
      parameters: { n: 1, size: '720*1280', watermark: false },
    }),
  });
  const cj = await r.json();
  if (!cj?.output?.task_id) { console.error('t2i 提交失败:', JSON.stringify(cj, null, 2)); throw new Error('t2i submit'); }
  const j = await poll(cj.output.task_id, 't2i');
  // 适配两种返回结构
  const url = j?.output?.choices?.[0]?.message?.content?.[0]?.image
           || j?.output?.results?.[0]?.url;
  if (!url) { console.error('未找到图片URL:', JSON.stringify(j.output, null, 2)); throw new Error('no image url'); }
  console.log('✅ 定妆图:', url);
  return url;
}

// 2) 图生视频：以定妆图为锚
async function genShot(imgUrl, prompt, tag) {
  console.log(`▶ 2) 图生视频 ${tag} ...`);
  const r = await fetch(`${BASE}/services/aigc/video-generation/video-synthesis`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      model: 'wan2.2-i2v-plus',
      input: { img_url: imgUrl, prompt },
      parameters: { resolution: '480P', duration: 5 },
    }),
  });
  const cj = await r.json();
  if (!cj?.output?.task_id) { console.error(`i2v ${tag} 提交失败:`, JSON.stringify(cj, null, 2)); throw new Error('i2v submit'); }
  const j = await poll(cj.output.task_id, `i2v-${tag}`);
  const vurl = j?.output?.video_url;
  console.log(`✅ ${tag} 视频:`, vurl);
  return vurl;
}

async function dl(url, path) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(path, buf);
  console.log('  下载 →', path, buf.length, 'bytes');
}

async function main() {
  const ref = await genReference();
  await dl(ref, '/tmp/consistency_ref.png');
  const a = await genShot(ref, '他骑着电动车,穿过雨夜的城市街道,镜头跟随,电影质感', 'A骑车');
  await dl(a, '/Users/guotao/Desktop/一致性测试_分镜A.mp4');
  const b = await genShot(ref, '他站在写字楼电梯里,深吸一口气,电梯缓缓上升,镜头近景', 'B电梯');
  await dl(b, '/Users/guotao/Desktop/一致性测试_分镜B.mp4');
  console.log('\n🎉 完成。对比桌面 一致性测试_分镜A.mp4 / _分镜B.mp4 看是否同一个人。');
}
main().catch((e) => { console.error('异常:', e.message); process.exit(2); });
