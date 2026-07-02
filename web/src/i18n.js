import { ref } from 'vue';

// ===== 语言状态（响应式）=====
function initLang() {
  try {
    const s = localStorage.getItem('cw_lang');
    if (s === 'zh' || s === 'en') return s;
  } catch { /* ignore */ }
  const n = (navigator.language || navigator.userLanguage || '').toLowerCase();
  return n.startsWith('zh') ? 'zh' : 'en';
}

export const lang = ref(initLang());

export function setLang(l) {
  if (l !== 'zh' && l !== 'en') return;
  lang.value = l;
  try { localStorage.setItem('cw_lang', l); } catch { /* ignore */ }
}

// ===== 题材 / 篇幅 显示映射（值本身保持中文原值，仅显示层翻译）=====
const GENRE_EN = {
  悬疑: 'Mystery', 言情: 'Romance', 玄幻: 'Fantasy', 科幻: 'Sci-Fi',
  都市: 'Urban', 历史: 'Historical', 恐怖: 'Horror', 甜宠: 'Sweet Romance',
};
const LENGTH_EN = { 短篇: 'Short', 中篇: 'Novella', 长篇: 'Serial' };

export function genreLabel(v) {
  return lang.value === 'en' ? (GENRE_EN[v] || v) : v;
}
export function lengthLabel(v) {
  return lang.value === 'en' ? (LENGTH_EN[v] || v) : v;
}
// 质检判定中英映射(过/拒/其它)
const VERDICT_EN = { '过': 'Pass', '拒': 'Reject' };
export function verdictLabel(v) {
  if (lang.value !== 'en') return v;
  return VERDICT_EN[v] || 'Revise';
}

// ===== 示例创意（题材 value 保持中文，文案按语言给）=====
const PRESETS = {
  zh: [
    { genre: '悬疑', text: '县城旧档案馆深夜来电，一桩二十年前结案的命案录音重新响起。' },
    { genre: '言情', text: '离婚那天，前夫的双胞胎弟弟当众把婚戒重新戴回我手上。' },
    { genre: '玄幻', text: '我捡到一枚生锈铜钱，每花掉一文，就有一个仇人离奇暴毙。' },
    { genre: '科幻', text: '公司给每位员工植入情绪芯片，今早我的芯片开始替我说真话。' },
    { genre: '都市', text: '我把外卖送到顶楼总裁办公室，他抬头说：你终于肯回来了。' },
  ],
  en: [
    { genre: '悬疑', text: 'A small-town archive gets a midnight call — the recording of a murder case closed twenty years ago starts playing again.' },
    { genre: '言情', text: "On our divorce day, my ex-husband's twin brother slid the wedding ring back onto my finger in front of everyone." },
    { genre: '玄幻', text: 'I found a rusty copper coin; every time I spend one, an enemy of mine drops dead in some bizarre way.' },
    { genre: '科幻', text: 'The company implants an emotion chip in every employee. This morning, mine started telling the truth for me.' },
    { genre: '都市', text: 'I delivered takeout to the CEO on the top floor. He looked up and said: You finally came back.' },
  ],
};
export function getPresets() {
  return PRESETS[lang.value] || PRESETS.zh;
}

// ===== 文案字典 =====
const dict = {
  zh: {
    // App 头部
    brand: '烬渊 · 创作工坊',
    badge: '内置签约作者方法论',
    sub: 'AI Showrunner — 多智能体网文 / 短剧创作工作台 · Powered by Qwen',
    // 历史作品
    worksLabel: '历史作品：',
    chSuffix: '章',
    newWork: '＋ 新建',
    // 输入区
    genre: '题材',
    length: '篇幅',
    ideaPlaceholder: '输入一句话创意…',
    orchestrating: '编排中…',
    generate: '▶ 一键生成',
    tryLabel: '试试：',
    stepRunning: '进行中…',
    stepDone: '完成',
    liveHook: '选题：',
    liveOutline: '大纲：',
    emptyHint: '选题材 + 篇幅，输入一句话创意，点「一键生成」→ 5 个 AI Agent 接力出网文 + 短剧',
    // 工作台
    episodeSuffix: '集',
    chSerializing: '章(连载中)',
    newWork2: '＋ 写新作品',
    cardHook: '钩子选题',
    cardOutline: '双线大纲',
    cardChapters: '章节正文',
    chaptersMetaRolling: '已写 {n} 章 · 连载中(首卷规划 {total})',
    chaptersMeta: '{n} / {total} 章',
    chLabel: '第 {no} 章 · ',
    editDone: '完成编辑',
    editStart: '✎ 手动编辑',
    adapting: '改编中…',
    adaptDone: '✓ 已改成一集',
    adaptDo: '🎬 改成一集短剧',
    busyRewrite: '正在按你的意见重写并重新质检…（约 1 分钟，请稍候，完成后下方评分会更新）',
    busyAdapt: '正在把本章改编成一集短剧…（约 30 秒）',
    rewritePlaceholder: '按你的意见重写本章（如：加快节奏 / 让女主更主动 / 把反转提前）…',
    rewriting: '重写中…',
    rewriteDo: '按意见重写',
    busyNext: '正在续写下一章并自动质检…（约 1 分钟，请稍候）',
    continuing: '续写中（含质检）…',
    continueDo: '＋ 继续写第 {n} 章（自动质检）',
    cardEpisodes: '短剧分集',
    episodesMeta: '已改 {n} 集',
    epLabel: '第 {no} 集（对应第 {no} 章）',
    epHint: '每写一章可单独「改成一集」，分集累加，旧集不会被覆盖。',
    // HookCard
    hookGenre: '题材 · ',
    // OutlineCard
    mainLine: '明线',
    hiddenLine: '暗线',
    reversals: '反转 · 物证可回溯',
    plantedEvidence: '🔎 埋设物证：',
    volumeArcs: '分卷主线（长篇连载）',
    volPrefix: '第{v}卷',
    firstVolBeats: '首卷章节卡点',
    chapterBeats: '章节卡点',
    paywall: '付费墙 · ',
    // QcCard
    qcInitial: '初检',
    qcRecheck: '复检',
    qcScore: '评分',
    scoreBasis: '评分依据',
    noFlags: '未命中任何拒稿硬伤 → 满分基线',
    flagsTitle: '🚩 质检命中的拒稿硬伤（初检）',
    sevPenalty: '{sev} · 扣 {penalty}',
    evidence: '证据：',
    fix: '✎ 改法：',
    resolvedMain: '♻ 自我修复：针对性重写后复检，{resolved} 条硬伤已消除，评分 {before} → {after}',
    deltaPlus: '（+{delta}）',
    periodMark: '。',
    stillFlags: '仍有 {n} 条建议继续打磨。',
    // ScreenplayCard
    identifying: '识别角色中…',
    errNetworkPoll: '网络不稳定，轮询失败',
    errQueryFail: '查询失败',
    errNoResult: '任务成功但未返回结果(可能触发内容审核),请重试',
    errTimeout: '超时，可重试',
    shotsCount: '{n} 个分镜',
    lookbook: '🎭 角色定妆库',
    lookbookHint: '—— 自动从剧情识别角色，定妆后每个分镜锁定同一批人',
    recast: '🔄 重新选角',
    autoCast: '🎭 自动选角',
    styled: '✓ 已定妆',
    styling: '定妆中…',
    restyle: '🔄 重新定妆',
    genLook: '🎭 生成定妆图',
    castFailRetry: '✕ 失败，可重试',
    clipFrame: '①生成本镜画面（锁{n}位角色）…',
    clipVideo2: '②生成视频…（约 1–2 分钟，勿切走标签页）',
    clipVideo: '生成中…（约 1–2 分钟，勿切走标签页）',
    regen: '🎬 重新生成',
    genVideo: '🎬 生成视频',
    lockCast: '· 锁角色',
    subtitle: '字幕：',
    autoProduce: '🎬 一键成片',
    producing: '一键成片中 {done}/{total}…',
    produceHint: '自动跑:选角 → 全员定妆 → 逐镜生成(前 {cap} 镜)',
    produceDone: '✓ 成片完成 {done}/{total}',
    assembleBtn: '🎞 拼成整集',
    assembling: '拼接成片中…',
    noClips: '请先生成至少一个分镜视频',
    finalEpisode: '完整成片',
  },
  en: {
    // App header
    brand: 'Jinyuan · Creation Workshop',
    badge: 'Signed-Author Craft Built In',
    sub: 'AI Showrunner — Multi-agent web-novel & short-drama studio · Powered by Qwen',
    // Works
    worksLabel: 'Your works:',
    chSuffix: ' ch',
    newWork: '＋ New',
    // Input
    genre: 'Genre',
    length: 'Length',
    ideaPlaceholder: 'Type a one-line story idea…',
    orchestrating: 'Orchestrating…',
    generate: '▶ Generate',
    tryLabel: 'Try:',
    stepRunning: 'in progress…',
    stepDone: 'done',
    liveHook: 'Hook: ',
    liveOutline: 'Outline: ',
    emptyHint: 'Pick a genre + length, type a one-line idea, hit "Generate" → 5 AI agents relay to deliver a web novel + short drama',
    // Workspace
    episodeSuffix: ' ep',
    chSerializing: ' ch (serializing)',
    newWork2: '＋ New work',
    cardHook: 'Hook & Angle',
    cardOutline: 'Dual-line Outline',
    cardChapters: 'Chapters',
    chaptersMetaRolling: 'Written {n} ch · serializing (vol.1 plans {total})',
    chaptersMeta: '{n} / {total} ch',
    chLabel: 'Ch. {no} · ',
    editDone: 'Done',
    editStart: '✎ Edit',
    adapting: 'Adapting…',
    adaptDone: '✓ Adapted',
    adaptDo: '🎬 Adapt to an episode',
    busyRewrite: 'Rewriting to your notes and re-running QC… (~1 min; the score below updates when done)',
    busyAdapt: 'Adapting this chapter into an episode… (~30 s)',
    rewritePlaceholder: 'Rewrite this chapter to your notes (e.g. faster pace / stronger heroine / move the twist earlier)…',
    rewriting: 'Rewriting…',
    rewriteDo: 'Rewrite to notes',
    busyNext: 'Writing the next chapter and auto-running QC… (~1 min)',
    continuing: 'Writing (with QC)…',
    continueDo: '＋ Write chapter {n} (auto QC)',
    cardEpisodes: 'Short-drama Episodes',
    episodesMeta: '{n} episode(s) done',
    epLabel: 'Episode {no} (from chapter {no})',
    epHint: 'Each chapter can be "adapted to an episode" on its own; episodes accumulate and older ones are never overwritten.',
    // HookCard
    hookGenre: 'Genre · ',
    // OutlineCard
    mainLine: 'Main line',
    hiddenLine: 'Hidden line',
    reversals: 'Reversals · Evidence Traceable',
    plantedEvidence: '🔎 Planted evidence: ',
    volumeArcs: 'Volume Arcs (serialized)',
    volPrefix: 'Vol. {v}',
    firstVolBeats: 'First-volume Beats',
    chapterBeats: 'Chapter Beats',
    paywall: 'Paywall · ',
    // QcCard
    qcInitial: 'Initial',
    qcRecheck: 'Recheck',
    qcScore: 'Score',
    scoreBasis: 'Score basis',
    noFlags: 'No rejection red-flags → baseline',
    flagsTitle: '🚩 Rejection red-flags caught (initial)',
    sevPenalty: '{sev} · −{penalty}',
    evidence: 'Evidence: ',
    fix: '✎ Fix: ',
    resolvedMain: '♻ Self-repair: after a targeted rewrite and recheck, {resolved} red-flag(s) cleared, score {before} → {after}',
    deltaPlus: ' (+{delta})',
    periodMark: '.',
    stillFlags: 'Still {n} suggestion(s) to polish.',
    // ScreenplayCard
    identifying: 'Identifying characters…',
    errNetworkPoll: 'Network unstable; polling failed',
    errQueryFail: 'Query failed',
    errNoResult: 'Task succeeded but returned no result (content review may have triggered); please retry',
    errTimeout: 'Timed out; you can retry',
    shotsCount: '{n} shots',
    lookbook: '🎭 Character Lookbook',
    lookbookHint: '— Auto-detects characters from the story; once styled, every shot locks the same cast',
    recast: '🔄 Recast',
    autoCast: '🎭 Auto-cast',
    styled: '✓ Styled',
    styling: 'Styling…',
    restyle: '🔄 Restyle',
    genLook: '🎭 Generate look',
    castFailRetry: '✕ Failed, retry',
    clipFrame: '① Generating shot frame (locking {n} cast)…',
    clipVideo2: '② Generating video… (~1–2 min, keep this tab open)',
    clipVideo: 'Generating… (~1–2 min, keep this tab open)',
    regen: '🎬 Regenerate',
    genVideo: '🎬 Generate video',
    lockCast: '· lock cast',
    subtitle: 'Subtitle: ',
    autoProduce: '🎬 Auto-produce',
    producing: 'Auto-producing {done}/{total}…',
    produceHint: 'Runs automatically: cast → style all → generate each shot (first {cap})',
    produceDone: '✓ Produced {done}/{total}',
    assembleBtn: '🎞 Assemble episode',
    assembling: 'Assembling…',
    noClips: 'Generate at least one shot video first',
    finalEpisode: 'Full episode',
  },
};

export function t(key, vars) {
  const table = dict[lang.value] || dict.zh;
  let s = table[key];
  if (s == null) s = dict.zh[key] != null ? dict.zh[key] : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return s;
}
