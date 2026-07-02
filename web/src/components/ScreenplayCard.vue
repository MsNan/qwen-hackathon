<script setup>
import { reactive, computed } from 'vue';
import { t } from '../i18n.js';
const props = defineProps({
  data: Object,                 // 一集（含 scenes，会被写入 sceneCharacters/castNames）
  cast: { type: Object, default: () => ({}) }, // 项目级定妆库：name → { appearance, refUrl }
});

const extractState = reactive({ phase: 'idle', msg: '' }); // 选角抽取态
const castPhase = reactive({});  // name → 'running'|'done'|'error'（定妆图生成态，非持久）
const clips = reactive({});      // 分镜 index → { phase, url, msg }
const PRODUCE_CAP = 6;           // 一键成片默认前 N 镜(控额度+时长)
const produceState = reactive({ running: false, done: 0, total: 0 });
const assembleState = reactive({ phase: 'idle', url: '', msg: '' });

const castNames = computed(() => props.data.castNames || []);
const sceneChars = computed(() => props.data.sceneCharacters || []);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startTask(url, body) {
  const r = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  if (!r.ok) throw new Error(r.error);
  return r.data.taskId;
}
async function pollTask(statusUrl, taskId, extract, maxTries = 60) {
  let fails = 0;
  for (let n = 0; n < maxTries; n++) {
    await sleep(5000);
    let q;
    try { q = await (await fetch(`${statusUrl}/${taskId}`)).json(); }
    catch { if (++fails >= 6) throw new Error(t('errNetworkPoll')); continue; }
    fails = 0;
    if (!q.ok) throw new Error(q.error || t('errQueryFail'));
    const st = q.data.status;
    if (st === 'SUCCEEDED') {
      const v = extract(q.data);
      if (v == null) throw new Error(t('errNoResult'));
      return v;
    }
    if (st === 'FAILED' || st === 'UNKNOWN') throw new Error(q.data.error || st);
  }
  throw new Error(t('errTimeout'));
}

// 自动选角：从分镜识别角色 + 每镜出场标注；已在定妆库的角色保留(不覆盖)
async function autoCast() {
  if (extractState.phase === 'running') return;
  extractState.phase = 'running'; extractState.msg = t('identifying');
  try {
    const r = await (await fetch('/api/cast/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenes: props.data.scenes, context: props.data.episodeTitle }),
    })).json();
    if (!r.ok) throw new Error(r.error);
    props.data.sceneCharacters = r.data.sceneCharacters || [];
    const names = [];
    for (const c of (r.data.cast || [])) {
      if (!c.name) continue;
      names.push(c.name);
      if (!props.cast[c.name]) props.cast[c.name] = { appearance: c.appearance || '', refUrl: '' }; // 已定妆则跳过
    }
    props.data.castNames = names;
    extractState.phase = 'done';
  } catch (e) { extractState.phase = 'error'; extractState.msg = String(e.message || e); }
}

// 给某角色生成定妆图
async function castOne(name) {
  const c = props.cast[name];
  if (!c || castPhase[name] === 'running') return;
  castPhase[name] = 'running';
  try {
    const taskId = await startTask('/api/image/reference', { desc: c.appearance });
    c.refUrl = await pollTask('/api/image/status', taskId, (d) => d.imageUrl, 24);
    castPhase[name] = 'done';
  } catch { castPhase[name] = 'error'; }
}

// 生成某分镜视频：有出场角色定妆图 → 多参考关键帧 + i2v；否则回退 t2v
async function genClip(s, i) {
  if (clips[i] && clips[i].phase === 'running') return;
  try {
    const names = sceneChars.value[i] || [];
    const refUrls = names.map((n) => props.cast[n]?.refUrl).filter(Boolean);
    if (refUrls.length) {
      clips[i] = { phase: 'running', msg: t('clipFrame', { n: refUrls.length }) };
      const sceneDesc = [s.location, s.time, s.imagePrompt].filter(Boolean).join('，');
      const kf = await startTask('/api/image/keyframe', { refUrls, sceneDesc });
      const keyframe = await pollTask('/api/image/status', kf, (d) => d.imageUrl, 24);
      clips[i] = { phase: 'running', msg: t('clipVideo2') };
      const v = await startTask('/api/clip/i2v', { imgUrl: keyframe, prompt: s.action });
      const url = await pollTask('/api/clip/status', v, (d) => d.videoUrl);
      s.videoUrl = url; // 持久化到分镜,刷新不丢
      clips[i] = { phase: 'done', url };
    } else {
      clips[i] = { phase: 'running', msg: t('clipVideo') };
      const prompt = [s.imagePrompt, s.action].filter(Boolean).join('。');
      const v = await startTask('/api/clip/start', { prompt });
      const url = await pollTask('/api/clip/status', v, (d) => d.videoUrl);
      s.videoUrl = url; // 持久化到分镜,刷新不丢
      clips[i] = { phase: 'done', url };
    }
  } catch (e) { clips[i] = { phase: 'error', msg: String(e.message || e) }; }
}

// 一键成片：自主跑 选角 → 全员定妆 → 逐镜生成(前 CAP 镜)。各步失败已各自兜底,整体继续。
async function autoProduce() {
  if (produceState.running) return;
  produceState.running = true;
  try {
    if (!castNames.value.length) await autoCast();
    for (const name of castNames.value) {
      if (!props.cast[name]?.refUrl) await castOne(name);
    }
    const scenes = props.data.scenes || [];
    const n = Math.min(scenes.length, PRODUCE_CAP);
    produceState.total = n; produceState.done = 0;
    for (let i = 0; i < n; i++) {
      if (!scenes[i].videoUrl) await genClip(scenes[i], i);
      produceState.done = i + 1;
    }
  } finally { produceState.running = false; }
}

// 拼整集：把已生成的分镜视频合成一条竖屏成片(烧字幕)
async function assembleEp() {
  if (assembleState.phase === 'running') return;
  const items = (props.data.scenes || [])
    .filter((s) => s.videoUrl)
    .map((s) => ({ videoUrl: s.videoUrl, subtitle: s.caption || s.dialogue || '' }));
  if (!items.length) { assembleState.phase = 'error'; assembleState.msg = t('noClips'); return; }
  assembleState.phase = 'running'; assembleState.msg = t('assembling');
  try {
    const r = await (await fetch('/api/episode/assemble', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
    })).json();
    if (!r.ok) throw new Error(r.error);
    const url = await pollTask('/api/episode/assemble/status', r.data.jobId, (d) => d.videoUrl, 60);
    assembleState.phase = 'done'; assembleState.url = url;
    props.data.episodeVideo = url; // 持久化
  } catch (e) { assembleState.phase = 'error'; assembleState.msg = String(e.message || e); }
}
</script>

<template>
  <div class="screenplay">
    <div class="ep">🎬 {{ data.episodeTitle }} <span class="cnt">{{ t('shotsCount', { n: (data.scenes || []).length }) }}</span></div>

    <!-- 选角 + 定妆库 -->
    <div class="castbox">
      <div class="casthead">
        <span class="ct">{{ t('lookbook') }} <em>{{ t('lookbookHint') }}</em></span>
        <div class="casthead-btns">
          <button class="castbtn" :disabled="extractState.phase === 'running' || produceState.running" @click="autoCast">
            <template v-if="extractState.phase === 'running'"><span class="spin" /> {{ extractState.msg }}</template>
            <template v-else-if="castNames.length">{{ t('recast') }}</template>
            <template v-else>{{ t('autoCast') }}</template>
          </button>
          <button class="produce" :disabled="produceState.running" @click="autoProduce" :title="t('produceHint', { cap: PRODUCE_CAP })">
            <template v-if="produceState.running"><span class="spin" /> {{ t('producing', { done: produceState.done, total: produceState.total }) }}</template>
            <template v-else>{{ t('autoProduce') }}</template>
          </button>
          <button class="assemble" :disabled="assembleState.phase === 'running'" @click="assembleEp">
            <template v-if="assembleState.phase === 'running'"><span class="spin" /> {{ t('assembling') }}</template>
            <template v-else>{{ t('assembleBtn') }}</template>
          </button>
        </div>
      </div>
      <span v-if="assembleState.phase === 'error'" class="verr">✕ {{ assembleState.msg }}</span>
      <div class="producehint">{{ t('produceHint', { cap: PRODUCE_CAP }) }}</div>
      <span v-if="extractState.phase === 'error'" class="verr">✕ {{ extractState.msg }}</span>

      <div v-if="castNames.length" class="castlist">
        <div v-for="name in castNames" :key="name" class="charcard">
          <div class="cname">{{ name }}<em v-if="cast[name] && cast[name].refUrl" class="ok"> {{ t('styled') }}</em></div>
          <img v-if="cast[name] && cast[name].refUrl" :src="cast[name].refUrl" class="charimg" :alt="name" />
          <textarea v-else-if="cast[name]" v-model="cast[name].appearance" class="cdesc" rows="3" />
          <button class="cbtn" :disabled="castPhase[name] === 'running'" @click="castOne(name)">
            <template v-if="castPhase[name] === 'running'"><span class="spin" /> {{ t('styling') }}</template>
            <template v-else-if="cast[name] && cast[name].refUrl">{{ t('restyle') }}</template>
            <template v-else>{{ t('genLook') }}</template>
          </button>
          <span v-if="castPhase[name] === 'error'" class="verr">{{ t('castFailRetry') }}</span>
        </div>
      </div>
    </div>

    <div class="board">
      <div v-for="(s, i) in data.scenes" :key="i" class="shot">
        <div class="shot-head">
          <span class="no">{{ s.no || i + 1 }}</span>
          <span class="loc">{{ s.location }}<em v-if="s.time"> · {{ s.time }}</em></span>
          <span class="lens">{{ s.shot }}</span>
        </div>
        <video v-if="(clips[i] && clips[i].phase === 'done') || s.videoUrl" class="vid" :src="(clips[i] && clips[i].url) || s.videoUrl" controls playsinline />
        <div v-else class="frame">🖼 {{ s.imagePrompt }}</div>
        <div v-if="(sceneChars[i] || []).length" class="chips">
          <span v-for="n in sceneChars[i]" :key="n" class="chip" :class="{ cast: cast[n] && cast[n].refUrl }">{{ n }}</span>
        </div>
        <div class="action">{{ s.action }}</div>
        <div v-if="s.dialogue" class="dia">「{{ s.dialogue }}」</div>
        <div v-if="s.caption" class="cap">{{ t('subtitle') }}{{ s.caption }}</div>
        <div class="vbar">
          <button class="vbtn" :disabled="clips[i] && clips[i].phase === 'running'" @click="genClip(s, i)">
            <template v-if="clips[i] && clips[i].phase === 'running'"><span class="spin" /> {{ clips[i].msg }}</template>
            <template v-else-if="(clips[i] && clips[i].phase === 'done') || s.videoUrl">{{ t('regen') }}</template>
            <template v-else>{{ t('genVideo') }}<em v-if="(sceneChars[i] || []).some((n) => cast[n] && cast[n].refUrl)" class="lock"> {{ t('lockCast') }}</em></template>
          </button>
          <span v-if="clips[i] && clips[i].phase === 'error'" class="verr">✕ {{ clips[i].msg }}</span>
        </div>
      </div>
    </div>

    <!-- 拼接后的整集成片 -->
    <div v-if="assembleState.url || data.episodeVideo" class="finalep">
      <div class="finaltitle">🎞 {{ t('finalEpisode') }}</div>
      <video class="finalvid" :src="assembleState.url || data.episodeVideo" controls playsinline />
    </div>
  </div>
</template>

<style scoped>
.ep { font-size: 15px; font-weight: 700; color: #221d3a; margin-bottom: 12px; }
.cnt { font-size: 12px; color: #9aa3b2; font-weight: 400; margin-left: 8px; }
/* 定妆库 */
.castbox { border: 1px dashed #c9c2ff; background: #faf9ff; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
.casthead { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.ct { font-size: 13px; font-weight: 700; color: #5a3cff; }
.ct em { font-weight: 400; color: #9aa3b2; font-style: normal; font-size: 12px; }
.castbtn { border: 1px solid #6a5cff; background: #6a5cff; color: #fff; border-radius: 7px; font-size: 12.5px; padding: 6px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.castbtn:disabled { opacity: .7; cursor: default; }
.casthead-btns { display: flex; gap: 8px; }
.produce { border: none; background: linear-gradient(90deg, #6a5cff, #a15cff); color: #fff; border-radius: 7px; font-size: 12.5px; font-weight: 700; padding: 6px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; box-shadow: 0 2px 8px rgba(106,92,255,.3); }
.produce:disabled { opacity: .8; cursor: default; }
.producehint { font-size: 11.5px; color: #9aa3b2; margin-top: 6px; }
.assemble { border: 1px solid #2ea66b; background: #fff; color: #2ea66b; border-radius: 7px; font-size: 12.5px; font-weight: 700; padding: 6px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.assemble:hover:not(:disabled) { background: #e8f7ef; }
.assemble:disabled { opacity: .8; cursor: default; }
.finalep { margin-top: 14px; padding: 12px; border: 1px solid #cdebd9; background: #f3fbf6; border-radius: 10px; }
.finaltitle { font-size: 13px; font-weight: 700; color: #2ea66b; margin-bottom: 8px; }
.finalvid { width: 260px; max-width: 100%; border-radius: 8px; display: block; background: #000; }
.castlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
.charcard { border: 1px solid #e9eaf1; border-radius: 9px; background: #fff; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.cname { font-size: 12.5px; font-weight: 700; color: #2a2f3a; }
.cname .ok { color: #2ea66b; font-weight: 400; font-style: normal; font-size: 11px; }
.charimg { width: 100%; border-radius: 6px; border: 1px solid #e9eaf1; }
.cdesc { width: 100%; box-sizing: border-box; border: 1px solid #e3e0f5; border-radius: 6px; padding: 6px; font-size: 11.5px; resize: vertical; font-family: inherit; }
.cbtn { border: 1px solid #6a5cff; color: #6a5cff; background: #fff; border-radius: 6px; font-size: 11.5px; padding: 5px 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; }
.cbtn:disabled { opacity: .7; cursor: default; }
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
.chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px 10px 0; }
.chip { font-size: 10.5px; color: #8a8fa0; background: #f1f0f8; border-radius: 4px; padding: 1px 6px; }
.chip.cast { color: #2ea66b; background: #e8f7ef; }
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
