@echo off
REM 启动 FastAPI 供应链数学桥接服务
REM 端口可通过环境变量 PYTHON_BRIDGE_PORT 配置（默认 8765）
cd /d "%~dp0"

if "%PYTHON_BRIDGE_PORT%"=="" (
    set PORT=8765
) else (
    set PORT=%PYTHON_BRIDGE_PORT%
)

python -m uvicorn server:app --host 0.0.0.0 --port %PORT% --reload
