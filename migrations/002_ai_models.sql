-- 002: AI 模型配置（后台"AI 配置"页用）
-- 支持多个供应商/模型，区分文本模型与文生图模型，apiType 决定调用协议。
CREATE TABLE IF NOT EXISTS ai_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,           -- 供应商名称，如 OpenAI / Anthropic / Google / 自建中转
  baseUrl     TEXT,                    -- 接口基础地址，如 https://api.openai.com
  apiKey      TEXT,                    -- 密钥（仅服务端使用，列表接口对外脱敏）
  apiType     TEXT NOT NULL,           -- openai-completions | openai-responses | anthropic-messages | google-generative-ai
  modelType   TEXT NOT NULL DEFAULT 'text',  -- text | image
  modelId     TEXT NOT NULL,           -- 模型 ID，如 gpt-4o / claude-3-5-sonnet / gemini-1.5-pro / dall-e-3
  displayName TEXT,                    -- 在前台/后台展示的名称
  createdAt   TEXT,
  updatedAt   TEXT
);
