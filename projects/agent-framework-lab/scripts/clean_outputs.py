from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)
for p in OUT.iterdir():
    if p.name == ".gitkeep":
        continue
    if p.is_file():
        p.unlink()
print("已清理 outputs 目录。")
