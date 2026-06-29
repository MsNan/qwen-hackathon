<script setup>
import { reactive } from 'vue';
defineProps({ data: Object });

// 每个分镜的视频生成状态：{ phase:'idle'|'running'|'done'|'error', url, msg }
const clips = reactive({});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function genClip(s, i) {
  const cur = clips[i];
  if (cur && cur.phase === 'running') return;
  const prompt = [s.imagePrompt, s.action].filter(Boolean).join('。');
  clips[i] = { phase: 'running', msg: '提交中…' };
  try {
    const start = await (await fetch('/api/clip/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })).json();
    if (!start.ok) throw new Error(start.error);
    const taskId = start.data.taskId;
    clips[i] = { phase: 'running', msg: '生成中…（约 1–2 分钟）' };
    for (let n = 0; n < 36; n++) {
      await sleep(5000);
      const q = await (await fetch(`/api/clip/status/${taskId}`)).json();
      if (!q.ok) throw new Error(q.error);
      const st = q.data.status;
      if (st === 'SUCCEEDED') { clips[i] = { phase: 'done', url: q.data.videoUrl }; return; }
      if (st === 'FAILED' || st === 'UNKNOWN') throw new Error(q.data.error || st);
    }
    throw new Error('生成超时');
  } catch (e) {
    clips[i] = { phase: 'error', msg: String(e.message || e) };
  }
}
</script>

<template>
  <div class="screenplay">
    <div class="ep">🎬 {{ data.episodeTitle }} <span class="cnt">{{ (data.scenes || []).length }} 个分镜</span></div>
    <div class="board">
      <div v-for="(s, i) in data.scenes" :key="i" class="shot">
        <div class="shot-head">
          <span class="no">{{ s.no || i + 1 }}</span>
          <span class="loc">{{ s.location }}<em v-if="s.time"> · {{ s.time }}</em></span>
          <span class="lens">{{ s.shot }}</span>
        </div>
        <!-- 已生成 → 内嵌播放；否则显示文生图占位 -->
        <video v-if="clips[i] && clips[i].phase === 'done'" class="vid" :src="clips[i].url" controls playsinline />
        <div v-else class="frame">🖼 {{ s.imagePrompt }}</div>
        <div class="action">{{ s.action }}</div>
        <div v-if="s.dialogue" class="dia">「{{ s.dialogue }}」</div>
        <div v-if="s.caption" class="cap">字幕：{{ s.caption }}</div>
        <!-- 生成视频按钮 / 状态 -->
        <div class="vbar">
          <button class="vbtn" :disabled="clips[i] && clips[i].phase === 'running'" @click="genClip(s, i)">
            <template v-if="clips[i] && clips[i].phase === 'running'"><span class="spin" /> {{ clips[i].msg }}</template>
            <template v-else-if="clips[i] && clips[i].phase === 'done'">🎬 重新生成</template>
            <template v-else>🎬 生成视频</template>
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
.board { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.shot { border: 1px solid #e9eaf1; border-radius: 10px; overflow: hidden; background: #fff; }
.shot-head {
  display: flex; align-items: center; gap: 6px; padding: 8px 10px;
  background: #f6f4ff; font-size: 12px;
}
.no { background: #6a5cff; color: #fff; width: 20px; height: 20px; border-radius: 5px; display: grid; place-items: center; font-weight: 700; }
.loc { color: #4a5060; font-weight: 600; flex: 1; }
.loc em { color: #9aa3b2; font-style: normal; }
.lens { color: #6a5cff; font-weight: 600; }
.frame {
  font-size: 11.5px; color: #6b6f80; background: repeating-linear-gradient(45deg, #fafafe, #fafafe 8px, #f3f2fb 8px, #f3f2fb 16px);
  padding: 14px 10px; line-height: 1.5; min-height: 56px;
}
.vid { width: 100%; display: block; background: #000; max-height: 320px; }
.action { font-size: 13px; color: #2a2f3a; padding: 8px 10px 4px; line-height: 1.6; }
.dia { font-size: 13px; color: #5a3cff; padding: 2px 10px; font-weight: 600; }
.cap { font-size: 11.5px; color: #9aa3b2; padding: 4px 10px 6px; }
.vbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px 10px; }
.vbtn {
  border: 1px solid #6a5cff; color: #6a5cff; background: #fff; border-radius: 7px;
  font-size: 12px; padding: 5px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.vbtn:hover:not(:disabled) { background: #f3f2fb; }
.vbtn:disabled { opacity: .7; cursor: default; }
.verr { font-size: 11px; color: #d9534f; }
.spin {
  width: 11px; height: 11px; border: 2px solid #cfc8ff; border-top-color: #6a5cff;
  border-radius: 50%; display: inline-block; animation: sp .7s linear infinite;
}
@keyframes sp { to { transform: rotate(360deg); } }
</style>
