<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import HookCard from './components/HookCard.vue';
import OutlineCard from './components/OutlineCard.vue';
import QcCard from './components/QcCard.vue';
import ScreenplayCard from './components/ScreenplayCard.vue';

const PRESETS = [
  { genre: '悬疑', text: '县城旧档案馆深夜来电，一桩二十年前结案的命案录音重新响起。' },
  { genre: '言情', text: '离婚那天，前夫的双胞胎弟弟当众把婚戒重新戴回我手上。' },
  { genre: '玄幻', text: '我捡到一枚生锈铜钱，每花掉一文，就有一个仇人离奇暴毙。' },
  { genre: '科幻', text: '公司给每位员工植入情绪芯片，今早我的芯片开始替我说真话。' },
  { genre: '都市', text: '我把外卖送到顶楼总裁办公室，他抬头说：你终于肯回来了。' },
];
const GENRES = ['悬疑', '言情', '玄幻', '科幻', '都市', '历史', '恐怖', '甜宠'];
const LENGTHS = ['短篇', '中篇', '长篇'];

const genres = ref(GENRES);
const lengths = ref(LENGTHS);
const genre = ref('悬疑');
const length = ref('短篇');
const idea = ref(PRESETS[0].text);

const running = ref(false);
const errorMsg = ref('');
const liveHook = ref(null);
const liveOutline = ref(null);
const stageMsg = ref('');

// ===== 本地持久化（localStorage）=====
const STORE = 'cw_projects';
const projects = ref([]);          // 历史作品列表（全量对象）
const proj = ref(null);            // 当前作品

function loadStore() {
  try { projects.value = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { projects.value = []; }
}
function persist() {
  if (!proj.value) return;
  proj.value.updatedAt = Date.now();
  const i = projects.value.findIndex((p) => p.id === proj.value.id);
  if (i >= 0) projects.value[i] = proj.value; else projects.value.unshift(proj.value);
  try { localStorage.setItem(STORE, JSON.stringify(projects.value)); } catch { /* 配额满则忽略 */ }
}
onMounted(() => {
  loadStore();
  fetch('/api/options').then((r) => r.json()).then((o) => {
    if (o.genres?.length) genres.value = o.genres;
    if (o.lengths?.length) lengths.value = o.lengths;
  }).catch(() => {});
});
watch(proj, persist, { deep: true });

function openProject(p) { proj.value = JSON.parse(JSON.stringify(p)); genre.value = p.genre; length.value = p.length; idea.value = p.idea; }
function newProject() { proj.value = null; liveHook.value = null; liveOutline.value = null; errorMsg.value = ''; }
function delProject(id) {
  projects.value = projects.value.filter((p) => p.id !== id);
  localStorage.setItem(STORE, JSON.stringify(projects.value));
  if (proj.value?.id === id) newProject();
}
function pickPreset(p) { idea.value = p.text; genre.value = p.genre; }

const totalChapters = computed(() => proj.value?.outline?.chapters?.length || 0);
const rolling = computed(() => proj.value && proj.value.length !== '短篇'); // 中/长篇连载式，可无限续写
const canContinue = computed(() => rolling.value || (proj.value && proj.value.chapters.length < totalChapters.value));

// ===== 全流程生成 =====
async function run() {
  if (running.value || !idea.value.trim()) return;
  errorMsg.value = ''; liveHook.value = null; liveOutline.value = null; running.value = true; stageMsg.value = '';
  try {
    const res = await fetch('/api/pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: idea.value, genre: genre.value, length: length.value }),
    });
    if (!res.ok || !res.body) throw new Error('服务未就绪：请确认后端已启动且已配置 API Key');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() || '';
      for (const c of chunks) handleEvent(c);
    }
  } catch (e) { errorMsg.value = String(e.message || e); }
  finally { running.value = false; stageMsg.value = ''; }
}

function handleEvent(chunk) {
  const ev = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
  const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
  if (!ev || !dataLine) return;
  const p = JSON.parse(dataLine);
  if (ev === 'step') {
    if (p.label) stageMsg.value = `${p.label} · ${p.status === 'running' ? '进行中…' : '完成'}`;
    if (p.status === 'done' && p.step === 'hook') liveHook.value = p.data;
    if (p.status === 'done' && p.step === 'outline') liveOutline.value = p.data;
  } else if (ev === 'done') {
    const fc = p.firstChapter;
    proj.value = {
      id: 'p' + Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
      title: p.hook?.titles?.[0] || p.idea?.slice(0, 12) || '未命名',
      idea: p.idea, genre: p.genre, length: p.length, hook: p.hook, outline: p.outline,
      chapters: [{ no: fc.no, title: fc.title, draft: fc.draft, text: fc.chapter, qcHistory: fc.qcHistory, editing: false }],
      episodes: p.firstEpisode ? [p.firstEpisode] : [],
    };
  } else if (ev === 'error') errorMsg.value = p.error;
}

// ===== 续写 / 编辑 / 重写 / 改编 =====
const busy = reactive({ next: false, rewrite: -1, episode: -1 });

async function nextChapter() {
  if (busy.next) return; busy.next = true;
  try {
    const j = await post('/api/next-chapter', { ...ctx(), chapters: chapTexts() });
    if (j.ok) proj.value.chapters.push({ no: j.data.no, title: j.data.title, draft: j.data.draft, text: j.data.chapter, qcHistory: j.data.qcHistory, editing: false });
    else errorMsg.value = j.error;
  } finally { busy.next = false; }
}
async function rewriteWith(i, instruction) {
  if (busy.rewrite >= 0 || !instruction.trim()) return; busy.rewrite = i;
  try {
    const j = await post('/api/rewrite-chapter', { ...ctx(), chapters: chapTexts(), index: i, instruction });
    if (j.ok) { proj.value.chapters[i].text = j.data.chapter; proj.value.chapters[i].qcHistory = j.data.qcHistory; proj.value.chapters[i].instruction = ''; }
    else errorMsg.value = j.error;
  } finally { busy.rewrite = -1; }
}
async function adaptOne(i) {
  if (busy.episode >= 0) return; busy.episode = i;
  try {
    const c = proj.value.chapters[i];
    const j = await post('/api/adapt-episode', { ...ctx(), chapter: c.text, chapterNo: c.no, chapterTitle: c.title });
    if (j.ok) {
      const ix = proj.value.episodes.findIndex((e) => e.chapterNo === c.no);
      if (ix >= 0) proj.value.episodes[ix] = j.data; else proj.value.episodes.push(j.data);
    } else errorMsg.value = j.error;
  } finally { busy.episode = -1; }
}
function hasEpisode(no) { return proj.value?.episodes?.some((e) => e.chapterNo === no); }

function ctx() { return { hook: proj.value.hook, outline: proj.value.outline, genre: proj.value.genre, length: proj.value.length }; }
function chapTexts() { return proj.value.chapters.map((c) => c.text); }
async function post(url, body) {
  try { return await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}
function fmtDate(t) { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
</script>

<template>
  <div class="app">
    <header class="hero">
      <div class="brand"><h1>烬渊 · 创作工坊</h1><span class="badge">内置签约作者方法论</span></div>
      <p class="sub">AI Showrunner — 多智能体网文 / 短剧创作工作台 · Powered by Qwen</p>
    </header>

    <!-- 历史作品 -->
    <div v-if="projects.length" class="history">
      <span class="hl">历史作品：</span>
      <button v-for="p in projects" :key="p.id" class="hitem" :class="{ on: proj && proj.id === p.id }" @click="openProject(p)">
        {{ p.title }} <em>{{ p.chapters.length }}章 · {{ fmtDate(p.updatedAt) }}</em>
        <span class="del" @click.stop="delProject(p.id)">×</span>
      </button>
      <button class="hnew" @click="newProject">＋ 新建</button>
    </div>

    <!-- 创建区（无当前作品时显示输入） -->
    <template v-if="!proj">
      <div class="controls">
        <div class="ctl"><label>题材</label><div class="chips">
          <button v-for="g in genres" :key="g" class="chip" :class="{ on: genre === g }" @click="genre = g">{{ g }}</button>
        </div></div>
        <div class="ctl"><label>篇幅</label><div class="chips">
          <button v-for="l in lengths" :key="l" class="chip" :class="{ on: length === l }" @click="length = l">{{ l }}</button>
        </div></div>
      </div>
      <section class="input-bar">
        <textarea v-model="idea" rows="2" placeholder="输入一句话创意…" />
        <button class="go" :disabled="running" @click="run">{{ running ? '编排中…' : '▶ 一键生成' }}</button>
      </section>
      <div class="presets">
        <span class="pl">试试：</span>
        <button v-for="(p, i) in PRESETS" :key="i" class="preset" @click="pickPreset(p)"><em>{{ p.genre }}</em>{{ p.text.slice(0, 14) }}…</button>
      </div>

      <p v-if="errorMsg" class="err">⚠ {{ errorMsg }}</p>
      <div v-if="running" class="running-box">
        <div class="spin" /> <span>{{ stageMsg || '编排中…' }}</span>
        <div v-if="liveHook" class="live"><b>选题：</b>{{ liveHook.oneLineHook }}</div>
        <div v-if="liveOutline" class="live"><b>大纲：</b>{{ liveOutline.logline }}</div>
      </div>
      <div v-if="!running" class="empty">选题材 + 篇幅，输入一句话创意，点「一键生成」→ 5 个 AI Agent 接力出网文 + 短剧</div>
    </template>

    <!-- 工作台（有当前作品时显示结果 + 可编辑/续写/改编） -->
    <template v-else>
      <div class="proj-head">
        <div><h2>{{ proj.title }}</h2><span class="ptag">{{ proj.genre }} · {{ proj.length }} · {{ proj.chapters.length }}{{ rolling ? '章(连载中)' : '/' + totalChapters + '章' }} · {{ proj.episodes.length }}集</span></div>
        <button class="back" @click="newProject">＋ 写新作品</button>
      </div>
      <p v-if="errorMsg" class="err">⚠ {{ errorMsg }}</p>

      <article class="card"><h3><b>①</b> 钩子选题</h3><HookCard :data="proj.hook" /></article>
      <article class="card"><h3><b>②</b> 双线大纲</h3><OutlineCard :data="proj.outline" /></article>

      <!-- 章节（每章：可编辑 + 质检 + 按意见重写 + 改编一集）-->
      <article class="card">
        <h3><b>③</b> 章节正文 <span class="meta-tag">{{ rolling ? `已写 ${proj.chapters.length} 章 · 连载中(首卷规划 ${totalChapters})` : `${proj.chapters.length} / ${totalChapters} 章` }}</span></h3>
        <div v-for="(c, i) in proj.chapters" :key="i" class="chapter-blk">
          <div class="ch-head">
            <span class="ch-title">第 {{ c.no }} 章 · {{ c.title }}</span>
            <button class="link" @click="c.editing = !c.editing">{{ c.editing ? '完成编辑' : '✎ 手动编辑' }}</button>
            <button class="link" :disabled="busy.episode === i || hasEpisode(c.no)" @click="adaptOne(i)">
              {{ busy.episode === i ? '改编中…' : hasEpisode(c.no) ? '✓ 已改成一集' : '🎬 改成一集短剧' }}
            </button>
          </div>
          <textarea v-if="c.editing" v-model="c.text" class="ch-edit" rows="10" />
          <div v-else class="ch-text">{{ c.text }}</div>

          <QcCard v-if="c.qcHistory && c.qcHistory.length" :history="c.qcHistory" />

          <div class="rewrite">
            <input v-model="c.instruction" class="rw-input" placeholder="按你的意见重写本章（如：加快节奏 / 让女主更主动 / 把反转提前）…" />
            <button class="rw-btn" :disabled="busy.rewrite === i" @click="rewriteWith(i, c.instruction || '')">
              {{ busy.rewrite === i ? '重写中…' : '按意见重写' }}
            </button>
          </div>
        </div>
        <button v-if="canContinue" class="more" :disabled="busy.next" @click="nextChapter">
          {{ busy.next ? '续写中（含质检）…' : `＋ 继续写第 ${proj.chapters.length + 1} 章（自动质检）` }}
        </button>
      </article>

      <!-- 短剧（逐集累加）-->
      <article v-if="proj.episodes.length" class="card">
        <h3><b>④</b> 短剧分集 <span class="meta-tag">已改 {{ proj.episodes.length }} 集</span></h3>
        <div v-for="(ep, i) in proj.episodes" :key="i" class="ep-blk">
          <div class="ep-label">第 {{ ep.chapterNo }} 集（对应第 {{ ep.chapterNo }} 章）</div>
          <ScreenplayCard :data="ep" />
        </div>
        <p class="ep-hint">每写一章可单独「改成一集」，分集累加，旧集不会被覆盖。</p>
      </article>
    </template>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.app { max-width: 1080px; margin: 0 auto; padding: 28px 20px 70px; color: #1c2230; font-family: -apple-system, "PingFang SC", system-ui, sans-serif; }
.brand { display: flex; align-items: center; gap: 12px; }
.hero h1 { font-size: 28px; margin: 0; letter-spacing: 2px; background: linear-gradient(90deg, #6a5cff, #b15cff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.badge { font-size: 12px; color: #6a5cff; border: 1px solid #cfc6ff; border-radius: 20px; padding: 3px 10px; }
.sub { color: #6b7280; margin: 6px 0 0; font-size: 14px; }
.history { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 18px 0 4px; padding-bottom: 12px; border-bottom: 1px solid #eef0f6; }
.hl { font-size: 12px; color: #9aa3b2; }
.hitem { background: #f5f5fb; border: 1px solid transparent; color: #4a5060; padding: 5px 10px; border-radius: 8px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.hitem.on { background: #efeaff; border-color: #cfc6ff; color: #5a3cff; }
.hitem em { font-style: normal; color: #9aa3b2; font-size: 11px; }
.del { color: #c0b9d6; font-weight: 700; padding: 0 2px; }
.del:hover { color: #c0392b; }
.hnew { background: #efeaff; color: #5a3cff; border-radius: 8px; padding: 5px 12px; font-size: 12px; font-weight: 600; }
.controls { display: flex; gap: 26px; margin: 18px 0 4px; flex-wrap: wrap; }
.ctl { display: flex; align-items: center; gap: 10px; }
.ctl label { font-size: 13px; color: #8a8fa3; white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #f3f2fb; color: #6a6f80; padding: 5px 12px; border-radius: 16px; font-size: 13px; border: 1px solid transparent; }
.chip.on { background: #efeaff; color: #5a3cff; border-color: #cfc6ff; font-weight: 600; }
.input-bar { display: flex; gap: 12px; margin: 12px 0 8px; }
textarea { flex: 1; padding: 12px 14px; border: 1px solid #d7dbe3; border-radius: 10px; font-size: 15px; resize: vertical; font-family: inherit; }
.go { padding: 0 26px; border: none; border-radius: 10px; cursor: pointer; background: linear-gradient(135deg, #6a5cff, #9b5cff); color: #fff; font-size: 15px; font-weight: 600; white-space: nowrap; }
.go:disabled { opacity: .5; }
.presets { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pl { font-size: 12px; color: #9aa3b2; }
.preset { background: #f3f2fb; color: #6a6f80; padding: 5px 10px; border-radius: 16px; font-size: 12px; }
.preset em { font-style: normal; color: #5a3cff; background: #e9e6ff; border-radius: 8px; padding: 1px 6px; margin-right: 6px; font-size: 11px; }
.running-box { margin-top: 18px; padding: 16px; border: 1px solid #e1dbff; border-radius: 12px; background: #faf9ff; font-size: 14px; color: #5a5f72; }
.spin { display: inline-block; width: 14px; height: 14px; border: 2px solid #cfc6ff; border-top-color: #6a5cff; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: -2px; margin-right: 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
.live { font-size: 13px; color: #4a5060; margin-top: 8px; } .live b { color: #6a5cff; }
.err { color: #c0392b; background: #fdecea; padding: 10px 14px; border-radius: 8px; }
.empty { text-align: center; color: #aab1bf; padding: 50px 20px; font-size: 15px; }
.proj-head { display: flex; align-items: center; margin: 18px 0 10px; }
.proj-head h2 { margin: 0; font-size: 20px; }
.ptag { font-size: 12px; color: #7a6fff; }
.back { margin-left: auto; background: #efeaff; color: #5a3cff; border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600; }
.card { border: 1px solid #e9eaf1; border-radius: 14px; padding: 18px 20px; background: #fff; box-shadow: 0 2px 14px rgba(40,30,90,.04); margin-bottom: 16px; }
.card h3 { margin: 0 0 14px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.card h3 b { color: #6a5cff; }
.meta-tag { font-size: 12px; color: #7a6fff; background: #f1eeff; padding: 2px 9px; border-radius: 12px; font-weight: 400; }
.chapter-blk { padding: 12px 0; border-top: 1px solid #f0f0f6; }
.chapter-blk:first-of-type { border-top: none; }
.ch-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.ch-title { font-size: 14px; font-weight: 700; color: #5a3cff; }
.link { font-size: 12px; color: #6a6f80; background: #f3f2fb; padding: 3px 10px; border-radius: 8px; }
.link:hover { background: #e9e6ff; color: #5a3cff; }
.link:disabled { color: #2f7d4f; background: #e7f6ec; }
.ch-text { white-space: pre-wrap; line-height: 1.9; font-size: 14.5px; color: #2a2f3a; font-family: "Songti SC", serif; max-height: 320px; overflow: auto; padding: 4px 0; }
.ch-edit { width: 100%; line-height: 1.8; font-size: 14px; }
.rewrite { display: flex; gap: 8px; margin-top: 10px; }
.rw-input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 13px; }
.rw-btn { background: #6a5cff; color: #fff; border-radius: 8px; padding: 0 16px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.rw-btn:disabled { opacity: .5; }
.more { width: 100%; border: 1px dashed #b9b3e6; background: #faf9ff; color: #5a3cff; border-radius: 10px; padding: 10px; font-size: 13px; font-weight: 600; margin-top: 8px; }
.more:disabled { opacity: .6; }
.ep-blk { margin-bottom: 14px; }
.ep-label { font-size: 13px; font-weight: 700; color: #5a3cff; margin-bottom: 8px; }
.ep-hint { font-size: 12px; color: #9aa3b2; margin: 4px 0 0; }
</style>
