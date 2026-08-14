-- AI 生成图片历史记录
CREATE TABLE IF NOT EXISTS ai_image_history (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt    TEXT NOT NULL,
  url       TEXT NOT NULL,
  modelId   INTEGER,          -- 引用 ai_models.id（模型被删则置 NULL）
  modelName TEXT,             -- 冗余记录模型显示名，便于历史回溯
  size      TEXT,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_image_history_created ON ai_image_history(createdAt DESC);
