/**
 * Wan 视频生成 —— 接入探针(一次性验证脚本)
 * 目的:用现有 QWEN_API_KEY 验证 DashScope 国际站 Wan 文生视频端点是否通、区域/额度是否覆盖。
 * 失败不扣费;成功仅消耗 ~5 秒额度。
 * 运行:  cd server && node probe-wan.js
 */
import 'dotenv/config';

const KEY = process.env.QWEN_API_KEY;
if (!KEY) {
  console.error('❌ 缺少 QWEN_API_KEY(server/.env)');
  process.exit(1);
}

// 国际站(新加坡)原生异步端点 —— 与 compatible-mode 不同
const BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
const CREATE_URL = `${BASE}/services/aigc/video-generation/video-synthesis`;
const TASK_URL = (id) => `${BASE}/tasks/${id}`;

const MODEL = process.env.WAN_MODEL || 'wan2.7-t2v';

// 一个短剧风格的测试分镜(竖屏)
const PROMPT =
  '县城清晨,薄雾未散的老街,一个穿深色风衣的女人快步走过青石板路,镜头跟随,氛围悬疑克制,电影质感';

const body = {
  model: MODEL,
  input: { prompt: PROMPT },
  parameters: { resolution: '720P', ratio: '9:16', duration: 5 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`▶ 提交任务  model=${MODEL}  端点=${CREATE_URL}`);
  const createRes = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
  });

  const createText = await createRes.text();
  console.log(`  HTTP ${createRes.status}`);
  let created;
  try {
    created = JSON.parse(createText);
  } catch {
    console.error('  返回非 JSON:', createText.slice(0, 500));
    process.exit(2);
  }

  if (!createRes.ok || !created?.output?.task_id) {
    console.error('❌ 提交失败,完整返回:');
    console.error(JSON.stringify(created, null, 2));
    console.error('\n→ 若 code 含 region/endpoint/Model.NotFound,多半是区域或模型名问题,我据此调整。');
    process.exit(3);
  }

  const taskId = created.output.task_id;
  console.log(`✅ 已受理  task_id=${taskId}  status=${created.output.task_status}`);

  // 轮询(15s 一次,最多 ~6 分钟)
  for (let i = 1; i <= 24; i++) {
    await sleep(15000);
    const r = await fetch(TASK_URL(taskId), {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const j = await r.json();
    const st = j?.output?.task_status;
    console.log(`  [${i}] ${st}`);
    if (st === 'SUCCEEDED') {
      console.log('\n🎉 生成成功!video_url(24小时有效):');
      console.log(j.output.video_url);
      console.log('\n用量:', JSON.stringify(j.usage || {}, null, 2));
      return;
    }
    if (st === 'FAILED' || st === 'UNKNOWN') {
      console.error('\n❌ 任务失败,完整返回:');
      console.error(JSON.stringify(j, null, 2));
      process.exit(4);
    }
  }
  console.error('⏱ 轮询超时(6分钟未完成),task_id 24h 内仍可查:', taskId);
}

main().catch((e) => {
  console.error('❌ 异常:', e.message);
  process.exit(5);
});
