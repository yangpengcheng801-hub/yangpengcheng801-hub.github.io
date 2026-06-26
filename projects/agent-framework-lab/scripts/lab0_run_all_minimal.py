from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LABS = [
    ROOT / "labs" / "autogen_style_software_team.py",
    ROOT / "labs" / "agentscope_style_werewolf.py",
    ROOT / "labs" / "camel_style_book_writing.py",
    ROOT / "labs" / "langgraph_style_dialogue_workflow.py",
]

for lab in LABS:
    print("\n" + "=" * 80)
    print(f"运行实验: {lab.name}")
    print("=" * 80)
    result = subprocess.run([sys.executable, str(lab)], cwd=str(ROOT), text=True)
    if result.returncode != 0:
        raise SystemExit(f"实验失败: {lab}")

print("\n全部基础实验已完成。请查看 outputs/ 目录。")
