# project-template

「前端原型 → 动态后端」可复用骨架。下一个想法从这里起步，跳过方法论阶段 1/2 的重复劳动。

## 用法

```bash
npm install
npm run seed        # 首次起服务 + 种子示例数据（SEED=1）
# 或
npm start           # 正常起服务（生产模式）
```

- 打开 http://localhost:8321/index.html
- 前端默认 `?mode=local` 用 localStorage 假数据演示；接后端后改 `?mode=remote` 走真 API（`api.js` 内置两套同签名实现，一键切换）

## 流程（对应方法论六段）

1. 填 `docs/契约.md` 与 `docs/交互点清单.md`
2. 在 `public/` 写原型（数据走 `API`，默认 local 实现）
3. `npm run check-links` 确认交互点全有效
4. `npm run migrate` 把演示数据迁进 SQLite，切 `mode=remote`
5. `npm run test:e2e` 验证关键路径
6. 生产化：systemd + 备份 + 环境变量管密码（见《方法论》阶段 4）

## 目录

```
docs/           契约 + 交互点清单（单一事实来源）
public/         前端（css/tokens.css, js/api|ui|md.js）
scripts/        check-links / e2e / migrate-from-localstorage
migrations/     数据库版本化迁移
server.js       Express 同源托管 + /api + 404 兜底
```
