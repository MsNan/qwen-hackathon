# 烬渊·创作工坊 单镜像部署（前端构建产物由后端托管）
FROM node:22-slim

# ffmpeg(拼整集) + Noto CJK 字体(烧中文字幕)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用缓存）
COPY web/package.json web/package-lock.json* ./web/
RUN cd web && npm install
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install

# 拷贝源码并构建前端
COPY web ./web
RUN cd web && npm run build
COPY server ./server

ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/src/index.js"]
