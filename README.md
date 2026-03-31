# EchoShaper

EchoShaper 是一个“ASR 文本后处理塑形”小应用，前端为 Vite/React，后端为 FastAPI。当前支持：

- `POST /api/v1/llm/test`：大模型连通性测试
- `POST /api/v1/text/shape`：对原始文本进行塑形处理
- `POST /api/v1/asr/transcribe`：上传音频，仅 ASR（转写）
- `POST /api/v1/asr/transcribe/shape`：上传音频，ASR + 后处理（转写后塑形）
- `WS /api/v1/asr/stream`：流式 ASR + 后处理

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

### 通用说明

- `asr_config.asr_model_name`（可选）：预制 ASR 模型名。不传时默认为 `funasr`。当前仅允许：`funasr`。传入其它字符串会校验失败（HTTP 400 或 WebSocket 错误消息）。
- **`asr_config.hotwords`**：ASR 识别热词（可选）。字符串，内容为 **JSON**（对象：词 → 整数权重），仅用于识别阶段加权。
- **`lexicon` / `postprocess.lexicon`**：个人词库（可选）。字符串数组，仅用于 **后处理（LLM 塑形）**，例如 `protect_lexicon` 与提示词中的词表替换，**不会**自动当作 ASR 识别热词。

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
  "lexicon": ["下午", "大师"],
  "personal_preference": "尽量简短，不要废话"
}
```

### 3) 上传音频，仅 ASR（转写）

`POST /api/v1/asr/transcribe`（`multipart/form-data`）

表单字段：

- `file`：WAV 音频文件（PCM16 单声道，后端会重采样到 8k）。
- `asr_config`（可选，JSON 字符串），仅影响 ASR，例如：

```json
{
  "asr_model_name": "funasr",
  "hotwords": "{\"警官\":36}"
}
```

说明：响应里的 `wav_name` 为服务端生成的任务 ID，仅供对照日志，无需、也不接受客户端传入。

### 4) 上传音频，ASR + 后处理（转写后塑形）

`POST /api/v1/asr/transcribe/shape`（`multipart/form-data`）

表单字段：

- `file`：WAV 音频文件。
- `asr_config`（可选，JSON 字符串）：**仅 ASR**（模型名、`hotwords` 等），示例见 §3。
- `postprocess`（必填，JSON 字符串），**仅后处理**：

```json
{
  "llm_config": {
    "model_name": "glm-4",
    "base_url": "https://your-llm-host/v1",
    "api_key": "your-key"
  },
  "preset_skills": ["protect_lexicon", "auto_structure"],
  "custom_skills": [],
  "lexicon": ["警官", "回声作坊"],
  "personal_preference": "尽量简短，不要废话"
}
```

说明：`postprocess.lexicon` 只参与 LLM 塑形，不参与 ASR；需要 ASR 识别热词请在 `asr_config.hotwords` 中配置。

### 5) 流式识别（WebSocket）

`WS /api/v1/asr/stream`

连接成功后，先发送初始化 JSON：

```json
{
  "postprocess": {
    "llm_config": {
      "model_name": "glm-4",
      "base_url": "https://your-llm-host/v1",
      "api_key": "your-key"
    },
    "preset_skills": ["protect_lexicon", "auto_structure"],
    "custom_skills": [],
    "lexicon": ["警官", "回声作坊"],
    "personal_preference": "尽量简短，不要废话"
  },
  "asr_config": {
    "asr_model_name": "funasr",
    "hotwords": "{\"警官\":36}"
  }
}
```

`asr_config` 可只含 `asr_model_name`；连接会话 ID 由服务端生成，**不支持**客户端传 `wav_name`。`postprocess.lexicon` 仅用于流式触发后的文本塑形；**ASR 识别热词**只来自 `asr_config.hotwords`（不传则无额外热词，由实现决定是否使用默认兜底）。

然后持续发送 PCM 音频字节流，结束时可发送：

```json
{"type":"stop"}
```

常见消息：

- `asr.partial`：在线增量文本
- `asr.final`：离线最终文本
- `shape.result`：后处理结果
- `shape.skipped`：后处理被跳过（如 LLM 返回空结果），流不会因此中断

前端录音注意事项（部署环境）：

- 浏览器录音依赖 `navigator.mediaDevices.getUserMedia`，仅在安全上下文可用（`https://` 或 `localhost`）。
- 生产环境若使用 `http://`，会出现 `Cannot read properties of undefined (reading 'getUserMedia')`。
- 若启用了 `Permissions-Policy`，请确保未禁用麦克风（例如不要配置 `microphone=()`）。

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

### 6) 健康检查

`GET /health`

返回示例：

```json
{"status":"ok"}
```

## Docker（可选）

如果你只想快速跑后端（并由 `caddy` 负责转发静态前端与 `/api`）：

```bash
docker-compose up --build -d
```

说明：后端镜像安装 Python 依赖时使用 `uv pip --system`（容器内系统环境），并以 `python app.py` 启动，避免 `uv` 在无虚拟环境时的安装/运行报错。

然后访问：

- `http://localhost`（需要 `Caddyfile` 包含 `localhost`）
- `http://localhost/docs`（经 `caddy` 反代到后端）
