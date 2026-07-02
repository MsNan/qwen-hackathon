# Jinyuan Writers' Studio — AI Showrunner

**Tagline:** A multi-agent studio that turns one sentence into a publish-ready web novel AND a character-consistent short-drama video — guided by a real signed novelist's craft, powered end-to-end by Qwen + Wan.

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
4. **QC Editor (the moat)** — audits the draft against a real rejection-trap checklist (passive protagonist, dissolved climax, symbolic characters, weak healing, missing end-hook, under-length). The agent only *detects* each trap and its severity; the **score is computed in code** from fixed per-trap weights (e.g. `100 − passive-protagonist(severe −15) − symbolic-character(mid −7) = 78`), so it's transparent and reproducible rather than a black-box number. A failing score triggers a **targeted self-rewrite**, and the recheck shows the improved score and which traps were resolved
5. **Short-Drama Adapter** — converts the chapter into a vertical micro-drama storyboard: scene / shot / dialogue / caption + an image-generation prompt per shot
6. **Casting & Video Director (multimodal)** — auto-extracts the recurring characters from the story, generates a consistent reference portrait ("casting shot") for each, then produces a real vertical video clip per shot: it places the *same* characters into each new scene via reference-guided image editing (Wan2.7-image-pro) and animates that keyframe into video (Wan image-to-video). A project-level casting library caches each character so identity stays locked **across shots and across chapters**

The result closes the full Track-2 loop — **one sentence → script → QC → storyboard → cast → real, character-consistent video** — with every modality (text, image, video) driven by the Qwen/Wan family on Alibaba Cloud DashScope under a single key.

The user picks a **genre** (suspense / romance / fantasy / sci-fi / urban / history…) and a **length** (short / medium / long), which drives word-count sweet-spots, chapter count, and paywall placement. Beyond chapter one, a **"continue writing"** action drafts subsequent chapters with full continuity, and a **"re-adapt from the full novel"** action turns every written chapter into a complete multi-scene storyboard.

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
- One-click "auto-produce": run cast → keyframes → video for the whole episode unattended, then auto-assemble the clips into a single subtitled, voiced vertical episode (ffmpeg + Qwen-TTS)
- Long-form series memory for multi-chapter continuity
- A B2B mode for short-drama studios and a creator subscription

## Built with
`Qwen` · `Wan` (text-to-video / image-to-video / image editing) · `dashscope` · `Node.js` · `Express` · `Server-Sent Events` · `Vue 3` · `Vite` · `Docker` · `Hugging Face Spaces`
