@echo off
setlocal
set /p DASHSCOPE_API_KEY=请输入阿里云百炼 API Key（仅本次运行使用）: 
set DASHSCOPE_MODEL=qwen-plus
python app.py
set DASHSCOPE_API_KEY=
endlocal
