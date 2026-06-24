<script setup>
defineProps({ text: String, rewritten: Boolean });
</script>

<template>
  <div class="chapter">
    <div v-if="rewritten" class="rewrite-flag">♻ 已按质检意见自我重写</div>
    <div class="prose">{{ text }}</div>
    <div class="wc">约 {{ (text || '').length }} 字</div>
  </div>
</template>

<style scoped>
.rewrite-flag {
  display: inline-block; font-size: 12px; color: #2f7d4f; background: #e7f6ec;
  padding: 3px 10px; border-radius: 6px; margin-bottom: 10px;
}
.prose {
  white-space: pre-wrap; line-height: 1.9; font-size: 14.5px; color: #2a2f3a;
  max-height: 360px; overflow: auto; padding-right: 6px;
  font-family: "Songti SC", "PingFang SC", serif;
}
.wc { font-size: 12px; color: #9aa3b2; text-align: right; margin-top: 8px; }
</style>
