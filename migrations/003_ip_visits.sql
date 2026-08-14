-- 访问源 IP 统计（按 IP 聚合，记录访问次数、首次/最近时间、最近路径）
CREATE TABLE IF NOT EXISTS ip_visits (
  ip       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 1,
  firstTs  INTEGER NOT NULL,
  lastTs  INTEGER NOT NULL,
  lastPath TEXT
);
