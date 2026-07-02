<script setup>
import { computed } from 'vue';
import { t, verdictLabel } from '../i18n.js';

const props = defineProps({ history: { type: Array, default: () => [] } });

const first = computed(() => props.history[0] || null);
const last = computed(() => props.history[props.history.length - 1] || null);
const hasRewrite = computed(() => props.history.length > 1);
const delta = computed(() => (hasRewrite.value ? last.value.score - first.value.score : 0));
const resolved = computed(() =>
  hasRewrite.value ? Math.max(0, (first.value.flags || []).length - (last.value.flags || []).length) : 0
);
const verdictClass = (v) => (v === '过' ? 'pass' : v === '拒' ? 'reject' : 'revise');
</script>

<template>
  <div class="qc" v-if="last">
    <!-- 评分（含重写前后对比） -->
    <div class="score-row">
      <div v-if="hasRewrite" class="score before"><div class="num">{{ first.score }}</div><div class="lbl">{{ t('qcInitial') }}</div></div>
      <div v-if="hasRewrite" class="arrow" :class="{ up: delta > 0 }">→<span v-if="delta">{{ delta > 0 ? ' +' + delta : ' ' + delta }}</span></div>
      <div class="score now" :class="verdictClass(last.verdict)"><div class="num">{{ last.score }}</div><div class="lbl">{{ hasRewrite ? t('qcRecheck') : t('qcScore') }}</div></div>
      <span class="verdict" :class="verdictClass(last.verdict)">{{ verdictLabel(last.verdict) }}</span>
    </div>

    <!-- 评分依据（可追溯的扣分公式）-->
    <div class="formula">
      <span class="ftag">{{ t('scoreBasis') }}</span>
      <template v-if="(last.breakdown || []).length">
        100<span v-for="(b, i) in last.breakdown" :key="i" class="ded"> − {{ b.name }}<i>({{ b.severity }}·−{{ b.penalty }})</i></span> = <b>{{ last.score }}</b>
      </template>
      <template v-else>{{ t('noFlags') }} <b>100</b></template>
    </div>

    <!-- 命中的拒稿硬伤（初检捕获）-->
    <div v-if="(first.flags || []).length" class="flags">
      <h4>{{ t('flagsTitle') }}</h4>
      <div v-for="(f, i) in first.flags" :key="i" class="flag">
        <div class="flag-name">{{ f.name }} <span class="sev">{{ t('sevPenalty', { sev: f.severity, penalty: f.penalty }) }}</span></div>
        <div class="flag-ev">{{ t('evidence') }}{{ f.evidence }}</div>
        <div class="flag-fix">{{ t('fix') }}{{ f.fix }}</div>
      </div>
    </div>

    <div v-if="hasRewrite" class="resolved">
      {{ t('resolvedMain', { resolved, before: first.score, after: last.score }) }}<template v-if="delta > 0">{{ t('deltaPlus', { delta }) }}</template>{{ t('periodMark') }}
      <span v-if="(last.flags || []).length">{{ t('stillFlags', { n: last.flags.length }) }}</span>
    </div>
  </div>
</template>

<style scoped>
.score-row { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
.score { text-align: center; }
.score .num { font-size: 30px; font-weight: 800; line-height: 1; }
.score .lbl { font-size: 11px; color: #9aa3b2; margin-top: 4px; }
.score.before .num { color: #c9a23a; }
.score.now.pass .num { color: #2f9e58; }
.score.now.revise .num { color: #d98a1f; }
.score.now.reject .num { color: #c0392b; }
.arrow { font-size: 14px; font-weight: 700; color: #9aa3b2; }
.arrow.up { color: #2f9e58; }
.verdict { margin-left: auto; font-size: 13px; font-weight: 700; padding: 5px 14px; border-radius: 20px; }
.verdict.pass { background: #e7f6ec; color: #2f9e58; }
.verdict.revise { background: #fff3e0; color: #d98a1f; }
.verdict.reject { background: #fdecec; color: #c0392b; }
.formula { font-size: 12.5px; color: #5b6172; background: #f7f8fb; border-radius: 8px; padding: 9px 12px; margin-bottom: 12px; line-height: 1.7; }
.ftag { font-size: 11px; color: #6a5cff; background: #efeaff; padding: 2px 8px; border-radius: 6px; margin-right: 8px; }
.ded i { color: #c0392b; font-style: normal; }
.formula b { color: #2a2f3a; font-size: 14px; }
h4 { margin: 0 0 8px; font-size: 13px; color: #c0392b; }
.flag { background: #fff8f8; border: 1px solid #f6dede; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.flag-name { font-weight: 700; color: #c0392b; font-size: 14px; }
.sev { font-size: 11px; color: #b07d33; background: #fbf0dd; padding: 1px 7px; border-radius: 6px; font-weight: 600; margin-left: 6px; }
.flag-ev { font-size: 12px; color: #7a6f6f; margin-top: 4px; }
.flag-fix { font-size: 13px; color: #2f7d4f; margin-top: 4px; }
.resolved { font-size: 13px; color: #2f7d4f; background: #e7f6ec; padding: 10px 12px; border-radius: 8px; line-height: 1.6; }
.resolved b { font-size: 15px; }
</style>
