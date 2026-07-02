# 烬渊 · 创作工坊 · Jinyuan Writers' Studio — AI Showrunner

> **One sentence → a publish-ready web novel AND a character-consistent short-drama video.**
> A multi-agent studio that encodes a *contracted novelist's* commercial craft into a team of Qwen-powered agents, and takes the story all the way to a shootable, subtitled vertical episode — powered end-to-end by **Qwen + Wan** on Alibaba Cloud DashScope, under a single API key.

**🏆 Track 2 — AI Showrunner** · Global AI Hackathon Series with Qwen Cloud
🔗 **Live demo:** https://msnanguo-chuangzuo-workshop.hf.space
💻 **Code:** https://github.com/MsNan/qwen-hackathon
🌐 Bilingual UI (中 / EN)

---

## The full loop / 完整流水线

```
one sentence 一句话
   │
   ├─ ① Hook Strategist        钩子选题官   ≤15-char title + commercial angle
   ├─ ② Dual-Line Outliner     双线大纲引擎  main + hidden line, evidence-locked reversals
   ├─ ③ Chapter Writer         章节写手     enter-in-motion opening + end hook
   ├─ ④ QC Editor (the moat)   卡点质检官   rejection-trap rubric · code-computed score · self-rewrite
   ├─ ⑤ Short-Drama Adapter    短剧改编官   scene / shot / dialogue / caption + image prompt
   └─ ⑥ Casting & Video Dir.   选角+视频官  auto-cast → lookbook → character-consistent video → assemble
                                              │
   auto-produce ▶ ─────────────────────────────┘
   → one subtitled vertical short-drama episode  一条带字幕的竖屏成片
```

## How it aligns with Track 2

| Judging axis | What this project does |
|---|---|
| **Narrative** | A real *rejection-trap* methodology (paywall sweet-spot, hook engineering, dual-line, evidence-locked reversals) encoded in `server/src/agents/methodology.js`; the QC editor scores against it with a **code-computed, traceable rubric** and a **self-rewrite → recheck** loop |
| **Video generation** | **Wan** text-to-video (`wan2.7-t2v`) + image-to-video (`wan2.2-i2v-plus`) + image editing (`wan2.7-image-pro`) + t2i (`wan2.6-t2i`) |
| **Character consistency** | Auto-cast → per-character **lookbook** portrait → place the *same* character into each new scene (reference-guided edit) → animate to video; a **project-level casting library** locks identity **across shots and chapters** |
| **Editing** | `ffmpeg` normalizes every clip to 720×1280, **burns subtitles**, and concatenates into one vertical episode |
| **Autonomous** | **One-click Auto-Produce** runs cast → style → generate-every-shot unattended |
| **Multimodal orchestration** | text · image · video all driven by the Qwen/Wan family under one key |
| **Token budget** | Live **token/usage meter + budget bar + Economy mode** (auto-downgrades `qwen-max → qwen-plus` over budget) |

## 护城河 / The moat

`server/src/agents/methodology.js` encodes the craft that actually gets manuscripts **signed** — sweet-spot word count, hook engineering, dual-line structure, evidence-locked reversals, and the concrete *rejection traps* editors kill drafts for. It is injected into every agent's system prompt and into the QC scoring rubric. The QC score is **computed in code** from fixed per-trap weights (e.g. `100 − passive-protagonist(severe −15) − symbolic-character(mid −7) = 78`) — transparent and reproducible, not a black-box number. That domain depth is the unfair advantage a generic wrapper can't copy.

## Architecture / 技术栈

- **Backend:** Node + Express + **SSE** streaming (`server/src/`)
  - `orchestrator.js` — multi-agent pipeline, shared memory, QC self-repair, cast extraction
  - `qwen.js` — Qwen via the OpenAI-compatible `dashscope-intl` endpoint + token-usage metering
  - `wan.js` — Wan native async API (t2v / i2v / image-edit / t2i); local-image → base64 for references
  - `assemble.js` — ffmpeg normalize + subtitle burn + concat (async jobs)
  - `ops.js` — asset mirroring (persist DashScope's 24h URLs) + per-day rate limiting
- **Frontend:** Vue 3 + Vite (`web/src/`) — pipeline stepper, QC score ring, casting lookbook, per-shot video, budget meter, bilingual i18n
- **Deploy:** single Docker image (Express serves the built frontend); Hugging Face Spaces; `QWEN_API_KEY` as an encrypted secret
- **One key, all modalities:** text (`qwen-plus` / `qwen-max`), image (`wan2.6-t2i` / `wan2.7-image-pro`), video (`wan2.7-t2v` / `wan2.2-i2v-plus`) — all on Alibaba Cloud DashScope

## Run locally / 本地运行

**Docker (recommended):**
```bash
docker build -t chuangzuo . && docker run -p 8787:8787 -e QWEN_API_KEY=sk-xxx chuangzuo
# → http://localhost:8787
```

**Dev:**
```bash
# backend
cd server && npm install && echo "QWEN_API_KEY=sk-xxx" > .env && npm start
# frontend
cd web && npm install && npm run build   # served by backend, or `npm run dev`
```
Get a key from Alibaba Cloud Model Studio (DashScope, international). `ffmpeg` + a CJK font are required for the "assemble episode" step (the Docker image installs both).

## What's next

- Voice-over on the assembled episode (Qwen-TTS; voice-clone already verified)
- Long-form series memory for multi-chapter continuity
- A B2B mode for short-drama studios and a creator subscription

---

Built with `Qwen` · `Wan` · `DashScope` · `Node.js` · `Express` · `SSE` · `Vue 3` · `Vite` · `Docker` · `ffmpeg` · `Hugging Face Spaces`
