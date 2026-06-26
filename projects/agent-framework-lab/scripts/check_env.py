from pathlib import Path
import sys
import platform

ROOT = Path(__file__).resolve().parents[1]

print("Python executable:", sys.executable)
print("Python version:", sys.version.replace("\n", " "))
print("Platform:", platform.platform())
print("Project root:", ROOT)
print("Outputs dir exists:", (ROOT / "outputs").exists())
print("OK: 基础环境检查完成。")
