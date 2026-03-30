from __future__ import annotations

import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv


def _load_env() -> None:
    """
    支持两种 .env 位置：
    1) `backend/.env`
    2) 仓库根目录 `.env`（docker-compose 默认会用它）
    """
    backend_dir = Path(__file__).resolve().parent
    root_dir = backend_dir.parent

    # `override=True`：如果环境变量已设置，保持系统优先；如果你想严格以 .env 覆盖可改为 False
    # 这里我们更倾向“命令行/系统变量优先”，所以不覆盖已存在的变量。
    load_dotenv(backend_dir / ".env", override=False)
    load_dotenv(root_dir / ".env", override=False)


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


def main() -> None:
    _load_env()

    host = os.getenv("BACKEND_HOST", "0.0.0.0")
    port = int(os.getenv("BACKEND_PORT", "8058"))
    # 开发/生产环境都以“默认关闭热重载”为原则。
    # 如果你确实需要热重载，把 BACKEND_RELOAD 设为 true 即可。
    reload = _env_bool("BACKEND_RELOAD", default=False)

    # 使用 import string 启动，reload 时避免 uvicorn 提示告警
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()

