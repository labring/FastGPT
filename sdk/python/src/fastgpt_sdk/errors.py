"""结构化异常层级与敏感凭据自动脱敏工具。

统一抹平 HTTP 状态码错误、NextAPI 业务包体错误（code >= 400）及 SSE 流内错误帧，
并确保任何异常消息与 URL 中均不泄漏明文 API Key 或敏感令牌。
"""

from __future__ import annotations

import re
from collections.abc import Sequence

_BEARER_SECRET_RE = re.compile(r"\b(Bearer\s+)([A-Za-z0-9._-]{8,})", re.IGNORECASE)
_FASTGPT_KEY_RE = re.compile(r"\b((?:fastgpt|openapi)-[A-Za-z0-9_-]{8,})")
_QUERY_SECRET_RE = re.compile(r"([?&](?:ticket|token|apiKey)=)([^&#\s]+)", re.IGNORECASE)
_UPLOAD_SESSION_PATH_RE = re.compile(r"(/system/file/u/)([^/?#\s]{8,})", re.IGNORECASE)

_AUTH_STATUS_TEXT_RE = re.compile(r"(?:^unAuth|UnAuth$|^unPermission$)", re.IGNORECASE)
_NOT_FOUND_STATUS_TEXT_RE = re.compile(
    r"(?:^unExist|UnExist$|NotFound|NotExist|not_found)", re.IGNORECASE
)


def _mask_token(secret: str) -> str:
    if len(secret) <= 8:
        return "****"
    return f"{secret[:4]}****{secret[-4:]}"


def _normalize_extra_secret(raw: str) -> str:
    stripped = raw.strip()
    return re.sub(r"^Bearer\s+", "", stripped, flags=re.IGNORECASE).strip()


def redact_secrets(text: str, extra_secrets: Sequence[str] | None = None) -> str:
    """对错误消息与请求 URL 中的 Bearer 密钥、fastgpt/openapi Key、自定义凭据及查询令牌脱敏。"""
    result = _BEARER_SECRET_RE.sub(lambda m: f"{m.group(1)}{_mask_token(m.group(2))}", text)
    result = _FASTGPT_KEY_RE.sub(lambda m: _mask_token(m.group(1)), result)
    result = _QUERY_SECRET_RE.sub(lambda m: f"{m.group(1)}****", result)
    result = _UPLOAD_SESSION_PATH_RE.sub(lambda m: f"{m.group(1)}****", result)

    if extra_secrets:
        for raw_secret in extra_secrets:
            secret = _normalize_extra_secret(raw_secret)
            # 仅对长度足够的实际凭据执行精确替换，避免误伤极短普通词段
            if len(secret) >= 6 and secret in result:
                result = result.replace(secret, _mask_token(secret))

    return result


class FastGPTError(Exception):
    """FastGPT SDK 基础异常类，所有网络、鉴权与服务端业务异常均继承自此类。"""

    http_status: int | None
    server_code: int | None
    status_text: str | None
    request_id: str | None
    url: str | None

    def __init__(
        self,
        message: str,
        *,
        http_status: int | None = None,
        server_code: int | None = None,
        status_text: str | None = None,
        request_id: str | None = None,
        url: str | None = None,
        cause: BaseException | None = None,
        extra_secrets: Sequence[str] | None = None,
    ) -> None:
        safe_message = redact_secrets(message, extra_secrets)
        super().__init__(safe_message)
        self.message = safe_message
        self.http_status = http_status
        self.server_code = server_code
        self.status_text = status_text
        self.request_id = request_id
        self.url = redact_secrets(url, extra_secrets) if url is not None else None
        if cause is not None:
            self.__cause__ = cause


class FastGPTAuthError(FastGPTError):
    """鉴权或权限异常（401 / 403 / 514 或缺失 API Key）。"""


class FastGPTBadRequestError(FastGPTError):
    """请求参数校验或业务前置条件失败（4xx）。"""


class FastGPTNotFoundError(FastGPTError):
    """目标资源不存在或无权限可见（404 / 410）。"""


class FastGPTConflictError(FastGPTError):
    """并发冲突或会话仍在生成中（409 / chatIsGenerating）。"""


class FastGPTRateLimitError(FastGPTError):
    """触发限流或配额限制（429 / tooManyRequest）。"""


class FastGPTServerError(FastGPTError):
    """FastGPT 服务端内部错误（5xx）。"""


class FastGPTTimeoutError(FastGPTError):
    """请求超时（包含握手及完整响应体读取超时）。"""


class FastGPTNetworkError(FastGPTError):
    """底层网络连接异常或流传输意外截断。"""


def create_mapped_api_error(
    *,
    message: str,
    http_status: int | None = None,
    server_code: int | None = None,
    status_text: str | None = None,
    request_id: str | None = None,
    url: str | None = None,
    cause: BaseException | None = None,
    extra_secrets: Sequence[str] | None = None,
) -> FastGPTError:
    """根据 HTTP 状态码、服务端业务 code 与 statusText 映射具体的异常子类。

    优先尊重明确的 HTTP 4xx/5xx 语义，仅在旧版 HTTP 200/500 通用包装或无 HTTP 状态的 SSE 错误帧上
    依据业务错误码与 statusText 做兼容回退。
    """
    kwargs: dict[str, object] = {
        "http_status": http_status,
        "server_code": server_code,
        "status_text": status_text,
        "request_id": request_id,
        "url": url,
        "cause": cause,
        "extra_secrets": extra_secrets,
    }

    if http_status is not None and http_status not in (200, 500):
        if http_status in (401, 403):
            return FastGPTAuthError(message, **kwargs)  # type: ignore[arg-type]
        if http_status == 409:
            return FastGPTConflictError(message, **kwargs)  # type: ignore[arg-type]
        if http_status == 429:
            return FastGPTRateLimitError(message, **kwargs)  # type: ignore[arg-type]
        if http_status in (404, 410):
            return FastGPTNotFoundError(message, **kwargs)  # type: ignore[arg-type]
        if 400 <= http_status < 500:
            return FastGPTBadRequestError(message, **kwargs)  # type: ignore[arg-type]
        if http_status >= 500:
            return FastGPTServerError(message, **kwargs)  # type: ignore[arg-type]

    if server_code in (401, 403, 514) or (
        status_text is not None and _AUTH_STATUS_TEXT_RE.search(status_text) is not None
    ):
        return FastGPTAuthError(message, **kwargs)  # type: ignore[arg-type]

    if server_code == 409 or status_text == "chatIsGenerating":
        return FastGPTConflictError(message, **kwargs)  # type: ignore[arg-type]

    if server_code == 429 or status_text in ("tooManyRequest", "uploadFileIntervalLimit"):
        return FastGPTRateLimitError(message, **kwargs)  # type: ignore[arg-type]

    if server_code in (404, 410) or (
        status_text is not None and _NOT_FOUND_STATUS_TEXT_RE.search(status_text) is not None
    ):
        return FastGPTNotFoundError(message, **kwargs)  # type: ignore[arg-type]

    if server_code is not None and 400 <= server_code < 500:
        return FastGPTBadRequestError(message, **kwargs)  # type: ignore[arg-type]

    return FastGPTServerError(message, **kwargs)  # type: ignore[arg-type]
