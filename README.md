# 远远的天空 · sky-blog2（重构版）

> 一次从黎明到星夜的漫游 —— 同样的视觉与功能，更精简的代码与更快的响应。
> 在 `sky-blog` 基础上重构，**原目录不动**，本目录独立运行。

## 运行

```bash
npm install            # better-sqlite3 + express（开发期可装 playwright）
npm start              # http://localhost:8322  （读取已有数据）
SEED=1 npm start       # 首次运行：灌入演示数据
npm run check-links    # 校验所有内部链接
npm run test:e2e       # 端到端关键路径（需先起服务）
npm run shots          # 全量截图（需 playwright + chromium）
```

默认账号 `admin / admin`，可用环境变量 `ADMIN_USER` / `ADMIN_PASS` 覆盖。

## 相对 sky-blog 的重构点

### 删除的冗余
| 项 | 说明 |
|---|---|
| `public/js/marked.umd.js`（103 KB） | EasyMDE 已内置 marked，独立引入属重复加载 |
| `api.js` 的 localStorage 双实现 + ~200 行重复种子数据 | 原型期遗留，已有真实后端，每页都白白发往浏览器 |
| `scripts/migrate-from-localstorage.js` | 一次性迁移脚本，迁移已完成，废弃 |
| 静态 `public/rss.xml`（端口/内容均已过期） | 改为 `/rss.xml` 动态路由，实时反映最新文章 |
| 各后台页内联的 `esc / imgUrl / coverUrl` 重复定义 | 统一收敛到 `admin.js` 的 `Admin.*` |
| `posts.html` 里从未使用的 `allTags` 死代码 | 删除 |

### 性能优化
- **数据库索引**：`migrations/001_init.sql` 新增 `posts(status,date)` / `posts(categoryId)` / `posts(date)` / `slides(status,sortOrder)` 索引，覆盖列表、筛选、归档查询路径。
- **预编译语句复用**：`server.js` 把高频查询（按 id/slug 取文章、分类、轮播、配置、上下篇）在启动时一次性 `prepare`，避免每请求重编译。
- **列表轻量投影**：`GET /api/posts` 默认不返回 `content`（列表/归档/计数都用不到），用 `?full=1` 才取全文。前台首页、列表页、搜索 payload 显著减小。
- **上下篇独立接口**：`GET /api/posts/:id/neighbors` 只返回相邻两条的 `id/title/date`。原 `post.html` 为算上下篇会拉**全量全文**，现在变成一次轻量请求。
- **服务端筛选**：`posts.html` 把 `q/categoryId/tag/month` 交给后端，不再「拉全量再前端过滤」。
- **写操作事务化**：轮播批量保存、配置批量保存用 `transaction` 包裹。
- **前端**：星空生成改用 `DocumentFragment` 批量插入，减少重排；图片 `loading="lazy"` 已有。

### 代码结构
- 种子数据从 `server.js` 抽离到 `scripts/seed-data.js`，主文件只剩路由与逻辑。
- `e2e.js` 修正了与当前页面不匹配的选择器（`#username/#password`、`admin/index.html`、`#title`、EasyMDE 的 CodeMirror 实例），并改用响应监听捕获真实 404 URL，忽略浏览器自动发出的 favicon 404。
- `check-links.js` 跳过动态路由 `/rss.xml`。

## 端口

默认 `8322`（避免与 `sky-blog` 的 `8321` 冲突），可用 `PORT=` 覆盖。

## 目录

```
server.js              精简后端：预编译语句 / 轻量列表 / 上下篇 / 动态 RSS
migrations/001_init.sql schema + 索引
scripts/seed-data.js    演示数据
scripts/check-links.js  链接检查
scripts/e2e.js          端到端测试
scripts/shot-all.js     全量截图
public/                 前台 + 后台页面
  js/api.js             远程专用数据层（~80 行，原 217 行）
  js/ui.js              toast / 轮播 / 日期
  js/admin.js           侧栏 + 共享工具（esc/imgUrl/coverUrl）
  js/md.js              极简 Markdown 渲染
```
