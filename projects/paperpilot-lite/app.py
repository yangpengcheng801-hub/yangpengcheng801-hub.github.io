"""PaperPilot local web application.

Run with: python app.py
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
from urllib.parse import urlparse

from paper_agent import PaperDocument, PaperReadingOrchestrator, extract_text


ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
SAMPLE = ROOT / "samples" / "sample_paper.txt"
MAX_BODY = 25 * 1024 * 1024
AGENT = PaperReadingOrchestrator()
DOCUMENTS: dict[str, PaperDocument] = {}
ANALYSES: dict[str, dict] = {}


class Handler(BaseHTTPRequestHandler):
    server_version = "PaperPilot/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[PaperPilot] {self.address_string()} - {fmt % args}")

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            raise ValueError("请求内容为空或超过 25MB 限制。")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self._json({"ok": True, "service": "PaperPilot", "mode": "bailian" if AGENT.llm.available else "local", "llm_enabled": AGENT.llm.available, "model": AGENT.llm.model if AGENT.llm.available else None})
            return
        if path == "/api/sample":
            self._json({"filename": SAMPLE.name, "text": SAMPLE.read_text(encoding="utf-8")})
            return
        if path == "/":
            path = "/index.html"
        target = (STATIC / path.lstrip("/")).resolve()
        if not str(target).startswith(str(STATIC.resolve())) or not target.exists():
            self.send_error(404)
            return
        data = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if content_type.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        try:
            payload = self._read_json()
            if self.path == "/api/analyze":
                filename = str(payload.get("filename") or "paper.txt")
                if payload.get("content_base64"):
                    data = base64.b64decode(payload["content_base64"], validate=True)
                    text = extract_text(filename, data)
                else:
                    text = str(payload.get("text") or "")
                    if len(text.strip()) < 80:
                        raise ValueError("论文文本过短，请上传或粘贴更完整的内容。")
                document = PaperDocument(filename=filename, text=text)
                analysis = AGENT.analyze(document)
                DOCUMENTS[document.doc_id] = document
                ANALYSES[document.doc_id] = analysis
                self._json({"ok": True, "analysis": analysis})
                return
            if self.path == "/api/ask":
                doc_id = str(payload.get("doc_id") or "")
                document = DOCUMENTS.get(doc_id)
                if not document:
                    raise ValueError("当前论文会话已失效，请重新分析论文。")
                self._json({"ok": True, "result": AGENT.ask(document, str(payload.get("question") or ""))})
                return
            if self.path == "/api/export":
                doc_id = str(payload.get("doc_id") or "")
                document = DOCUMENTS.get(doc_id)
                analysis = ANALYSES.get(doc_id)
                if not document or not analysis:
                    raise ValueError("当前论文会话已失效，请重新分析论文。")
                self._json({"ok": True, "filename": f"{Path(document.filename).stem}_阅读笔记.md", "markdown": AGENT.export_markdown(document, analysis)})
                return
            self._json({"ok": False, "error": "接口不存在。"}, 404)
        except Exception as exc:
            self._json({"ok": False, "error": str(exc)}, 400)


def main() -> None:
    host = os.getenv("PAPERPILOT_HOST", "127.0.0.1")
    port = int(os.getenv("PAPERPILOT_PORT", "8765"))
    url = f"http://{host}:{port}"
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"PaperPilot 已启动：{url}")
    if os.getenv("PAPERPILOT_NO_BROWSER") != "1":
        Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPaperPilot 已停止。")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
