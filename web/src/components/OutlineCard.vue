<script setup>
defineProps({ data: Object });
</script>

<template>
  <div class="outline">
    <p class="logline">{{ data.logline }}</p>

    <div class="lines">
      <div class="line">
        <h4>明线</h4>
        <ul><li v-for="(m, i) in data.mainline" :key="i">{{ typeof m === 'string' ? m : (m.beat || m.title || JSON.stringify(m)) }}</li></ul>
      </div>
      <div class="line hidden">
        <h4>暗线</h4>
        <ul><li v-for="(h, i) in data.hiddenline" :key="i">{{ typeof h === 'string' ? h : (h.beat || h.info || JSON.stringify(h)) }}</li></ul>
      </div>
    </div>

    <div v-if="data.reversals?.length" class="reversals">
      <h4>反转 · 物证可回溯</h4>
      <div v-for="(r, i) in data.reversals" :key="i" class="rev">
        <span class="rev-no">{{ i + 1 }}</span>
        <div>
          <div class="rev-point">{{ r.point }}</div>
          <div class="rev-ev">🔎 埋设物证：{{ r.evidence }}</div>
        </div>
      </div>
    </div>

    <div v-if="data.chapters?.length" class="chapters">
      <h4>章节卡点 <span class="paywall" v-if="data.paywallAt">付费墙 · {{ data.paywallAt }}</span></h4>
      <ol>
        <li v-for="(c, i) in data.chapters" :key="i">
          <b>{{ c.title }}</b> — {{ c.beat }}
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.logline {
  font-size: 15px; font-weight: 600; color: #221d3a; line-height: 1.7;
  background: #faf9ff; padding: 12px 14px; border-radius: 8px; margin: 0 0 14px;
}
h4 { margin: 0 0 8px; font-size: 13px; color: #6a5cff; }
.lines { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.line { background: #f7f8fb; border-radius: 8px; padding: 10px 12px; }
.line.hidden { background: #f3effb; }
ul, ol { margin: 0; padding-left: 18px; }
li { font-size: 13px; line-height: 1.7; color: #4a5060; }
.reversals { margin-top: 14px; }
.rev { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; }
.rev-no {
  flex: none; width: 22px; height: 22px; border-radius: 50%; background: #6a5cff; color: #fff;
  font-size: 12px; display: grid; place-items: center; font-weight: 700;
}
.rev-point { font-size: 14px; font-weight: 600; color: #2a2440; }
.rev-ev { font-size: 12px; color: #8a7fd0; margin-top: 2px; }
.chapters { margin-top: 14px; }
.paywall {
  font-size: 11px; color: #c0392b; background: #fdecec; padding: 2px 8px;
  border-radius: 6px; margin-left: 6px;
}
</style>
