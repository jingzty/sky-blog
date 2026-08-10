# 远远的天空 · sky-blog2

> 一次从黎明到星夜的漫游。
> 一个以「一天的时间流」叙事的个人博客：首页沿黎明 → 正午 → 黄昏 → 星夜徐徐展开，文章卡片散落在正午的云海之间。
> 本仓库是 [`sky-blog`](../sky-blog) 的重构版 —— 同样的视觉与功能契约，更精简的代码、更快的响应、更稳的安全姿态。**原目录保持不动**，本目录独立运行。

![首页 · 黎明](screenshots/01-home-dawn.png)
![首页 · 正午云海](screenshots/02-home-day.png)
![首页 · 星夜](screenshots/04-home-night.png)

---

## ✨ 特性

- **时间叙事首页**：四大色温场景（黎明 / 正午 / 黄昏 / 星夜）连缀成长卷，文章卡片以拼贴感散落云间，滚动揭示依次淡入。
- **极简单体后端**：Express + better-sqlite3，一个 `server.js`（~300 行）同源托管静态页与 API，零构建步骤。
- **预编译语句复用**：高频查询在启动时一次性 `prepare`，按 id/slug 取文章、分类、轮播、配置、上下篇均走缓存计划。
- **列表轻量投影**：列表 / 归档 / 计数接口默认不返回 `content`，`?full=1` 才取全文，前台 payload 显著减小。
- **上下篇独立接口**：`GET /api/posts/:id/neighbors` 只回相邻两条 `id/title/date`，替代原「拉全量再算」。
- **动态 RSS**：`/rss.xml` 实时反映最新已发布文章，无需静态文件维护。
- **安全加固**：关闭 `x-powered-by`、全局安全响应头（CSP / nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy / COOP）、`optionalAuth` 区分访客与管理员、敏感配置键对未授权访问过滤、草稿对访客返回 404。
- **零前端构建**：Tailwind 浏览器版 + 原生 JS 模块，刷新即生效；后台用 EasyMDE（自带 marked，不再重复加载）。

---

## 🚀 快速开始

```bash
npm install            # better-sqlite3 + express
SEED=1 npm start       # 首次运行：建表 + 灌入演示数据，启动在 http://localhost:8322
# 之后用：
npm start              # 读取已有数据
```

打开 http://localhost:8322 即可访问。默认演示账号 `admin / admin`，可用环境变量覆盖：

```bash
ADMIN_USER=alice ADMIN_PASS=s3cret SEED=1 npm start
```

> 端口默认 `8322`（避免与原 `sky-blog` 的 `8321` 冲突），用 `PORT=` 覆盖。

---

## 📜 脚本

| 命令 | 说明 |
|---|---|
| `npm start` | 启动服务器（读取已有 `data/app.db`） |
| `npm run seed` | 等同 `SEED=1 npm start`，灌入演示数据后启动 |
| `npm run check-links` | 抓取所有内部链接并校验可达（跳过动态 `/rss.xml`） |
| `npm run test:e2e` | 端到端关键路径：登录 → 发文 → 前台可见 → 邻居 API（需先起服务 + playwright） |
| `npm run shots` | 全量截图 13 个页面（需 playwright + chromium） |

---

## 🗂 目录结构

```
sky-blog2/
├── server.js                 单体后端：路由 / 预编译语句 / 安全头 / 动态 RSS
├── migrations/001_init.sql   schema + 索引
├── scripts/
│   ├── seed-data.js          演示数据（分类 / 文章 / 轮播 / 配置）
│   ├── check-links.js        链接校验
│   ├── e2e.js                端到端测试
│   └── shot-all.js           全量截图
├── public/                   前台 + 后台页面（零构建）
│   ├── index.html            时间叙事首页（内联场景样式 + 滚动揭示）
│   ├── posts.html            文章列表（服务端筛选）
│   ├── post.html             文章详情（Markdown 渲染 + 上下篇）
│   ├── login.html            登录
│   ├── 404.html
│   ├── admin/                后台六页：仪表 / 文章 / 分类 / 轮播 / 配置 / 编辑器
│   ├── css/tokens.css        设计令牌（四大时刻色系 / 字体 / 动效）
│   └── js/
│       ├── api.js            数据层（66 行，原 217 行）
│       ├── ui.js             toast / 轮播 / 日期
│       ├── admin.js          侧栏 + 共享工具（esc / imgUrl / coverUrl）
│       └── md.js             极简 Markdown 渲染
└── docs/                     定界 / 契约 / 交互点清单
```

---

## 🔌 API 一览

契约字段名 / 路径与原版完全一致（详见 [`docs/契约.md`](docs/契约.md)）。✅ 表示需要 `Authorization: Bearer <token>`。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/login` | — | 账号密码换 token |
| GET | `/api/check` | ✅ | 验证 token |
| GET | `/api/posts` | 可选 | 列表；支持 `?categoryId=&tag=&q=&month=&all=&full=`。未授权时强制轻量 + 仅已发布 |
| GET | `/api/posts/:idOrSlug` | 可选 | 详情；草稿对未授权返回 404 |
| GET | `/api/posts/:id/neighbors` | — | 上下篇（仅 id/title/date） |
| POST / PUT / DELETE | `/api/posts[/:id]` | ✅ | 增改删 |
| PATCH | `/api/posts/:id/status` | ✅ | 改发布状态 |
| GET | `/api/categories` | — | 分类列表 |
| POST / PUT / DELETE | `/api/categories[/:id]` | ✅ | 增改删 |
| GET | `/api/slides` | — | 轮播（访客只见 active） |
| PUT | `/api/slides` | ✅ | 批量更新（事务） |
| GET | `/api/config` | 可选 | 站点配置；未授权时过滤敏感键（`secret/password/token/key/credential/apikey/private`） |
| PUT | `/api/config` | ✅ | 批量保存配置（事务） |
| GET | `/api/search?q=` | — | 搜标题 + 摘要 + 正文 |
| GET | `/rss.xml` | — | 动态 RSS 2.0 |

### `optionalAuth` 模式

读接口用 `optionalAuth` 中间件：有有效 token 就标记 `req.authed`，无 token 也放行。前端 `request()` 自动携带 `Authorization` 头，于是后台页面自然获得完全访问，访客则拿到过滤后的数据 —— **前端零改动**即可兼顾两类访问者。

---

## 🔒 安全姿态

| 项 | 措施 |
|---|---|
| 信息泄漏 | `app.disable('x-powered-by')` |
| XSS / 注入 | 严格 CSP（`default-src 'self'`，`object-src 'none'`，外域仅放行字体与文章图片） |
| 点击劫持 | `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` |
| MIME 嗅探 | `X-Content-Type-Options: nosniff` |
| 引用泄漏 | `Referrer-Policy: strict-origin-when-cross-origin` |
| 权限隔离 | `Permissions-Policy` 关闭地理 / 麦克风 / 相机 |
| 跨域隔离 | `Cross-Origin-Opener-Policy: same-origin` |
| 草稿泄漏 | 未授权访问草稿详情返回 404；`full=1` / `all=1` 仅管理员生效 |
| 配置泄漏 | `/api/config` 对未授权访问按正则过滤敏感键 |
| SQL 注入 | 全部参数化查询 + 预编译语句 |

> CSP 当前用 `'unsafe-inline'`（因页面有内联 Tailwind 浏览器版脚本 / 样式）。未来给 inline script 加 nonce 可进一步收紧。

---

## ⚡ 相对原版的变化

**删除的冗余**
- `public/js/marked.umd.js`（103 KB）—— EasyMDE 已内置 marked，属重复加载
- `api.js` 的 localStorage 双实现 + ~200 行重复种子数据 —— 原型期遗留，已有真实后端
- 一次性迁移脚本 `migrate-from-localstorage.js`
- 静态 `public/rss.xml`（端口 / 内容已过期）—— 改动态路由
- 各后台页内联的 `esc / imgUrl / coverUrl` 重复定义 —— 收敛到 `Admin.*`
- `posts.html` 里未使用的 `allTags` 死代码

**性能优化**
- 数据库索引：`posts(status,date)` / `posts(categoryId)` / `posts(date)` / `slides(status,sortOrder)`
- 列表轻量投影 + 上下篇独立接口，前台列表 / 详情 payload 大幅下降
- 服务端筛选：`posts.html` 把 `q/categoryId/tag/month` 交给后端，不再「拉全量再前端过滤」
- 写操作事务化（轮播 / 配置批量保存）
- 星空生成改用 `DocumentFragment` 批量插入

**前端 JS 负载**：`api.js` 217 → 66 行；移除 marked.umd.js 后前台 JS 净减约 130 KB。

---

## 🖼 截图

全量 13 张截图见 [`screenshots/`](screenshots/)，覆盖四大场景首页、文章列表 / 详情、登录、后台六页。

---

## 📄 文档

- [`docs/定界.md`](docs/定界.md) —— 项目边界与目标
- [`docs/契约.md`](docs/契约.md) —— 设计令牌 / 字段表 / API 表（单一事实来源）
- [`docs/交互点清单.md`](docs/交互点清单.md) —— 各页面交互细节

---

## 技术栈

Express 4 · better-sqlite3 · 原生 JS · Tailwind 浏览器版 · EasyMDE · Node 18+

## 许可

MIT
