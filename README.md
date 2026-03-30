# EchoShaper

EchoShaper 是一个“ASR 文本后处理塑形”小应用，前端为 Vite/React，后端为 FastAPI，并提供两个 API 能力：

- `POST /api/v1/llm/test`：大模型连通性测试
- `POST /api/v1/text/shape`：对原始文本进行塑形处理

## 安装依赖

在项目根目录执行：

```bash
npm run install
```

它会同时安装：

- `frontend/` 的 Node 依赖（`npm install`）
- `backend/` 的 Python 依赖（优先 `uv pip install`，失败则回退到 `pip install`）

## 启动

### 同时启动（前端 build 后预览 + 生产后端）

```bash
npm run start
```

启动后：

- 前端：`http://localhost:8058`（与后端同源，由 FastAPI 挂载静态文件）
- 后端：`http://localhost:8058`
- Swagger UI：`http://localhost:8058/docs`

说明：由于前端“预览模式”不会像开发模式那样自动代理 `/api`，`npm run start` 会在构建阶段注入 `VITE_API_BASE_URL`（优先使用 `.env` 里的配置；没有则按 `BACKEND_PORT` 组合），以确保构建后的前端能正常请求后端 API。

### 仅启动生产后端

```bash
node scripts/start-backend.mjs
```

## 配置

编辑根目录 `.env`（如果你还没有 `.env`，可以先复制 `.env.example`）：

- `BACKEND_HOST`：后端监听地址（默认 `0.0.0.0`）
- `BACKEND_PORT`：后端端口（默认 `8058`）
- `FRONTEND_PORT`：前端预览端口（默认 `5173`）

## 后端 API 说明

以下示例以 `http://localhost:8058` 为例（路径不带域名时也可直接用相对 `/api/...`）。

### 1) 大模型连通性测试

`POST /api/v1/llm/test`

请求体（`LLMConfig`）：

```json
{
  "model_name": "glm-4",
  "base_url": "https://your-llm-host/v1",
  "api_key": "your-key"
}
```

响应成功示例（`LLMTestResponse`）：

```json
{
  "status": "success",
  "latency_ms": 123,
  "message": "Model glm-4 is connected successfully."
}
```

### 2) ASR 文本塑形处理

`POST /api/v1/text/shape`

请求体（`ProcessRequest`）：

```json
{
  "raw_text": "我今天计划测试...",
  "llm_config": {
    "model_name": "glm-4",
    "base_url": "https://your-llm-host/v1",
    "api_key": "your-key"
  },
  "preset_skills": [
    "protect_lexicon",
    "auto_structure",
    "filter_fillers",
    "remove_trailing_period"
  ],
  "custom_skills": [],
  "lexicon": ["OpenAI", "EchoShaper"],
  "personal_preference": "尽量简短，不要废话"
}
```

响应成功示例（`ShapeResponse`）：

```json
{
  "status": "success",
  "original_length": 12,
  "processed_length": 10,
  "result_text": "（塑形后的最终文本）",
  "tokens_used": {
    "prompt": 100,
    "completion": 50,
    "total": 150
  },
  "latency_ms": 456
}
```

## Docker（可选）

如果你只想快速跑后端（并由 `caddy` 负责转发静态前端与 `/api`）：

```bash
docker-compose up --build -d
```

然后访问：

- `http://localhost`（需要 `Caddyfile` 包含 `localhost`）
- `http://localhost/docs`（经 `caddy` 反代到后端）

