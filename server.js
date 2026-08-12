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
db.exec(fs.readFileSync(path.join(__dirname, 'migrations', '001_init.sql'), 'utf8'));

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

/* ---- 静态 + 404 ---- */
app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: 0 }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, () => console.log(`✓ http://localhost:${PORT}  (SEED=${SEED ? 1 : 0})`));
