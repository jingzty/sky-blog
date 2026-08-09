-- 001: 初始 schema（字段名 = 契约 B）+ 性能索引
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT,
  excerpt TEXT,
  cover TEXT,
  date TEXT,
  tag TEXT,
  content TEXT,
  status TEXT DEFAULT 'pub',
  categoryId INTEGER,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sortOrder INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS slides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  postId INTEGER,
  tag TEXT,
  title TEXT,
  description TEXT,
  bgImage TEXT,
  sortOrder INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 列表 / 筛选 / 归档常用查询路径索引
CREATE INDEX IF NOT EXISTS idx_posts_status_date ON posts(status, date DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category    ON posts(categoryId);
CREATE INDEX IF NOT EXISTS idx_posts_date        ON posts(date DESC);
CREATE INDEX IF NOT EXISTS idx_slides_status_sort ON slides(status, sortOrder);
