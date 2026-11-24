"""可观测性钩子与日志脱敏分发器（同步/异步共用）。"""

from __future__ import annotations

import inspect
import logging
from collections.abc import Sequence
from typing import Any

from .errors import (
    FastGPTAuthError,
    FastGPTBadRequestError,
    FastGPTConflictError,
    FastGPTError,
    FastGPTNetworkError,
    FastGPTNotFoundError,
    FastGPTRateLimitError,
    FastGPTServerError,
    FastGPTTimeoutError,
    redact_secrets,
)
from .options import (
    ErrorHookContext,
    FastGPTHooks,
    FastGPTLogger,
    FastGPTLogLevel,
    RequestHookContext,
    ResponseHookContext,
)

_SENSITIVE_HEADER_NAMES = frozenset(
    {
        "authorization",
        "proxy-authorization",
        "x-api-key",
        "cookie",
        "set-cookie",
    }
)

_LOG_LEVEL_MAP: dict[FastGPTLogLevel, int] = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warn": logging.WARNING,
    "error": logging.ERROR,
    "silent": logging.CRITICAL + 10,
}

_MAX_CAUSE_DEPTH = 3


def redact_headers(
    headers: dict[str, str],
    extra_secrets: Sequence[str] | None = None,
) -> dict[str, str]:
    """对请求头中的鉴权与会话字段执行脱敏，确保钩子与日志不泄漏明文凭证。"""
    sanitized: dict[str, str] = {}
    for key, value in headers.items():
        redacted = redact_secrets(value, extra_secrets)
        if key.lower() in _SENSITIVE_HEADER_NAMES and redacted == value:
            sanitized[key] = "****"
        else:
            sanitized[key] = redacted
    return sanitized


class _LevelFilteredLogger:
    """基于内置日志级别过滤的标准日志适配器。"""

    def __init__(self, level: FastGPTLogLevel) -> None:
        self._min_level = _LOG_LEVEL_MAP[level]
        self._logger = logging.getLogger("fastgpt_sdk")

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        if self._min_level <= logging.DEBUG:
            self._logger.debug(f"[fastgpt-sdk] {msg}", *args, **kwargs)

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        if self._min_level <= logging.INFO:
            self._logger.info(f"[fastgpt-sdk] {msg}", *args, **kwargs)

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        if self._min_level <= logging.WARNING:
            self._logger.warning(f"[fastgpt-sdk] {msg}", *args, **kwargs)

    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        if self._min_level <= logging.ERROR:
            self._logger.error(f"[fastgpt-sdk] {msg}", *args, **kwargs)


def resolve_logger(logger: FastGPTLogger | FastGPTLogLevel | None) -> FastGPTLogger | None:
    """将日志级别字符串或自定义 Logger 对象归一化为统一日志接口。"""
    if logger is None or logger == "silent":
        return None
    if isinstance(logger, str):
        return _LevelFilteredLogger(logger)
    return logger


def _log_warning(logger: FastGPTLogger | None, msg: str) -> None:
    if logger is None:
        return
    warn_fn = getattr(logger, "warning", None) or getattr(logger, "warn", None)
    if callable(warn_fn):
        warn_fn(msg)


def _instantiate_fastgpt_error_view(
    source: FastGPTError,
    message: str,
    *,
    extra_secrets: Sequence[str] | None,
    cause: BaseException | None,
) -> FastGPTError:
    status_text = (
        redact_secrets(source.status_text, extra_secrets)
        if source.status_text is not None
        else None
    )
    url = redact_secrets(source.url, extra_secrets) if source.url is not None else None
    cls: type[FastGPTError] = FastGPTError
    if isinstance(source, FastGPTAuthError):
        cls = FastGPTAuthError
    elif isinstance(source, FastGPTBadRequestError):
        cls = FastGPTBadRequestError
    elif isinstance(source, FastGPTNotFoundError):
        cls = FastGPTNotFoundError
    elif isinstance(source, FastGPTConflictError):
        cls = FastGPTConflictError
    elif isinstance(source, FastGPTRateLimitError):
        cls = FastGPTRateLimitError
    elif isinstance(source, FastGPTServerError):
        cls = FastGPTServerError
    elif isinstance(source, FastGPTTimeoutError):
        cls = FastGPTTimeoutError
    elif isinstance(source, FastGPTNetworkError):
        cls = FastGPTNetworkError

    return cls(
        message,
        http_status=source.http_status,
        server_code=source.server_code,
        status_text=status_text,
        request_id=source.request_id,
        url=url,
        cause=cause,
        extra_secrets=extra_secrets,
    )


def _sanitize_cause(
    cause: BaseException | None,
    *,
    depth: int,
    extra_secrets: Sequence[str] | None,
) -> BaseException | None:
    if cause is None:
        return None
    if depth >= _MAX_CAUSE_DEPTH:
        return RuntimeError(
            redact_secrets(f"{type(cause).__name__}: {cause}", extra_secrets)
        )
    return sanitize_error_for_hook(cause, extra_secrets=extra_secrets, depth=depth + 1)


def sanitize_error_for_hook(
    error: Exception | BaseException,
    *,
    extra_secrets: Sequence[str] | None = None,
    depth: int = 0,
) -> Exception:
    """为 on_error 钩子构造独立脱敏异常视图，剥离原始异常与 cause 上可能携带凭据的附加属性。"""
    sanitized_cause = _sanitize_cause(
        error.__cause__,
        depth=depth,
        extra_secrets=extra_secrets,
    )

    if isinstance(error, FastGPTError):
        return _instantiate_fastgpt_error_view(
            error,
            redact_secrets(error.message, extra_secrets),
            extra_secrets=extra_secrets,
            cause=sanitized_cause,
        )

    view = RuntimeError(redact_secrets(f"{type(error).__name__}: {error}", extra_secrets))
    if sanitized_cause is not None:
        view.__cause__ = sanitized_cause
    return view


def _build_sanitized_request_ctx(
    context: RequestHookContext,
    extra_secrets: Sequence[str] | None,
) -> RequestHookContext:
    return RequestHookContext(
        operation_id=context.operation_id,
        method=context.method,
        url=redact_secrets(context.url, extra_secrets),
        headers=redact_headers(context.headers, extra_secrets),
        attempt=context.attempt,
    )


def _build_sanitized_response_ctx(
    context: ResponseHookContext,
    extra_secrets: Sequence[str] | None,
) -> ResponseHookContext:
    return ResponseHookContext(
        operation_id=context.operation_id,
        method=context.method,
        url=redact_secrets(context.url, extra_secrets),
        status_code=context.status_code,
        request_id=context.request_id,
        duration_ms=context.duration_ms,
        attempt=context.attempt,
    )


def _build_sanitized_error_ctx(
    context: ErrorHookContext,
    extra_secrets: Sequence[str] | None,
) -> ErrorHookContext:
    return ErrorHookContext(
        operation_id=context.operation_id,
        method=context.method,
        url=redact_secrets(context.url, extra_secrets),
        duration_ms=context.duration_ms,
        attempt=context.attempt,
        error=sanitize_error_for_hook(context.error, extra_secrets=extra_secrets),
    )


def notify_request_sync(
    *,
    hooks: FastGPTHooks | None,
    logger: FastGPTLogger | None,
    context: RequestHookContext,
    extra_secrets: Sequence[str] | None = None,
) -> None:
    safe_ctx = _build_sanitized_request_ctx(context, extra_secrets)
    if logger is not None:
        logger.debug(
            "%s %s (op=%s, attempt=%s)",
            safe_ctx.method,
            safe_ctx.url,
            safe_ctx.operation_id,
            safe_ctx.attempt,
        )
    if hooks is not None and hooks.on_request is not None:
        try:
            res = hooks.on_request(safe_ctx)
            if inspect.iscoroutine(res):
                res.close()
                _log_warning(logger, "on_request async hook was ignored in sync FastGPT client")
        except Exception as exc:
            _log_warning(
                logger,
                redact_secrets(f"FastGPT SDK on_request hook failed: {exc}", extra_secrets),
            )


async def notify_request_async(
    *,
    hooks: FastGPTHooks | None,
    logger: FastGPTLogger | None,
    context: RequestHookContext,
    extra_secrets: Sequence[str] | None = None,
) -> None:
    safe_ctx = _build_sanitized_request_ctx(context, extra_secrets)
    if logger is not None:
        logger.debug(
            "%s %s (op=%s, attempt=%s)",
            safe_ctx.method,
            safe_ctx.url,
            safe_ctx.operation_id,
            safe_ctx.attempt,
        )
    if hooks is not None and hooks.on_request is not None:
        try:
            res = hooks.on_request(safe_ctx)
            if inspect.isawaitable(res):
                await res
        except Exception as exc:
            _log_warning(
                logger,
                redact_secrets(f"FastGPT SDK on_request hook failed: {exc}", extra_secrets),
            )


def notify_response_sync(
    *,
    hooks: FastGPTHooks | None,
    logger: FastGPTLogger | None,
    context: ResponseHookContext,
    extra_secrets: Sequence[str] | None = None,
) -> None:
    safe_ctx = _build_sanitized_response_ctx(context, extra_secrets)
    if logger is not None:
        logger.debug(
            "%s %s -> %s (%.1fms, req_id=%s)",
            safe_ctx.method,
            safe_ctx.url,
            safe_ctx.status_code,
            safe_ctx.duration_ms,
            safe_ctx.request_id,
        )
    if hooks is not None and hooks.on_response is not None:
        try:
            res = hooks.on_response(safe_ctx)
            if inspect.iscoroutine(res):
                res.close()
                _log_warning(logger, "on_response async hook was ignored in sync FastGPT client")
        except Exception as exc:
            _log_warning(
                logger,
                redact_secrets(f"FastGPT SDK on_response hook failed: {exc}", extra_secrets),
            )


async def notify_response_async(
    *,
    hooks: FastGPTHooks | None,
    logger: FastGPTLogger | None,
    context: ResponseHookContext,
    extra_secrets: Sequence[str] | None = None,
) -> None:
    safe_ctx = _build_sanitized_response_ctx(context, extra_secrets)
    if logger is not None:
        logger.debug(
            "%s %s -> %s (%.1fms, req_id=%s)",
            safe_ctx.method,
            safe_ctx.url,
            safe_ctx.status_code,
            safe_ctx.duration_ms,
            safe_ctx.request_id,
        )
    if hooks is not None and hooks.on_response is not None:
        try:
            res = hooks.on_response(safe_ctx)
            if inspect.isawaitable(res):
                await res
        except Exception as exc:
            _log_warning(
                logger,
                redact_secrets(f"FastGPT SDK on_response hook failed: {exc}", extra_secrets),
            )


def notify_error_sync(
    *,
    hooks: FastGPTHooks | None,
    logger: FastGPTLogger | None,
    context: ErrorHookContext,
    extra_secrets: Sequence[str] | None = None,
) -> None:
    safe_ctx = _build_sanitized_error_ctx(context, extra_secrets)
    if logger is not None:
        logger.error(
            "%s %s failed: %s (%s)",
            safe_ctx.method,
            safe_ctx.url,
            type(safe_ctx.error).__name__,
            safe_ctx.error,
        )
    if hooks is not None and hooks.on_error is not None:
        try:
            res = hooks.on_error(safe_ctx)
            if inspect.iscoroutine(res):
                res.close()
                _log_warning(logger, "on_error async hook was ignored in sync FastGPT client")
        except Exception as exc:
            _log_warning(
                logger,
                redact_secrets(f"FastGPT SDK on_error hook failed: {exc}", extra_secrets),
            )


async def notify_error_async(
    *,
    hooks: FastGPTHooks | None,
    logger: FastGPTLogger | None,
    context: ErrorHookContext,
    extra_secrets: Sequence[str] | None = None,
) -> None:
    safe_ctx = _build_sanitized_error_ctx(context, extra_secrets)
    if logger is not None:
        logger.error(
            "%s %s failed: %s (%s)",
            safe_ctx.method,
            safe_ctx.url,
            type(safe_ctx.error).__name__,
            safe_ctx.error,
        )
    if hooks is not None and hooks.on_error is not None:
        try:
            res = hooks.on_error(safe_ctx)
            if inspect.isawaitable(res):
                await res
        except Exception as exc:
            _log_warning(
                logger,
                redact_secrets(f"FastGPT SDK on_error hook failed: {exc}", extra_secrets),
            )
