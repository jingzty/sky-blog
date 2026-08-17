-- 通用图片库：AI 生图 + 手动上传统一存放（跨文章的永久公共资源）
CREATE TABLE IF NOT EXISTS image_library (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  kind      TEXT NOT NULL,               -- 'ai' = AI 生图，'upload' = 手动上传
  url       TEXT NOT NULL,               -- 主 URL（WebP，降级时为原格式）
  name      TEXT,                        -- 文件名（upload）/ NULL（ai）
  prompt    TEXT,                        -- 提示词（ai）/ NULL（upload）
  modelName TEXT,                        -- 模型名（ai）/ NULL（upload）
  size      TEXT,                        -- 尺寸（ai）/ NULL（upload）
  degraded  INTEGER NOT NULL DEFAULT 0,  -- 1 = 降级保留原格式（upload）
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_image_library_created ON image_library(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_image_library_kind ON image_library(kind, createdAt DESC);

-- 迁移现有 AI 生图历史到图片库（幂等：已迁移的不再重复插入）
INSERT INTO image_library (kind, url, name, prompt, modelName, size, degraded, createdAt)
SELECT 'ai', url, NULL, prompt, modelName, size, 0, createdAt
FROM ai_image_history h
WHERE NOT EXISTS (
  SELECT 1 FROM image_library g WHERE g.kind = 'ai' AND g.url = h.url AND g.createdAt = h.createdAt
);
