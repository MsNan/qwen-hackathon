/**
 * 运维工具：① 资产镜像(把 DashScope 24h 过期的 OSS 链接下载到本地,回发自有静态 URL)
 *          ② 内存级按天限流(保护公网 Space 的额度不被路人烧干)
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'cw-assets');
try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* ignore */ }

/**
 * 把远端(临时)资产镜像到本地,返回自有静态路径 /assets/xxx。
 * 失败则退回原链接(不阻断主流程)。已是 /assets 的直接返回。
 */
export async function mirrorAsset(remoteUrl, ext = 'bin') {
  if (!remoteUrl || typeof remoteUrl !== 'string' || remoteUrl.startsWith('/assets/')) return remoteUrl;
  try {
    const name = createHash('sha1').update(remoteUrl.split('?')[0]).digest('hex').slice(0, 20) + '.' + ext;
    const fp = path.join(DATA_DIR, name);
    if (!existsSync(fp)) {
      const r = await fetch(remoteUrl, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`下载失败 HTTP ${r.status}`);
      writeFileSync(fp, Buffer.from(await r.arrayBuffer()));
    }
    return `/assets/${name}`;
  } catch {
    return remoteUrl; // 镜像失败不阻断,退回原链接
  }
}

// ── 按天限流(内存) ──
const buckets = new Map(); // 'YYYY-MM-DD' -> { [ip]: {key:n}, __g: {key:n} }
function today() { return new Date().toISOString().slice(0, 10); }

/**
 * 限流中间件工厂：每 IP 每天 perIp 次、全局每天 perGlobal 次。
 */
export function rateLimit(key, perIp, perGlobal) {
  return (req, res, next) => {
    const day = today();
    let b = buckets.get(day);
    if (!b) { buckets.clear(); b = { __g: {} }; buckets.set(day, b); } // 跨天自动清空
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'x').split(',')[0].trim();
    b[ip] = b[ip] || {};
    const ipn = b[ip][key] || 0;
    const gn = b.__g[key] || 0;
    if (ipn >= perIp) return res.status(429).json({ ok: false, error: `已达今日上限(每人每天 ${perIp} 次)。可稍后再试或本地部署无限用。` });
    if (gn >= perGlobal) return res.status(429).json({ ok: false, error: '今日公共额度已用完,请明天再来或本地部署。' });
    b[ip][key] = ipn + 1;
    b.__g[key] = gn + 1;
    next();
  };
}
