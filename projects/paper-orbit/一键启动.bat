@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== Paper Orbit 一键启动 =====
echo 浏览器访问: http://127.0.0.1:5173
echo 按 Ctrl+C 可停止服务
echo.
if not exist "backend\.venv" (
  echo [提示] 尚未安装依赖，请先运行「一键安装.bat」
  pause
  exit /b 1
)
call npm run dev
