-- 编辑器媒体记录：按文章维度记住最近一次 AI 生图 / 手动上传的结果，
-- 编辑页刷新后恢复显示（预览图 + 各分辨率 URL 列表）
CREATE TABLE IF NOT EXISTS editor_media_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  postId    INTEGER NOT NULL DEFAULT 0,  -- 关联文章 id，0 = 新文章
  kind      TEXT NOT NULL,               -- 'ai' = AI 生图，'upload' = 手动上传
  url       TEXT NOT NULL,               -- 主 URL（WebP，降级时为原格式）
  name      TEXT,                        -- 文件名 / prompt 摘要
  degraded  INTEGER NOT NULL DEFAULT 0,  -- 1 = 降级保留原格式
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_editor_media_lookup ON editor_media_history(postId, kind, createdAt DESC);
