@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== Paper Orbit 一键安装（国内镜像加速）=====
echo.
call npm run check
if errorlevel 1 exit /b 1
echo.
call npm install
if errorlevel 1 exit /b 1
echo.
call npm run setup
if errorlevel 1 exit /b 1
echo.
echo 安装完成。请编辑 backend\.env 填写 LLM_API_KEY，然后双击「一键启动.bat」
echo.
pause
