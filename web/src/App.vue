<script setup>
import { ref, reactive, onMounted } from 'vue';
import HookCard from './components/HookCard.vue';
import OutlineCard from './components/OutlineCard.vue';
import ChapterCard from './components/ChapterCard.vue';
import QcCard from './components/QcCard.vue';
import ScreenplayCard from './components/ScreenplayCard.vue';

// 多类型示例（点了同时设好题材）
const PRESETS = [
  { genre: '悬疑', text: '县城旧档案馆深夜来电，一桩二十年前结案的命案录音重新响起。' },
  { genre: '言情', text: '离婚那天，前夫的双胞胎弟弟当众把婚戒重新戴回我手上。' },
  { genre: '玄幻', text: '我捡到一枚生锈铜钱，每花掉一文，就有一个仇人离奇暴毙。' },
  { genre: '科幻', text: '公司给每位员工植入情绪芯片，今早我的芯片开始替我说真话。' },
  { genre: '都市', text: '我把外卖送到顶楼总裁办公室，他抬头说：你终于肯回来了。' },
];

const genres = ref(['悬疑', '言情', '玄幻', '科幻', '都市', '历史', '恐怖', '甜宠']);
const lengths = ref(['短篇', '中篇', '长篇']);
const genre = ref('悬疑');
const length = ref('短篇');

const idea = ref(PRESETS[0].text);
const running = ref(false);
const errorMsg = ref('');

const stages = reactive([
  { key: 'hook', label: '钩子选题', status: 'idle' },
  { key: 'outline', label: '双线大纲', status: 'idle' },
  { key: 'chapter', label: '章节写作', status: 'idle' },
  { key: 'qc', label: '卡点质检', status: 'idle' },
  { key: 'screenplay', label: '短剧分镜', status: 'idle' },
]);

const r = reactive({ hook: null, outline: null, qcHistory: [], chapters: [], screenplay: null, rewriting: false });
const nextLoading = ref(false);
const dramaLoading = ref(false);

onMounted(async () => {
  try {
    const o = await (await fetch('/api/options')).json();
    if (o.genres?.length) genres.value = o.genres;
    if (o.lengths?.length) lengths.value = o.lengths;
  } catch { /* 用默认 */ }
});

function pickPreset(p) { idea.value = p.text; genre.value = p.genre; }
function setStage(key, s) { const x = stages.find((v) => v.key === key); if (x) x.status = s; }

function reset() {
  errorMsg.value = '';
  stages.forEach((s) => (s.status = 'idle'));
  Object.assign(r, { hook: null, outline: null, qcHistory: [], chapters: [], screenplay: null, rewriting: false });
}

async function run() {
  if (running.value || !idea.value.trim()) return;
  reset();
  running.value = true;
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
  finally { running.value = false; }
}

function handleEvent(chunk) {
  const ev = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
  const dataLine = chunk.match(/^data: (.+)$/m)?.[1];
  if (!ev || !dataLine) return;
  const p = JSON.parse(dataLine);
  if (ev === 'step') {
    setStage(p.step, p.status);
    if (p.step === 'chapter' && p.status === 'running') r.rewriting = !!p.label?.includes('重写');
    if (p.status !== 'done' || p.data === undefined) return;
    switch (p.step) {
      case 'hook': r.hook = p.data; break;
      case 'outline': r.outline = p.data; break;
      case 'chapter': {
        const title = r.outline?.chapters?.[0]?.title || '第一章';
        if (p.rewritten) { if (r.chapters[0]) { r.chapters[0].text = p.data; r.chapters[0].rewritten = true; } r.rewriting = false; }
        else r.chapters = [{ no: 1, title, text: p.data, rewritten: false }];
        break;
      }
      case 'qc': r.qcHistory.push(p.data); break;
      case 'screenplay': r.screenplay = p.data; break;
    }
  } else if (ev === 'done') {
    if (p.qcHistory) r.qcHistory = p.qcHistory;
    if (p.screenplay) r.screenplay = p.screenplay;
  } else if (ev === 'error') errorMsg.value = p.error;
}

const totalChapters = () => r.outline?.chapters?.length || 0;

async function nextChapter() {
  if (nextLoading.value) return;
  nextLoading.value = true;
  try {
    const res = await fetch('/api/next-chapter', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: r.hook, outline: r.outline, genre: genre.value, length: length.value, chapters: r.chapters.map((c) => c.text) }),
    });
    const j = await res.json();
    if (j.ok) r.chapters.push({ no: j.data.no, title: j.data.title, text: j.data.chapter, rewritten: false });
    else errorMsg.value = j.error;
  } catch (e) { errorMsg.value = String(e.message || e); }
  finally { nextLoading.value = false; }
}

async function adaptDrama() {
  if (dramaLoading.value) return;
  dramaLoading.value = true;
  try {
    const res = await fetch('/api/adapt-drama', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: r.hook, outline: r.outline, genre: genre.value, length: length.value, chapters: r.chapters.map((c) => c.text) }),
    });
    const j = await res.json();
    if (j.ok) r.screenplay = j.data;
    else errorMsg.value = j.error;
  } catch (e) { errorMsg.value = String(e.message || e); }
  finally { dramaLoading.value = false; }
}
</script>

<template>
  <div class="app">
    <header class="hero">
      <div class="brand"><h1>烬渊 · 创作工坊</h1><span class="badge">内置签约作者方法论</span></div>
      <p class="sub">AI Showrunner — 多智能体网文 / 短剧创作流水线 · Powered by Qwen</p>
    </header>

    <!-- 题材 + 篇幅 -->
    <div class="controls">
      <div class="ctl">
        <label>题材</label>
        <div class="chips">
          <button v-for="g in genres" :key="g" class="chip" :class="{ on: genre === g }" @click="genre = g">{{ g }}</button>
        </div>
      </div>
      <div class="ctl">
        <label>篇幅</label>
        <div class="chips">
          <button v-for="l in lengths" :key="l" class="chip" :class="{ on: length === l }" @click="length = l">{{ l }}</button>
        </div>
      </div>
    </div>

    <section class="input-bar">
      <textarea v-model="idea" rows="2" placeholder="输入一句话创意…" />
      <button class="go" :disabled="running" @click="run">{{ running ? '编排中…' : '▶ 一键生成' }}</button>
    </section>
    <div class="presets">
      <span class="pl">试试：</span>
      <button v-for="(p, i) in PRESETS" :key="i" class="preset" @click="pickPreset(p)">
        <em>{{ p.genre }}</em>{{ p.text.slice(0, 14) }}…
      </button>
    </div>

    <section class="stepper">
      <template v-for="(s, i) in stages" :key="s.key">
        <div class="node" :class="s.status">
          <div class="circle"><span v-if="s.status === 'done'">✓</span><span v-else>{{ i + 1 }}</span></div>
          <div class="nl">{{ s.label }}</div>
        </div>
        <div v-if="i < stages.length - 1" class="rail" :class="{ on: stages[i + 1].status !== 'idle' }" />
      </template>
    </section>

    <p v-if="errorMsg" class="err">⚠ {{ errorMsg }}</p>

    <section class="results">
      <article v-if="r.hook" class="card">
        <h3><b>①</b> 钩子选题器 <span class="meta-tag">{{ genre }} · {{ length }}</span></h3>
        <HookCard :data="r.hook" />
      </article>

      <article v-if="r.outline" class="card">
        <h3><b>②</b> 双线大纲引擎</h3>
        <OutlineCard :data="r.outline" />
      </article>

      <article v-if="r.chapters.length" class="card">
        <h3><b>③</b> 章节写手 <span v-if="r.rewriting" class="mini">♻ 按质检重写中…</span>
          <span class="meta-tag">{{ r.chapters.length }} / {{ totalChapters() }} 章</span></h3>
        <div v-for="(c, i) in r.chapters" :key="i" class="chapter-blk">
          <div class="chapter-title">第 {{ c.no }} 章 · {{ c.title }}</div>
          <ChapterCard :text="c.text" :rewritten="c.rewritten" />
        </div>
        <button v-if="r.chapters.length < totalChapters()" class="more" :disabled="nextLoading" @click="nextChapter">
          {{ nextLoading ? '续写中…' : `＋ 继续写第 ${r.chapters.length + 1} 章` }}
        </button>
      </article>

      <article v-if="r.qcHistory.length" class="card">
        <h3><b>④</b> 卡点质检官 <span class="moat">护城河 · 拒稿硬伤检测 → 自我修复</span></h3>
        <QcCard :history="r.qcHistory" />
      </article>

      <article v-if="r.screenplay" class="card">
        <h3><b>⑤</b> 短剧改编官
          <button v-if="r.chapters.length > 1" class="redrama" :disabled="dramaLoading" @click="adaptDrama">
            {{ dramaLoading ? '改编中…' : `🎬 用全部 ${r.chapters.length} 章重新改编` }}
          </button>
        </h3>
        <ScreenplayCard :data="r.screenplay" />
      </article>

      <div v-if="!r.hook && !running" class="empty">选题材 + 篇幅，输入一句话创意，点「一键生成」→ 看 5 个 AI Agent 把它变成可拍的短剧</div>
    </section>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.app { max-width: 1080px; margin: 0 auto; padding: 30px 20px 70px; color: #1c2230; font-family: -apple-system, "PingFang SC", system-ui, sans-serif; }
.brand { display: flex; align-items: center; gap: 12px; }
.hero h1 { font-size: 28px; margin: 0; letter-spacing: 2px; background: linear-gradient(90deg, #6a5cff, #b15cff); -webkit-background-clip: text; background-clip: text; color: transparent; }
.badge { font-size: 12px; color: #6a5cff; border: 1px solid #cfc6ff; border-radius: 20px; padding: 3px 10px; }
.sub { color: #6b7280; margin: 6px 0 0; font-size: 14px; }
.controls { display: flex; gap: 26px; margin: 20px 0 4px; flex-wrap: wrap; }
.ctl { display: flex; align-items: center; gap: 10px; }
.ctl label { font-size: 13px; color: #8a8fa3; white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #f3f2fb; color: #6a6f80; padding: 5px 12px; border-radius: 16px; font-size: 13px; border: 1px solid transparent; }
.chip.on { background: #efeaff; color: #5a3cff; border-color: #cfc6ff; font-weight: 600; }
.input-bar { display: flex; gap: 12px; margin: 12px 0 8px; }
textarea { flex: 1; padding: 12px 14px; border: 1px solid #d7dbe3; border-radius: 10px; font-size: 15px; resize: vertical; font-family: inherit; }
.go { padding: 0 26px; border: none; border-radius: 10px; cursor: pointer; background: linear-gradient(135deg, #6a5cff, #9b5cff); color: #fff; font-size: 15px; font-weight: 600; white-space: nowrap; }
.go:disabled { opacity: .5; cursor: default; }
.presets { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pl { font-size: 12px; color: #9aa3b2; }
.preset { background: #f3f2fb; color: #6a6f80; padding: 5px 10px; border-radius: 16px; font-size: 12px; }
.preset em { font-style: normal; color: #5a3cff; background: #e9e6ff; border-radius: 8px; padding: 1px 6px; margin-right: 6px; font-size: 11px; }
.preset:hover { background: #e9e6ff; }
.stepper { display: flex; align-items: center; margin: 22px 0 8px; }
.node { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.circle { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #eceef4; color: #9aa3b2; font-weight: 700; font-size: 14px; transition: .3s; }
.node.running .circle { background: #6a5cff; color: #fff; box-shadow: 0 0 0 5px rgba(106,92,255,.18); animation: pulse 1.1s infinite; }
.node.done .circle { background: #36b37e; color: #fff; }
.nl { font-size: 12px; color: #8a93a3; }
.node.running .nl, .node.done .nl { color: #2a2f3a; font-weight: 600; }
.rail { flex: 1; height: 3px; background: #eceef4; margin: 0 6px 20px; border-radius: 2px; }
.rail.on { background: linear-gradient(90deg, #36b37e, #6a5cff); }
@keyframes pulse { 50% { opacity: .55; } }
.err { color: #c0392b; background: #fdecea; padding: 10px 14px; border-radius: 8px; }
.results { display: grid; gap: 16px; margin-top: 18px; }
.card { border: 1px solid #e9eaf1; border-radius: 14px; padding: 18px 20px; background: #fff; box-shadow: 0 2px 14px rgba(40,30,90,.04); }
.card h3 { margin: 0 0 14px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.card h3 b { color: #6a5cff; }
.meta-tag { font-size: 12px; color: #7a6fff; background: #f1eeff; padding: 2px 9px; border-radius: 12px; font-weight: 400; }
.mini { font-size: 12px; color: #2f7d4f; font-weight: 400; }
.moat { font-size: 11px; color: #c0392b; background: #fdecec; padding: 2px 10px; border-radius: 6px; font-weight: 600; margin-left: auto; }
.chapter-blk { margin-bottom: 14px; }
.chapter-title { font-size: 13px; font-weight: 700; color: #5a3cff; margin-bottom: 8px; }
.more, .redrama { border: 1px dashed #b9b3e6; background: #faf9ff; color: #5a3cff; border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
.more { width: 100%; margin-top: 4px; }
.redrama { margin-left: auto; padding: 6px 12px; }
.more:disabled, .redrama:disabled { opacity: .5; cursor: default; }
.empty { text-align: center; color: #aab1bf; padding: 50px 20px; font-size: 15px; }
</style>
