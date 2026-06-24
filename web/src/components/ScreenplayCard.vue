<script setup>
defineProps({ data: Object });
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
        <div class="frame">🖼 {{ s.imagePrompt }}</div>
        <div class="action">{{ s.action }}</div>
        <div v-if="s.dialogue" class="dia">「{{ s.dialogue }}」</div>
        <div v-if="s.caption" class="cap">字幕：{{ s.caption }}</div>
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
.action { font-size: 13px; color: #2a2f3a; padding: 8px 10px 4px; line-height: 1.6; }
.dia { font-size: 13px; color: #5a3cff; padding: 2px 10px; font-weight: 600; }
.cap { font-size: 11.5px; color: #9aa3b2; padding: 4px 10px 10px; }
</style>
