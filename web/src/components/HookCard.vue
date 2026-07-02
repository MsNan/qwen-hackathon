<script setup>
import { t, genreLabel } from '../i18n.js';
defineProps({ data: Object });
</script>

<template>
  <div class="hook">
    <div class="oneline">
      <span class="ql">“</span>{{ data.oneLineHook }}<span class="qr">”</span>
    </div>
    <div class="titles">
      <span v-for="(t, i) in data.titles" :key="i" class="chip">{{ t }}</span>
    </div>
    <div class="meta">
      <span class="tag">{{ t('hookGenre') }}{{ genreLabel(data.genre) }}</span>
    </div>
    <p class="sweet">{{ data.sweetspot }}</p>
  </div>
</template>

<style scoped>
.oneline {
  font-size: 17px; line-height: 1.7; font-weight: 600; color: #221d3a;
  background: linear-gradient(180deg, #f3f0ff, #fff); border-left: 3px solid #6a5cff;
  padding: 12px 16px; border-radius: 8px;
}
.ql, .qr { color: #9b8cff; font-size: 22px; vertical-align: -2px; }
.titles { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 6px; }
.chip {
  background: #efeaff; color: #5a3cff; border-radius: 20px; padding: 6px 14px;
  font-size: 14px; font-weight: 600;
}
.meta { margin: 8px 0; }
.tag { font-size: 12px; color: #7a6fff; background: #f1eeff; padding: 3px 10px; border-radius: 6px; }
.sweet { font-size: 13px; line-height: 1.7; color: #5b6172; margin: 8px 0 0; }
</style>
