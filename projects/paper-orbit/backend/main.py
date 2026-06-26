"""FastAPI 应用入口。

启动：uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.api.routes import router
from app.config import get_settings


settings = get_settings()
logger = logging.getLogger("paper-reader")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """将业务 HTTP 异常统一包装为标准错误结构。"""

    detail = exc.detail
    if isinstance(detail, dict):
        code = str(detail.get("code", "HTTP_ERROR"))
        message = str(detail.get("message", "请求处理失败"))
    else:
        code, message = "HTTP_ERROR", str(detail)
    return JSONResponse(status_code=exc.status_code, content={"code": code, "message": message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """统一处理 Pydantic 请求参数校验错误。"""

    return JSONResponse(
        status_code=422,
        content={"code": "VALIDATION_ERROR", "message": "请求参数不合法", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def unexpected_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """兜底处理未预期异常，避免向客户端泄露堆栈和密钥信息。"""

    logger.exception("Unhandled error on %s", request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"code": "INTERNAL_SERVER_ERROR", "message": "服务器内部错误，请查看服务日志。"},
    )


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """服务健康检查。"""

    return {"status": "ok", "service": settings.app_name}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """访问根地址时跳转到 Swagger 接口文档。"""

    return RedirectResponse(url="/docs")
