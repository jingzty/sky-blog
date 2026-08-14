/* 后端：Express 同源托管 静态页 + /api，配 SQLite。
 * 重构要点：预编译语句复用 / 索引 / 列表轻量投影（不带 content）/
 *           上下篇独立接口 / 动态 RSS / 种子数据抽离。
 * 契约 C 方法名/字段名零改动，前端页面只增不改即可切换。
 */
const fs = require('fs'), path = require('path');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const seed = require('./scripts/seed-data');

const PORT = process.env.PORT || 8322;
const SEED = process.env.SEED === '1';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

/* 后台账号凭据：优先读数据库(config 表 adminUser / adminPassHash)，
 * 未设置时回退到环境变量/默认值。密码仅存哈希，不存明文。 */
const hashPwd = pwd => crypto.createHash('sha256').update(String(pwd)).digest('hex');
function adminCredentials() {
  const map = {};
  ST && ST.cfgAll.all().forEach(r => map[r.key] = r.value);
  const user = map.adminUser || ADMIN_USER;
  const hash = map.adminPassHash || hashPwd(ADMIN_PASS);
  return { user, hash };
}

/* ---------- DB ---------- */
const DB = path.join(__dirname, 'data', 'app.db');
fs.mkdirSync(path.dirname(DB), { recursive: true });
const db = new Database(DB);
db.pragma('journal_mode = WAL');
// 自动执行 migrations 目录下所有 .sql（按文件名排序），便于增量建表
const migrationsDir = path.join(__dirname, 'migrations');
for (const f of fs.readdirSync(migrationsDir).filter(n => n.endsWith('.sql')).sort()) {
  db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'));
}

/* ---------- 种子 ---------- */
if (SEED && db.prepare('SELECT COUNT(*) c FROM posts').get().c === 0) {
  const insPost = db.prepare('INSERT INTO posts (title,slug,excerpt,cover,date,tag,content,status,categoryId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insCat  = db.prepare('INSERT INTO categories (id,name,description,color,sortOrder) VALUES (?,?,?,?,?)');
  const insSld  = db.prepare('INSERT INTO slides (postId,tag,title,description,bgImage,sortOrder,status) VALUES (?,?,?,?,?,?,?)');
  const insCfg  = db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)');
  const tx = db.transaction(() => {
    seed.categories.forEach(c => insCat.run(...c));
    seed.posts.forEach(p => insPost.run(...p));
    seed.slides.forEach(s => insSld.run(...s));
    seed.config.forEach(([k, v]) => insCfg.run(k, v));
  });
  tx();
  console.log('· 已种子演示数据（SEED=1）');
}

/* ---------- 预编译语句 ---------- */
const ST = {
  postById:   db.prepare('SELECT * FROM posts WHERE id = ?'),
  postBySlug: db.prepare('SELECT * FROM posts WHERE slug = ?'),
  cats:       db.prepare('SELECT * FROM categories ORDER BY sortOrder ASC'),
  slidesAll:  db.prepare('SELECT * FROM slides ORDER BY sortOrder ASC'),
  slidesPub:  db.prepare("SELECT * FROM slides WHERE status = 'active' ORDER BY sortOrder ASC"),
  cfgAll:     db.prepare('SELECT key, value FROM config'),
  neighbors:  db.prepare(
    "SELECT id, title, date FROM posts WHERE status = 'pub' AND id <> ? ORDER BY date DESC"
  ),
};

/* ---------- 工具 ---------- */
const slugify = s => (s || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')
  .replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || ('post-' + Date.now());
const nowISO = () => new Date().toISOString();

/* 列表查询：lite 模式不取 content（列表/归档/计数都用它） */
function queryPosts({ all, categoryId, tag, month, q, lite }) {
  const cols = lite
    ? 'id,title,slug,excerpt,cover,date,tag,status,categoryId,createdAt,updatedAt'
    : '*';
  let sql = `SELECT ${cols} FROM posts`, where = [], params = [];
  if (!all) where.push("status = 'pub'");
  if (categoryId) { where.push('categoryId = ?'); params.push(+categoryId); }
  if (tag)        { where.push('tag LIKE ?'); params.push('%' + tag + '%'); }
  if (month)      { where.push('date LIKE ?'); params.push(month + '%'); }
  if (q)          { where.push('(title LIKE ? OR excerpt LIKE ? OR content LIKE ?)'); const w = '%' + q + '%'; params.push(w, w, w); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY date DESC';
  return db.prepare(sql).all(...params);
}

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
/* 反代部署：只信任 loopback 与内网 nginx 代理(192.168.3.213)写入的 X-Forwarded-For，
 * 从而还原真实客户端 IP（req.ip），同时丢弃客户端伪造的前缀段，避免绕过 IP 封禁。
 * 若代理链新增跳数/IP，需在此追加；不要把不可信的直连来源加入信任列表。 */
app.set('trust proxy', ['loopback', '192.168.3.213', '101.133.145.147']);
app.use(express.json({ limit: '1mb' }));

/* ---- cookie 解析（轻量自实现，免装 cookie-parser）---- */
function parseCookies(req) {
  const h = req.headers.cookie;
  const out = {};
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}
/* 从请求里取出登录 token：优先 Authorization 头，回退到 admin_token cookie。
 * 这样页面级导航（浏览器只带 cookie，不带 Authorization）与 fetch 调用（带 Authorization）
 * 都能被同一套 token 集合校验。 */
function reqToken(req) {
  const a = (req.headers.authorization || '').replace('Bearer ', '');
  if (a) return a;
  return (parseCookies(req).admin_token || '');
}

/* ---------- 安全响应头 ---------- */
/* CSP 说明：本站页面含 inline <script>/<style>（Tailwind 浏览器版亦需 inline style），
 * 故 script-src/style-src 暂用 'unsafe-inline'；仍可阻止外域脚本注入（最大风险面）。
 * 字体走 fonts.googleapis.cn / fonts.gstatic.cn；文章正文有外链图片故 img 放 https。
 * 未来若给 inline script 加 nonce，可去掉 'unsafe-inline' 进一步收紧。
 */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.cn https://maxcdn.bootstrapcdn.com",
    "font-src 'self' https://fonts.gstatic.cn https://maxcdn.bootstrapcdn.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));
  next();
});

/* 极简 token 守卫（内存 Set） */
const tokens = new Set();
const auth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!tokens.has(t)) return res.status(401).json({ error: '未登录' });
  next();
};
/* 可选鉴权：有 token 就验证并标记 req.authed，无 token 也放行（用于读接口区分访客/管理员） */
const optionalAuth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  req.authed = tokens.has(t);
  next();
};

/* ---- 登录安全策略（IP 封禁）---- */
/* 内存跟踪：登录失败计数 + 封禁到期时间戳。重启即清空（与 token 一致）。 */
const loginFails = new Map();  // ip -> 连续失败次数
const bans = new Map();        // ip -> 封禁到期时间戳(ms)
/* 客户端 IP：通过 req.ip 还原（配合 app.set('trust proxy', …)），
 * 只信任可信代理写入的 X-Forwarded-For 段，客户端伪造的前缀会被丢弃，
 * 因此既能在反代架构下区分真实客户端，又不会被伪造头绕过封禁。 */
const clientIp = req => (req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '');

/* 从 config 读策略，未设置时用默认值 */
function secPolicy() {
  const map = {};
  ST && ST.cfgAll.all().forEach(r => map[r.key] = r.value);
  return {
    maxAttempts: Math.max(1, parseInt(map.loginMaxAttempts, 10) || 3),
    banMinutes:  Math.max(1, parseInt(map.loginBanMinutes, 10) || 10),
  };
}
/* 请求级 IP 封禁拦截 */
const ipBanGuard = (req, res, next) => {
  const ip = clientIp(req);
  const until = bans.get(ip);
  if (until && until > Date.now()) {
    const remainMin = Math.ceil((until - Date.now()) / 60000);
    return res.status(403).json({ error: '登录失败次数过多，IP 已被暂时封禁', remainMin, ip });
  }
  if (until) bans.delete(ip); // 已过期，解除
  next();
};
/* 触发封禁：清空失败计数并加入封禁 */
function banIp(ip) {
  loginFails.delete(ip);
  const { banMinutes } = secPolicy();
  bans.set(ip, Date.now() + banMinutes * 60000);
}
app.use(ipBanGuard);


/* ---- 认证 ---- */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = clientIp(req);
  const until = bans.get(ip);
  if (until && until > Date.now()) {
    const remainMin = Math.ceil((until - Date.now()) / 60000);
    return res.status(403).json({ error: '登录失败次数过多，IP 已被暂时封禁', remainMin, ip });
  }
  const { user, hash } = adminCredentials();
  const ok = (username === user && hashPwd(password) === hash);
  if (ok) {
    loginFails.delete(ip);
    const t = 'tok_' + Date.now() + Math.random().toString(36).slice(2);
    tokens.add(t);
    /* 下发 httpOnly cookie：浏览器对 /admin/* 的页面级导航会自动带上，
     * 从而让后台页面守卫能校验登录态；XSS 读不到，仅服务端可读。
     * SameSite=Lax 防跨站带 cookie；path=/ 覆盖整站。 */
    res.setHeader('Set-Cookie', `admin_token=${encodeURIComponent(t)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    res.json({ token: t, ok: true });
  } else {
    const { maxAttempts } = secPolicy();
    const n = (loginFails.get(ip) || 0) + 1;
    loginFails.set(ip, n);
    if (n >= maxAttempts) banIp(ip);
    res.status(401).json({ error: '账号或密码错误', attempts: n, maxAttempts });
  }
});
app.get('/api/check', auth, (req, res) => res.json({ valid: true }));
/* 退出登录：从 token 集合移除并清除 cookie。httpOnly cookie 客户端无法自己清，必须走这里。 */
app.post('/api/logout', (req, res) => {
  const t = reqToken(req);
  if (t) tokens.delete(t);
  res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

/* ---- 文章 ---- */
app.get('/api/posts', optionalAuth, (req, res) => {
  // 列表默认走 lite（不带 content），后台编辑列表也只需要摘要
  // 安全：full / all 只对已登录管理员放开，访客强制 lite + 只看已发布
  const authed = req.authed;
  const lite = authed ? (req.query.full !== '1') : true;
  const all = authed && !!req.query.all;
  res.json(queryPosts({
    all,
    categoryId: req.query.categoryId,
    tag: req.query.tag,
    month: req.query.month,
    q: req.query.q,
    lite,
  }));
});

app.get('/api/posts/:id', optionalAuth, (req, res) => {
  const id = req.params.id;
  const r = isNaN(+id) ? ST.postBySlug.get(id) : ST.postById.get(+id);
  if (!r) return res.status(404).json({ error: '文章不存在' });
  // 安全：草稿只对已登录管理员可见，访客只能取已发布文章
  if (!req.authed && r.status !== 'pub') {
    return res.status(404).json({ error: '文章不存在' });
  }
  res.json(r);
});

/* 上下篇：轻量，避免前台详情页拉全量全文 */
app.get('/api/posts/:id/neighbors', (req, res) => {
  const cur = isNaN(+req.params.id) ? ST.postBySlug.get(req.params.id) : ST.postById.get(+req.params.id);
  if (!cur) return res.status(404).json({ error: '文章不存在' });
  const rows = ST.neighbors.all(cur.id);
  let prev = null, next = null;
  for (const r of rows) {
    if (r.date > cur.date && !next) next = r;     // 更新的是 next
    else if (r.date < cur.date && !prev) prev = r; // 更旧的是 prev
  }
  res.json({ prev, next });
});

app.post('/api/posts', auth, (req, res) => {
  const b = req.body || {};
  const s = b.slug || slugify(b.title);
  const now = nowISO();
  const r = db.prepare(
    'INSERT INTO posts (title,slug,tag,date,cover,excerpt,content,status,categoryId,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(b.title || '', s, b.tag || '', b.date || '', b.cover || '', b.excerpt || '', b.content || '', b.status || 'pub', b.categoryId || null, now, now);
  res.json({ id: r.lastInsertRowid, ...b, slug: s, createdAt: now, updatedAt: now });
});

app.put('/api/posts/:id', auth, (req, res) => {
  const b = req.body || {};
  const ex = ST.postById.get(+req.params.id);
  if (!ex) return res.status(404).json({ error: '文章不存在' });
  const slug = (b.slug && b.slug !== ex.slug) ? b.slug : ex.slug;
  db.prepare(
    'UPDATE posts SET title=?,tag=?,date=?,cover=?,excerpt=?,content=?,status=?,categoryId=?,slug=?,updatedAt=? WHERE id=?'
  ).run(b.title ?? ex.title, b.tag ?? ex.tag, b.date ?? ex.date, b.cover ?? ex.cover, b.excerpt ?? ex.excerpt, b.content ?? ex.content, b.status ?? ex.status, b.categoryId !== undefined ? b.categoryId : ex.categoryId, slug, nowISO(), +req.params.id);
  res.json({ ok: true });
});

app.patch('/api/posts/:id/status', auth, (req, res) => {
  db.prepare('UPDATE posts SET status=?, updatedAt=? WHERE id=?').run(req.body.status, nowISO(), +req.params.id);
  res.json({ ok: true });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  db.prepare('DELETE FROM posts WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

/* ---- 分类 ---- */
app.get('/api/categories', (req, res) => res.json(ST.cats.all()));
app.post('/api/categories', auth, (req, res) => {
  const b = req.body || {};
  const r = db.prepare('INSERT INTO categories (name,description,color,sortOrder) VALUES (?,?,?,?)')
    .run(b.name || '', b.description || '', b.color || '', b.sortOrder || 0);
  res.json({ id: r.lastInsertRowid, ...b });
});
app.put('/api/categories/:id', auth, (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE categories SET name=?,description=?,color=?,sortOrder=? WHERE id=?')
    .run(b.name || '', b.description || '', b.color || '', b.sortOrder || 0, +req.params.id);
  res.json({ ok: true });
});
app.delete('/api/categories/:id', auth, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

/* ---- 轮播 ---- */
app.get('/api/slides', optionalAuth, (req, res) => {
  // 安全：all=1 只对已登录管理员放开，访客强制仅返回 active 轮播（与 /api/posts 的 full/all 一致）
  const all = req.authed && req.query.all === '1';
  res.json((all ? ST.slidesAll : ST.slidesPub).all());
});
app.put('/api/slides', auth, (req, res) => {
  const ins = db.prepare('INSERT INTO slides (postId,tag,title,description,bgImage,sortOrder,status) VALUES (?,?,?,?,?,?,?)');
  const tx = db.transaction(list => {
    db.prepare('DELETE FROM slides').run();
    (list || []).forEach(s => ins.run(s.postId || null, s.tag || '', s.title || '', s.description || '', s.bgImage || '', s.sortOrder || 0, s.status || 'active'));
  });
  tx(req.body || []);
  res.json({ ok: true });
});

/* ---- 配置 ---- */
/* 安全：GET /api/config 对访客过滤名称含敏感词的 key（防未来加入密钥类配置泄露）；
 * 已登录管理员（带有效 token）可取全部。前端 request() 会自动带 Authorization，
 * 后台 config 页天然拿到完整配置，无需改前端。
 */
const SENSITIVE_CFG_KEY = /secret|password|token|key|credential|apikey|private|admin/i;
app.get('/api/config', optionalAuth, (req, res) => {
  const cfg = {};
  ST.cfgAll.all().forEach(r => cfg[r.key] = r.value);
  if (!req.authed) {
    for (const k of Object.keys(cfg)) {
      if (SENSITIVE_CFG_KEY.test(k)) delete cfg[k];
    }
  }
  res.json(cfg);
});
app.put('/api/config', auth, (req, res) => {
  const ins = db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)');
  const tx = db.transaction(cfg => {
    Object.entries(cfg).forEach(([k, v]) => {
      if (k === 'adminPass') return; // 明文密码不落库，改存哈希
      ins.run(k, String(v || ''));
    });
    if ('adminPass' in cfg) ins.run('adminPassHash', hashPwd(cfg.adminPass));
  });
  tx(req.body || {});
  res.json({ ok: true });
});

/* ---- 安全策略 ---- */
/* GET：返回当前策略 + 封禁列表（含剩余秒数）。 */
app.get('/api/security', auth, (req, res) => {
  const { maxAttempts, banMinutes } = secPolicy();
  const now = Date.now();
  const list = [];
  for (const [ip, until] of bans) {
    if (until > now) {
      list.push({ ip, until, remainSec: Math.max(1, Math.ceil((until - now) / 1000)) });
    } else {
      bans.delete(ip);
    }
  }
  res.json({ maxAttempts, banMinutes, bans: list });
});
/* PUT：更新策略（存 config）。 */
app.put('/api/security', auth, (req, res) => {
  const b = req.body || {};
  const max = Math.min(20, Math.max(1, parseInt(b.maxAttempts, 10) || 3));
  const min = Math.min(1440, Math.max(1, parseInt(b.banMinutes, 10) || 10));
  const ins = db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)');
  db.transaction(() => {
    ins.run('loginMaxAttempts', String(max));
    ins.run('loginBanMinutes', String(min));
  })();
  res.json({ ok: true, maxAttempts: max, banMinutes: min });
});
/* DELETE：一键解封指定 IP。 */
app.delete('/api/security/bans/:ip', auth, (req, res) => {
  const ip = decodeURIComponent(req.params.ip);
  bans.delete(ip);
  loginFails.delete(ip);
  res.json({ ok: true, ip });
});

/* ============ AI 模型配置 ============ */
/* 设计说明：
 * - ai_models 表存多模型配置（供应商/Base URL/Key/协议类型/模型类型/模型ID/显示名）。
 * - apiKey 仅服务端使用；列表接口对外脱敏（只返末 4 位），避免明文泄漏到前端。
 * - 新增/更新时 apiKey 为空表示“保留旧值”（便于编辑其他字段而不重输密钥）。
 * - 测试连接：文本模型发一次极简推理请求验证协议+鉴权；
 *   文生图模型走 models 列表接口做轻量鉴权校验（不真正生图，避免消耗配额）。
 */
const AI_API_TYPES = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai'];
const AI_MODEL_TYPES = ['text', 'image'];

const aiNow = () => new Date().toISOString();
/* 脱敏：仅保留末 4 位，前面用 · 填充；空则空串 */
function maskKey(k) {
  if (!k) return '';
  const s = String(k);
  if (s.length <= 4) return '····';
  return '·'.repeat(Math.min(12, s.length - 4)) + s.slice(-4);
}
function aiRow(r) {
  return {
    id: r.id, provider: r.provider, baseUrl: r.baseUrl,
    apiKeyMasked: maskKey(r.apiKey), hasApiKey: !!r.apiKey,
    apiType: r.apiType, modelType: r.modelType,
    modelId: r.modelId, displayName: r.displayName,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

app.get('/api/ai-models', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_models ORDER BY modelType ASC, id ASC').all();
  res.json(rows.map(aiRow));
});

app.post('/api/ai-models', auth, (req, res) => {
  const b = req.body || {};
  if (!b.provider) return res.status(400).json({ error: '请填写供应商名称' });
  if (!b.modelId) return res.status(400).json({ error: '请填写模型 ID' });
  if (!AI_API_TYPES.includes(b.apiType)) return res.status(400).json({ error: 'API 类型不合法' });
  const modelType = AI_MODEL_TYPES.includes(b.modelType) ? b.modelType : 'text';
  const now = aiNow();
  const r = db.prepare(
    'INSERT INTO ai_models (provider,baseUrl,apiKey,apiType,modelType,modelId,displayName,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(String(b.provider).trim(), String(b.baseUrl || '').trim(), String(b.apiKey || '').trim(),
        b.apiType, modelType, String(b.modelId).trim(), String(b.displayName || '').trim(), now, now);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/ai-models/:id', auth, (req, res) => {
  const ex = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(+req.params.id);
  if (!ex) return res.status(404).json({ error: '模型不存在' });
  const b = req.body || {};
  if (b.apiType && !AI_API_TYPES.includes(b.apiType)) return res.status(400).json({ error: 'API 类型不合法' });
  if (b.modelType && !AI_MODEL_TYPES.includes(b.modelType)) return res.status(400).json({ error: '模型类型不合法' });
  // apiKey 为空表示保留旧值
  const apiKey = (b.apiKey && String(b.apiKey).trim()) ? String(b.apiKey).trim() : ex.apiKey;
  db.prepare(
    'UPDATE ai_models SET provider=?,baseUrl=?,apiKey=?,apiType=?,modelType=?,modelId=?,displayName=?,updatedAt=? WHERE id=?'
  ).run(
    b.provider != null ? String(b.provider).trim() : ex.provider,
    b.baseUrl != null ? String(b.baseUrl).trim() : ex.baseUrl,
    apiKey,
    b.apiType || ex.apiType,
    b.modelType || ex.modelType,
    b.modelId != null ? String(b.modelId).trim() : ex.modelId,
    b.displayName != null ? String(b.displayName).trim() : ex.displayName,
    aiNow(), +req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/ai-models/:id', auth, (req, res) => {
  db.prepare('DELETE FROM ai_models WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

/* 测试连接：依据 apiType + modelType 发一次极简请求验证鉴权与协议是否可用。
 * 超时 20s；成功返回 {ok:true, detail}，失败返回 {ok:false, detail, status}。
 */
function joinBase(baseUrl, tail) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return tail;
  /* 智能处理版本段：用户填的 base 可能不含版本（https://api.openai.com），
   * 也可能已含版本（火山 https://ark.cn-beijing.volces.com/api/v3、
   * 或有人直接填 https://api.openai.com/v1）。
   * - base 不含版本段：直接拼 tail（tail 自带 /v1、/v1beta 等前缀）。
   * - base 已含版本段（/v1、/v2、/v1beta、/api/v3 等）：去掉 tail 开头的版本段，
   *   避免拼成 .../api/v3/v1/chat/completions 这种双重前缀。
   */
  const hasVer = /\/(?:api\/)?v\d+(?:beta)?(?:\/|$)/.test(base);
  if (hasVer) {
    tail = tail.replace(/^\/(?:api\/)?v\d+(?:beta)?/, '');
  }
  return base + tail;
}
async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}
async function bodySnippet(res) {
  try { const t = await res.text(); return t.slice(0, 500); }
  catch { return ''; }
}
async function testAiConnection(m) {
  const base = String(m.baseUrl || '').trim();
  const key = m.apiKey || '';
  const modelId = m.modelId;
  const isText = m.modelType !== 'image';
  let url, opts = { headers: {}, method: 'GET' };
  if (isText) {
    // 文本模型：发一次极简推理
    if (m.apiType === 'openai-completions') {
      url = joinBase(base, '/v1/chat/completions');
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }) };
    } else if (m.apiType === 'openai-responses') {
      url = joinBase(base, '/v1/responses');
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: modelId, input: 'ping' }) };
    } else if (m.apiType === 'anthropic-messages') {
      url = joinBase(base, '/v1/messages');
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }) };
    } else { // google-generative-ai
      url = joinBase(base, `/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`);
      opts = { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }) };
    }
  } else {
    // 文生图模型：走 models 列表做轻量鉴权（不真正生图，避免消耗配额/费用）
    if (m.apiType === 'anthropic-messages') {
      url = joinBase(base, '/v1/models');
      opts = { method: 'GET', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } };
    } else if (m.apiType === 'google-generative-ai') {
      url = joinBase(base, `/v1beta/models?key=${encodeURIComponent(key)}`);
      opts = { method: 'GET', headers: {} };
    } else { // openai-completions / openai-responses
      url = joinBase(base, '/v1/models');
      opts = { method: 'GET', headers: { Authorization: `Bearer ${key}` } };
    }
  }
  try {
    const res = await fetchWithTimeout(url, opts);
    const detail = await bodySnippet(res);
    if (res.ok) return { ok: true, status: res.status, detail };
    return { ok: false, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: e.name === 'AbortError' ? '请求超时' : (e.message || String(e)) };
  }
}
app.post('/api/ai-models/:id/test', auth, async (req, res) => {
  const m = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(+req.params.id);
  if (!m) return res.status(404).json({ error: '模型不存在' });
  const r = await testAiConnection(m);
  res.json(r);
});
/* 针对尚未保存的表单数据做即时测试（新增模型前先验证） */
app.post('/api/ai-models/test', auth, async (req, res) => {
  const b = req.body || {};
  if (!b.modelId) return res.status(400).json({ error: '请填写模型 ID' });
  if (!AI_API_TYPES.includes(b.apiType)) return res.status(400).json({ error: 'API 类型不合法' });
  const modelType = AI_MODEL_TYPES.includes(b.modelType) ? b.modelType : 'text';
  const r = await testAiConnection({
    baseUrl: b.baseUrl, apiKey: b.apiKey, apiType: b.apiType, modelType, modelId: b.modelId,
  });
  res.json(r);
});

/* ============ AI 写作（编辑器调用）============ */
/* 仅返回文本模型，供编辑器下拉选择 */
app.get('/api/ai/text-models', auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM ai_models WHERE modelType='text' ORDER BY id ASC").all();
  res.json(rows.map(aiRow));
});

/* 调用文本模型生成内容。统一返回 { ok, content } 或 { ok:false, error }。
 * 把 testAiConnection 里的协议差异收敛到这里，复用同一套拼接逻辑。
 */
async function callTextModel(m, prompt, { maxTokens = 2048, temperature } = {}) {
  const base = String(m.baseUrl || '').trim();
  const key = m.apiKey || '';
  const modelId = m.modelId;
  let url, opts;
  if (m.apiType === 'openai-completions') {
    url = joinBase(base, '/v1/chat/completions');
    opts = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature }) };
  } else if (m.apiType === 'openai-responses') {
    url = joinBase(base, '/v1/responses');
    opts = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: modelId, input: prompt, max_output_tokens: maxTokens }) };
  } else if (m.apiType === 'anthropic-messages') {
    url = joinBase(base, '/v1/messages');
    opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }) };
  } else if (m.apiType === 'google-generative-ai') {
    url = joinBase(base, `/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(key)}`);
    opts = { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } }) };
  } else {
    return { ok: false, error: '不支持的 API 类型: ' + m.apiType };
  }
  try {
    const res = await fetchWithTimeout(url, opts, 60000);
    const txt = await res.text();
    let j; try { j = JSON.parse(txt); } catch { j = null; }
    if (!res.ok) {
      const detail = j && j.error ? (JSON.stringify(j.error).slice(0, 300)) : txt.slice(0, 300);
      return { ok: false, status: res.status, error: `模型返回 ${res.status}: ${detail}` };
    }
    // 按协议提取文本
    let content = '';
    if (m.apiType === 'openai-completions') {
      content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
    } else if (m.apiType === 'openai-responses') {
      // responses API: output[].content[].text 或 output_text
      content = (j && j.output_text) || '';
      if (!content && j && j.output) {
        for (const o of j.output) {
          if (o.content) for (const c of o.content) { if (c.text) content += c.text; }
        }
      }
    } else if (m.apiType === 'anthropic-messages') {
      content = j && j.content && j.content[0] && j.content[0].text || '';
    } else if (m.apiType === 'google-generative-ai') {
      content = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts
        && j.candidates[0].content.parts.map(p => p.text || '').join('') || '';
    }
    if (!content) return { ok: false, status: res.status, error: '模型未返回文本内容', raw: txt.slice(0, 300) };
    return { ok: true, content };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? '请求超时' : (e.message || String(e)) };
  }
}
/* 生成文章内容：body { id: 模型ID, prompt, maxTokens?, temperature? } */
app.post('/api/ai/generate', auth, async (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: '请选择模型' });
  const m = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(+b.id);
  if (!m) return res.status(404).json({ error: '模型不存在' });
  if (m.modelType !== 'text') return res.status(400).json({ error: '该模型不是文本模型' });
  const prompt = String(b.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: '请输入提示词' });
  const r = await callTextModel(m, prompt, { maxTokens: b.maxTokens, temperature: b.temperature });
  res.json(r);
});

/* ============ AI 配图（文生图）============ */
/* 仅返回文生图模型，供编辑器下拉选择 */
app.get('/api/ai/image-models', auth, (req, res) => {
  const rows = db.prepare("SELECT * FROM ai_models WHERE modelType='image' ORDER BY id ASC").all();
  res.json(rows.map(aiRow));
});

/* 调用文生图模型。目前支持 OpenAI 兼容协议的 images 端点（/images/generations），
 * 覆盖火山方舟、OpenAI DALL·E、各类中转。其他协议返回不支持。
 * 统一返回 { ok, url, markdown } 或 { ok:false, error }。
 */
async function callImageModel(m, prompt, { size, n } = {}) {
  const base = String(m.baseUrl || '').trim();
  const key = m.apiKey || '';
  const modelId = m.modelId;
  if (m.apiType === 'openai-completions' || m.apiType === 'openai-responses') {
    // OpenAI 兼容：POST /images/generations
    const url = joinBase(base, '/images/generations');
    const body = { model: modelId, prompt, response_format: 'url' };
    if (size) body.size = size;
    if (n) body.n = n;
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body) };
    try {
      const res = await fetchWithTimeout(url, opts, 120000);
      const txt = await res.text();
      let j; try { j = JSON.parse(txt); } catch { j = null; }
      if (!res.ok) {
        const detail = j && j.error ? JSON.stringify(j.error).slice(0, 300) : txt.slice(0, 300);
        return { ok: false, status: res.status, error: `模型返回 ${res.status}: ${detail}` };
      }
      const imgUrl = j && j.data && j.data[0] && (j.data[0].url || j.data[0].b64_json && ('data:image/png;base64,' + j.data[0].b64_json)) || '';
      if (!imgUrl) return { ok: false, status: res.status, error: '模型未返回图片', raw: txt.slice(0, 300) };
      return { ok: true, url: imgUrl, markdown: `![AI生成图片](${imgUrl})` };
    } catch (e) {
      return { ok: false, status: 0, error: e.name === 'AbortError' ? '请求超时（文生图通常较慢，已等 120s）' : (e.message || String(e)) };
    }
  } else if (m.apiType === 'google-generative-ai') {
    // Gemini Imagen：POST /models/{model}:predict?key=...
    const url = joinBase(base, `/models/${encodeURIComponent(modelId)}:predict?key=${encodeURIComponent(key)}`);
    const body = { instances: [{ prompt }], parameters: { sampleCount: 1 } };
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    try {
      const res = await fetchWithTimeout(url, opts, 120000);
      const txt = await res.text();
      let j; try { j = JSON.parse(txt); } catch { j = null; }
      if (!res.ok) {
        const detail = j && j.error ? JSON.stringify(j.error).slice(0, 300) : txt.slice(0, 300);
        return { ok: false, status: res.status, error: `模型返回 ${res.status}: ${detail}` };
      }
      const b64 = j && j.predictions && j.predictions[0] && j.predictions[0].bytesBase64Encoded || '';
      if (!b64) return { ok: false, status: res.status, error: '模型未返回图片', raw: txt.slice(0, 300) };
      const imgUrl = 'data:image/png;base64,' + b64;
      return { ok: true, url: imgUrl, markdown: `![AI生成图片](${imgUrl})` };
    } catch (e) {
      return { ok: false, status: 0, error: e.name === 'AbortError' ? '请求超时' : (e.message || String(e)) };
    }
  }
  return { ok: false, error: '该 API 类型暂不支持文生图: ' + m.apiType };
}
/* 生成图片：body { id, prompt, size? } */
app.post('/api/ai/generate-image', auth, async (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ error: '请选择模型' });
  const m = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(+b.id);
  if (!m) return res.status(404).json({ error: '模型不存在' });
  if (m.modelType !== 'image') return res.status(400).json({ error: '该模型不是文生图模型' });
  const prompt = String(b.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: '请输入提示词' });
  const r = await callImageModel(m, prompt, { size: b.size });
  res.json(r);
});




app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  res.json(queryPosts({ q, lite: true }));
});

/* ---- 动态 RSS ---- */
app.get('/rss.xml', (req, res) => {
  const cfg = {};
  ST.cfgAll.all().forEach(r => cfg[r.key] = r.value);
  const base = `http://localhost:${PORT}`;
  const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const items = queryPosts({ lite: true }).slice(0, 20).map(p => {
    const link = `${base}/post.html?id=${p.id}`;
    const pub = p.date ? new Date(p.date + 'T00:00:00Z').toUTCString() : new Date().toUTCString();
    return `    <item>
      <title>${esc(p.title)}</title>
      <link>${link}</link>
      <guid>${link}</guid>
      <pubDate>${pub}</pubDate>
      <description>${esc(p.excerpt)}</description>
    </item>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(cfg.blogName || '远远的天空')}</title>
    <link>${base}/index.html</link>
    <description>${esc(cfg.blogSubtitle || '')}</description>
    <language>zh-CN</language>
${items}
  </channel>
</rss>`;
  res.type('application/rss+xml').send(xml);
});

/* ---- 后台页面守卫：未登录一律跳登录页，不再直接返回后台静态页 ----
 * 守卫只拦“页面导航”类请求（浏览器直接打开 /admin/*.html）。
 * 校验依据：cookie admin_token 必须命中内存 token 集合。
 * 静态资源（css/js/图片）不拦，否则后台页加载时子资源会因顺序问题被误拦。
 */
app.use('/admin', (req, res, next) => {
  const p = req.path;
  // 仅对 HTML 页面（无扩展名或 .html）做登录校验；其余资源放行
  const isPage = /^\/?$/.test(p) || /\.html$/i.test(p);
  if (!isPage) return next();
  const t = parseCookies(req).admin_token || '';
  if (!t || !tokens.has(t)) {
    // 顺手清掉失效 cookie，避免浏览器持续带无效 cookie 撞守卫
    res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.redirect(302, '/login.html');
  }
  next();
});

/* ---- 静态 + 404 ---- */
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, () => console.log(`✓ http://localhost:${PORT}  (SEED=${SEED ? 1 : 0})`));
