#!/usr/bin/env bash
# 烬渊·创作工坊 —— 阿里云服务器一键部署脚本（Ubuntu/Debian）
# 用法：
#   1) 把下面的 REPO 改成你的 GitHub 仓库地址
#   2) 在服务器上执行：  bash deploy.sh "你的QWEN_API_KEY"
set -e

REPO="https://github.com/MsNan/qwen-hackathon.git"
APP_DIR="$HOME/qwen-hackathon"
QWEN_KEY="${1:-}"

echo "▶ 1/5 安装 Node.js 22 + git + pm2 ..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs git
fi
sudo npm install -g pm2 >/dev/null 2>&1 || npm install -g pm2

echo "▶ 2/5 拉取代码 ..."
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull
else
  git clone "$REPO" "$APP_DIR" && cd "$APP_DIR"
fi

echo "▶ 3/5 构建前端 ..."
cd "$APP_DIR/web" && npm install && npm run build

echo "▶ 4/5 配置后端环境 ..."
cd "$APP_DIR/server" && npm install
if [ -n "$QWEN_KEY" ]; then
  cat > .env <<EOF
QWEN_API_KEY=$QWEN_KEY
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_TEXT_MODEL=qwen-plus
QWEN_PRO_MODEL=qwen-max
PORT=8787
EOF
  echo "  .env 已写入"
else
  echo "  ⚠ 未提供 API Key，请手动编辑 server/.env"
fi

echo "▶ 5/5 启动常驻服务 ..."
pm2 delete chuangzuo 2>/dev/null || true
pm2 start src/index.js --name chuangzuo
pm2 save
pm2 startup | tail -1 || true

IP=$(curl -s ifconfig.me || echo "你的服务器IP")
echo ""
echo "✅ 部署完成！公网访问： http://$IP:8787"
echo "   （记得在阿里云控制台「防火墙/安全组」放行 8787 端口）"
