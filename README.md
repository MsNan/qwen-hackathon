# 烬渊 · 创作工坊 (Chuangzuo Workshop)

> **AI Showrunner** — 多智能体网文 / 短剧创作流水线
> Global AI Hackathon Series with Qwen Cloud · 赛道2 (Track 2: AI Showrunner)

把一句话创意，经由一组分工协作的 AI Agent，自动产出符合**签约级商业标准**的：
钩子标题 → 双线大纲 → 章节正文 → 拒稿硬伤质检 → 竖屏短剧分镜脚本。

## 护城河
内置真实签约作者的商业化创作方法论（盐选甜区体量、钩子工程、双线结构、
物证可回溯的反转、拒稿硬伤清单），编码于 `server/src/agents/methodology.js`，
并注入每个 Agent 的系统提示与质检环节 —— 这是套壳工具不具备的"行业理解"。

## 多智能体编排（对齐赛道2「orchestrate creative content at scale」）
```
创意 → ①钩子选题器 → ②双线大纲引擎 → ③章节写手 → ④卡点质检官
                                              │（不过则按意见自我重写一次）
                                              ▼
                                       ⑤短剧改编官（分镜+文生图提示词）
```
- 跨步**记忆**：世界观/人物/前情贯穿全流程，保证一致性
- **自我修复**闭环：质检不过自动重写
- **流式**推送：前端实时看每个 Agent 工作

## 技术栈
- 模型：Qwen（OpenAI 兼容端点 `dashscope-intl`）
- 后端：Node + Express（Agent 编排 + SSE 流式）
- 前端：Vue 3 + Vite

## 本地运行
```bash
# 1) 后端
cd server
cp .env.example .env        # 填入 QWEN_API_KEY
npm install
npm run dev                  # http://localhost:8787

# 2) 前端（另开终端）
cd web
npm install
npm run dev                  # http://localhost:5173
```

## 目录
```
server/src/
  agents/methodology.js   方法论规则库（护城河，作者持续校准）
  agents/index.js         各 Agent 定义
  orchestrator.js         编排 + 记忆 + 自我修复
  qwen.js                 Qwen 客户端（OpenAI 兼容）
  index.js                Express + SSE
web/src/App.vue           流水线可视化工作流
```
