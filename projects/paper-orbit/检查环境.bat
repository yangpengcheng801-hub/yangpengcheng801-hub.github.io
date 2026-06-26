@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ===== Paper Orbit 环境检查 =====
echo.
call npm run check
echo.
pause
