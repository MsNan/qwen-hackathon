# Jinyuan Writers' Studio — AI Showrunner

**Tagline:** A multi-agent studio that turns one sentence into a publish-ready web novel and a shootable short drama — guided by a real signed novelist's craft.

- **Track:** Track 2 — AI Showrunner
- **Live demo:** https://msnanguo-chuangzuo-workshop.hf.space
- **Code:** https://github.com/MsNan/qwen-hackathon

## Inspiration
China's web-novel and micro-drama industry runs on speed, but most "AI writing" tools are thin LLM wrappers that produce generic prose an editor would reject on sight. I'm in a rare position: I'm a *contracted web-novel author* and a full-stack engineer. So instead of building another wrapper, I encoded the actual commercial craft that gets stories signed — hook engineering, dual-line structure, evidence-locked reversals, and the specific "rejection traps" editors kill manuscripts for — directly into a team of cooperating agents.

## What it does
From a single sentence, a pipeline of five specialized Qwen-powered agents collaborates to produce a complete creative package:

1. **Hook Strategist** — ≤15-character clickable titles + genre / commercial sweet-spot analysis
2. **Dual-Line Outliner** — main + hidden storylines, evidence-locked reversals, and paywall cliffhanger placement
3. **Chapter Writer** — full chapter prose with an "enter-in-motion" opening and an end-of-chapter hook
4. **QC Editor (the moat)** — audits the draft against a real rejection-trap checklist (passive protagonist, dissolved climax, symbolic characters, weak healing, under-length), scores it, and triggers a **targeted self-rewrite**; on recheck it shows the improved score and which traps were resolved
5. **Short-Drama Adapter** — converts the chapter into a vertical micro-drama storyboard: scene / shot / dialogue / caption + an image-generation prompt per shot

The agents **share memory** (world, characters, plot) for cross-step consistency, **stream** their work live, and the QC → rewrite → recheck loop is a visible **self-repair**.

## How I built it
- **Models:** Qwen (`qwen-plus` / `qwen-max`) via the OpenAI-compatible `dashscope-intl` endpoint
- **Orchestration:** a Node/Express server running the agent pipeline with shared memory, a self-repair loop, and Server-Sent Events streaming
- **The moat:** a structured methodology rule-base (`server/src/agents/methodology.js`) authored from real signing experience, injected into every agent's system prompt and into the QC scoring rubric
- **Frontend:** Vue 3 + Vite — a pipeline-stepper UI with structured cards (hook chips, reversal-evidence outline, a score ring with initial-vs-recheck comparison, and a storyboard grid)
- **Deploy:** Express serves the built frontend as a single service, containerized with Docker, running on Hugging Face Spaces with the Qwen API key stored as an encrypted Secret

## Challenges I ran into
- The QC editor first anchored at "safe" scores; I added an explicit scoring rubric and a fair recheck pass so genuine fixes actually raise the score.
- Cloud account/region friction (mainland phone vs. international console) — resolved by deploying on Hugging Face Spaces with the Qwen API, which the rules allow.
- Keeping the API key secret while still shipping a public live link — solved with a thin backend plus platform secrets.

## Accomplishments that I'm proud of
A solo build where the agents don't just write — they **critique like a signed editor and fix their own work**, catching real rejection traps (e.g. "passive protagonist") with textual evidence and a concrete fix. That domain depth is the unfair advantage a generic wrapper can't copy.

## What I learned
Encoding tacit professional craft into explicit, machine-usable rules is where the real value sits — the orchestration and UI are means to surface that judgment. A small, well-prompted multi-agent loop with self-critique beats a single big prompt.

## What's next
- Wire each per-shot image prompt to a Qwen vision/video model for end-to-end short-video output
- Long-form series memory for multi-chapter continuity
- A B2B mode for short-drama studios and a creator subscription

## Built with
`Qwen` · `dashscope` · `Node.js` · `Express` · `Server-Sent Events` · `Vue 3` · `Vite` · `Docker` · `Hugging Face Spaces`
