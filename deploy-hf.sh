#!/usr/bin/env bash
# 烬渊·创作工坊 —— 一键部署到 Hugging Face Space(Docker)
# 用法：  bash deploy-hf.sh "hf_你的写权限token"
# 机制：从 git HEAD 取干净快照 → 换上 HF 专用 README(Docker front matter)
#       → 剥离 HF git 拒收的二进制(*.png 等) → force-push 到 HF Space git → 自动重建
set -e

HF_TOKEN="${1:-}"
HF_USER="msnanGuo"
HF_SPACE="chuangzuo-workshop"   # → https://msnanguo-chuangzuo-workshop.hf.space
SRC="$HOME/qwen-hackathon"
WORK="/tmp/hf-deploy"

if [ -z "$HF_TOKEN" ]; then
  echo "❌ 用法: bash deploy-hf.sh \"hf_你的写权限token\""
  echo "   token 在 https://huggingface.co/settings/tokens 生成(需 write 权限)"
  exit 1
fi

echo "▶ 1/5 从 git HEAD 取干净快照 → $WORK"
rm -rf "$WORK" && mkdir -p "$WORK"
cd "$SRC" && git archive HEAD | tar -x -C "$WORK"

echo "▶ 2/5 写入 HF 专用 README(Docker SDK front matter)"
cat > "$WORK/README.md" <<'EOF'
---
title: 烬渊创作工坊 Chuangzuo Workshop
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 8787
pinned: false
---

# 烬渊 · 创作工坊 — AI Showrunner (Track 2)

多智能体网文 / 短剧创作流水线 · Powered by Qwen。
一句话创意 → 钩子标题 → 双线大纲 → 章节正文 → 拒稿硬伤质检 → 竖屏短剧分镜 → **Wan 文生视频**。

源码与说明见 GitHub: https://github.com/MsNan/qwen-hackathon
EOF

echo "▶ 3/5 剥离 HF git 拒收的二进制文件"
find "$WORK" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.mp4' -o -iname '*.gif' \) -delete
# 工作/调试文件不上线
rm -f "$WORK/probe-wan.js" "$WORK/录屏小抄.txt" "$WORK/demo-script.md" "$WORK/architecture.html" "$WORK/deploy.sh" "$WORK/deploy-hf.sh" 2>/dev/null || true

echo "▶ 4/5 初始化 git 并提交"
cd "$WORK"
git init -q
git add -A
git -c user.email="deploy@local" -c user.name="deploy" commit -q -m "deploy: Wan 视频生成接入(分镜→真视频)"

echo "▶ 5/5 force-push 到 HF Space(触发自动重建)"
git push -f "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${HF_USER}/${HF_SPACE}" HEAD:main

echo ""
echo "✅ 已推送到 HF Space，正在自动重建(约 2-4 分钟)。"
echo "   构建进度: https://huggingface.co/spaces/${HF_USER}/${HF_SPACE}"
echo "   线上地址: https://msnanguo-chuangzuo-workshop.hf.space"
