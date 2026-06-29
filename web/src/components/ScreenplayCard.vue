<script setup>
import { reactive, ref } from 'vue';
const props = defineProps({ data: Object });

// 主角定妆图状态
const refState = reactive({ phase: 'idle', url: '', msg: '' });
const refDesc = ref(
  '影棚证件照风格，纯浅灰色背景，本剧男主角：二十二岁亚洲男性，圆脸，短黑发，浓眉，穿黑色夹克，正面清晰半身肖像，均匀打光，高细节'
);

// 每个分镜的视频状态：{ phase:'idle'|'running'|'done'|'error', url, msg }
const clips = reactive({});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 通用轮询：拿 taskId，按 url 模板查状态，extract 提取结果；最多 maxTries×5s，容忍抖动
async function pollTask(statusUrl, taskId, extract, maxTries = 60) {
  let fails = 0;
  for (let n = 0; n < maxTries; n++) {
    await sleep(5000);
    let q;
    try {
      q = await (await fetch(`${statusUrl}/${taskId}`)).json();
    } catch {
      if (++fails >= 6) throw new Error('网络不稳定，轮询失败');
      continue;
    }
    fails = 0;
    if (!q.ok) throw new Error(q.error || '查询失败');
    const st = q.data.status;
    if (st === 'SUCCEEDED') return extract(q.data);
    if (st === 'FAILED' || st === 'UNKNOWN') throw new Error(q.data.error || st);
  }
  throw new Error('超时，可重试');
}

async function startTask(url, body) {
  const r = await (await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json();
  if (!r.ok) throw new Error(r.error);
  return r.data.taskId;
}

// 生成主角定妆图
async function genReference() {
  if (refState.phase === 'running') return;
  refState.phase = 'running'; refState.msg = '生成中…（约 30 秒）';
  try {
    const taskId = await startTask('/api/image/reference', { desc: refDesc.value });
    const url = await pollTask('/api/image/status', taskId, (d) => d.imageUrl, 24);
    refState.phase = 'done'; refState.url = url;
  } catch (e) {
    refState.phase = 'error'; refState.msg = String(e.message || e);
  }
}

// 生成某个分镜的视频：有定妆图 → 关键帧+i2v(锁主角)；没有 → 文生视频(t2v)
async function genClip(s, i) {
  const cur = clips[i];
  if (cur && cur.phase === 'running') return;
  try {
    if (refState.url) {
      // ① 换场景关键帧（同一主角进入本镜场景）
      clips[i] = { phase: 'running', msg: '①生成本镜画面…' };
      const sceneDesc = [s.location, s.time, s.imagePrompt].filter(Boolean).join('，');
      const kfTask = await startTask('/api/image/keyframe', { refUrl: refState.url, sceneDesc });
      const keyframe = await pollTask('/api/image/status', kfTask, (d) => d.imageUrl, 24);
      // ② 关键帧 → 视频
      clips[i] = { phase: 'running', msg: '②生成视频…（约 1–2 分钟，勿切走标签页）' };
      const vTask = await startTask('/api/clip/i2v', { imgUrl: keyframe, prompt: s.action });
      const url = await pollTask('/api/clip/status', vTask, (d) => d.videoUrl);
      clips[i] = { phase: 'done', url };
    } else {
      // 回退：文生视频
      clips[i] = { phase: 'running', msg: '生成中…（约 1–2 分钟，勿切走标签页）' };
      const prompt = [s.imagePrompt, s.action].filter(Boolean).join('。');
      const vTask = await startTask('/api/clip/start', { prompt });
      const url = await pollTask('/api/clip/status', vTask, (d) => d.videoUrl);
      clips[i] = { phase: 'done', url };
    }
  } catch (e) {
    clips[i] = { phase: 'error', msg: String(e.message || e) };
  }
}
</script>

<template>
  <div class="screenplay">
    <div class="ep">🎬 {{ data.episodeTitle }} <span class="cnt">{{ (data.scenes || []).length }} 个分镜</span></div>

    <!-- ① 主角定妆图：锁定角色一致性 -->
    <div class="refbox">
      <div class="reftitle">① 主角定妆图 <em>—— 先定妆，后续每个分镜都锁定同一个人</em></div>
      <textarea v-model="refDesc" class="refdesc" rows="2" placeholder="描述主角长相/年龄/发型/服装…" />
      <div class="refrow">
        <button class="refbtn" :disabled="refState.phase === 'running'" @click="genReference">
          <template v-if="refState.phase === 'running'"><span class="spin" /> {{ refState.msg }}</template>
          <template v-else-if="refState.phase === 'done'">🔄 重新定妆</template>
          <template v-else>🎭 生成主角定妆图</template>
        </button>
        <span v-if="refState.phase === 'error'" class="verr">✕ {{ refState.msg }}</span>
        <span v-else-if="refState.phase === 'done'" class="reftip">✓ 已锁定主角，下面每个分镜会保持同一个人</span>
      </div>
      <img v-if="refState.url" :src="refState.url" class="refimg" alt="主角定妆图" />
    </div>

    <div class="board">
      <div v-for="(s, i) in data.scenes" :key="i" class="shot">
        <div class="shot-head">
          <span class="no">{{ s.no || i + 1 }}</span>
          <span class="loc">{{ s.location }}<em v-if="s.time"> · {{ s.time }}</em></span>
          <span class="lens">{{ s.shot }}</span>
        </div>
        <video v-if="clips[i] && clips[i].phase === 'done'" class="vid" :src="clips[i].url" controls playsinline />
        <div v-else class="frame">🖼 {{ s.imagePrompt }}</div>
        <div class="action">{{ s.action }}</div>
        <div v-if="s.dialogue" class="dia">「{{ s.dialogue }}」</div>
        <div v-if="s.caption" class="cap">字幕：{{ s.caption }}</div>
        <div class="vbar">
          <button class="vbtn" :disabled="clips[i] && clips[i].phase === 'running'" @click="genClip(s, i)">
            <template v-if="clips[i] && clips[i].phase === 'running'"><span class="spin" /> {{ clips[i].msg }}</template>
            <template v-else-if="clips[i] && clips[i].phase === 'done'">🎬 重新生成</template>
            <template v-else>🎬 生成视频<em v-if="refState.url" class="lock"> · 锁主角</em></template>
          </button>
          <span v-if="clips[i] && clips[i].phase === 'error'" class="verr">✕ {{ clips[i].msg }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ep { font-size: 15px; font-weight: 700; color: #221d3a; margin-bottom: 12px; }
.cnt { font-size: 12px; color: #9aa3b2; font-weight: 400; margin-left: 8px; }
/* 定妆图区 */
.refbox { border: 1px dashed #c9c2ff; background: #faf9ff; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
.reftitle { font-size: 13px; font-weight: 700; color: #5a3cff; }
.reftitle em { font-weight: 400; color: #9aa3b2; font-style: normal; font-size: 12px; }
.refdesc { width: 100%; box-sizing: border-box; margin: 8px 0; border: 1px solid #e3e0f5; border-radius: 7px; padding: 7px 9px; font-size: 12.5px; resize: vertical; font-family: inherit; }
.refrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.refbtn { border: 1px solid #6a5cff; background: #6a5cff; color: #fff; border-radius: 7px; font-size: 12.5px; padding: 6px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.refbtn:disabled { opacity: .7; cursor: default; }
.reftip { font-size: 11.5px; color: #2ea66b; }
.refimg { display: block; width: 132px; border-radius: 8px; margin-top: 10px; border: 1px solid #e9eaf1; }
/* 分镜 */
.board { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.shot { border: 1px solid #e9eaf1; border-radius: 10px; overflow: hidden; background: #fff; }
.shot-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: #f6f4ff; font-size: 12px; }
.no { background: #6a5cff; color: #fff; width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; font-weight: 700; }
.loc { color: #4a5060; font-weight: 600; flex: 1; }
.loc em { color: #9aa3b2; font-style: normal; }
.lens { color: #6a5cff; font-weight: 600; }
.frame { font-size: 11.5px; color: #6b6f80; background: repeating-linear-gradient(45deg, #fafafe, #fafafe 8px, #f3f2fb 8px, #f3f2fb 16px); padding: 14px 10px; line-height: 1.5; min-height: 56px; }
.vid { width: 100%; display: block; background: #000; max-height: 320px; }
.action { font-size: 13px; color: #2a2f3a; padding: 8px 10px 4px; line-height: 1.6; }
.dia { font-size: 13px; color: #5a3cff; padding: 2px 10px; font-weight: 600; }
.cap { font-size: 11.5px; color: #9aa3b2; padding: 4px 10px 6px; }
.vbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px 10px; }
.vbtn { border: 1px solid #6a5cff; color: #6a5cff; background: #fff; border-radius: 7px; font-size: 12px; padding: 5px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.vbtn:hover:not(:disabled) { background: #f3f2fb; }
.vbtn:disabled { opacity: .7; cursor: default; }
.lock { font-style: normal; color: #2ea66b; font-size: 11px; }
.verr { font-size: 11px; color: #d9534f; }
.spin { width: 11px; height: 11px; border: 2px solid #cfc8ff; border-top-color: #6a5cff; border-radius: 50%; display: inline-block; animation: sp .7s linear infinite; }
@keyframes sp { to { transform: rotate(360deg); } }
</style>
