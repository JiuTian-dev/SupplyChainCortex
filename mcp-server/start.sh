#!/usr/bin/env bash
# 启动 FastAPI 供应链数学桥接服务
# 端口可通过环境变量 PYTHON_BRIDGE_PORT 配置（默认 8765）
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PYTHON_BRIDGE_PORT:-8765}"
exec python3 -m uvicorn server:app --host 0.0.0.0 --port "$PORT" --reload
