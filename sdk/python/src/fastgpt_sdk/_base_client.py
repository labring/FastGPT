"""Sync/Async SDK 底层传输、鉴权、重连退避、身份注入与契约编解码底座。"""

from __future__ import annotations

import asyncio
import contextlib
import email.utils
import inspect
import json
import os
import random
import time
import urllib.parse
from collections.abc import AsyncIterator, Iterator, Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar
from urllib.parse import quote

import httpx
from pydantic import BaseModel, TypeAdapter, ValidationError

from ._async import aclose_shielded
from ._hooks import (
    notify_error_async,
    notify_error_sync,
    notify_request_async,
    notify_request_sync,
    notify_response_async,
    notify_response_sync,
    resolve_logger,
)
from ._multipart import MultipartFileTuple, build_multipart_payload
from ._version import SDK_VERSION
from .errors import (
    FastGPTAuthError,
    FastGPTBadRequestError,
    FastGPTError,
    FastGPTNetworkError,
    FastGPTTimeoutError,
    create_mapped_api_error,
)
from .options import (
    APIResponse,
    AsyncCredentialProvider,
    AuthProxyIdentity,
    ContextCarrier,
    CredentialProvider,
    ErrorHookContext,
    FastGPTHooks,
    FastGPTIdentity,
    FastGPTLogger,
    FastGPTLogLevel,
    NotGiven,
    OperationSpec,
    RawResponseInfo,
    RequestHookContext,
    RequestOptions,
    ResponseHookContext,
    is_readable_binary_stream,
)
from .sse import AsyncChatStream, ChatStream

_ResT = TypeVar("_ResT")

_DEFAULT_BASE_URL = "https://cloud.fastgpt.cn"
_DEFAULT_TIMEOUT = 60.0
_DEFAULT_GET_MAX_RETRIES = 2
_RETRYABLE_HTTP_STATUSES = frozenset({408, 429, 502, 503, 504})
_AUTH_SECRET_HEADER_NAMES = frozenset({"authorization", "proxy-authorization", "x-api-key"})


def normalize_api_base_url(raw_base_url: str | None = None) -> str:
    """将用户传入的 base_url 归一化为以 ``/api`` 结尾的标准 API 根路径。"""
    candidate = (
        raw_base_url
        if raw_base_url is not None and raw_base_url.strip()
        else os.environ.get("FASTGPT_BASE_URL") or _DEFAULT_BASE_URL
    ).strip()
    without_trailing = candidate.rstrip("/")
    if without_trailing.endswith("/api"):
        return without_trailing
    return f"{without_trailing}/api"


@lru_cache(maxsize=256)
def _get_type_adapter(tp: Any) -> TypeAdapter[Any]:
    return TypeAdapter(tp)


def _contains_opaque_stream_or_binary(value: Any) -> bool:
    if isinstance(value, (bytearray, Path)) or is_readable_binary_stream(value):
        return True
    if isinstance(value, (Iterator, AsyncIterator)) and not isinstance(
        value, (str, bytes, bytearray, Path, Mapping, list, tuple)
    ):
        return True
    if isinstance(value, tuple):
        return any(_contains_opaque_stream_or_binary(item) for item in value)
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray, tuple)):
        return any(_contains_opaque_stream_or_binary(item) for item in value)
    return False


def _dump_request_model(model: BaseModel) -> dict[str, Any]:
    """导出请求模型为 wire 字典，同时保留未被 pydantic_core 转成迭代器的原始流句柄与元组。"""
    dumped = model.model_dump(mode="python", by_alias=True, exclude_unset=True)
    for field_name, field_info in type(model).model_fields.items():
        if field_name not in model.model_fields_set:
            continue
        raw_val = getattr(model, field_name)
        if not _contains_opaque_stream_or_binary(raw_val):
            continue
        wire_key = field_info.serialization_alias or field_info.alias or field_name
        if wire_key in dumped:
            dumped[wire_key] = raw_val
        elif field_name in dumped:
            dumped[field_name] = raw_val
    return dumped


def _unwrap_models_in_collection(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return _dump_request_model(value)
    if isinstance(value, Mapping):
        return {k: _unwrap_models_in_collection(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_unwrap_models_in_collection(v) for v in value]
    return value


def prepare_request_payload(
    *,
    request_type: Any,
    request: Any = None,
    kwargs: dict[str, Any] | None = None,
    fixed_fields: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    """使用 Pydantic TypeAdapter 校验并序列化入参，保证仅输出显式提供且带 alias 的字段。"""
    if request_type is None:
        if fixed_fields:
            return dict(fixed_fields)
        return None

    clean_kwargs = (
        {k: v for k, v in kwargs.items() if not isinstance(v, NotGiven)}
        if kwargs
        else {}
    )
    if request is not None and clean_kwargs:
        raise FastGPTBadRequestError(
            "Pass either a positional request object/dict OR keyword arguments, not both"
        )

    raw_source: Any
    if request is not None:
        raw_source = (
            request
            if isinstance(request, BaseModel)
            else _unwrap_models_in_collection(request)
        )
    else:
        raw_source = _unwrap_models_in_collection(clean_kwargs)

    adapter = _get_type_adapter(request_type)
    try:
        validated = adapter.validate_python(raw_source)
    except ValidationError as exc:
        raise FastGPTBadRequestError(
            f"Invalid request payload: {exc}",
            cause=exc,
        ) from exc

    if isinstance(validated, BaseModel):
        dumped = _dump_request_model(validated)
    elif isinstance(validated, dict):
        dumped = dict(validated)
    else:
        dumped = {}

    if fixed_fields:
        dumped.update(fixed_fields)
    return dumped


def _extract_request_id(headers: httpx.Headers) -> str | None:
    return headers.get("x-request-id") or headers.get("x-fastgpt-request-id") or None


def _parse_retry_after_seconds(header_val: str | None) -> float | None:
    if header_val is None:
        return None
    try:
        seconds = float(header_val)
        if seconds >= 0:
            return min(seconds, 30.0)
    except ValueError:
        pass
    try:
        target_dt = email.utils.parsedate_to_datetime(header_val)
        delta = target_dt.timestamp() - time.time()
        return min(max(0.0, delta), 30.0)
    except Exception:
        return None


def _compute_backoff_seconds(attempt: int) -> float:
    return float(min(0.3 * (2**attempt) + random.uniform(0.0, 0.1), 5.0))


def _set_header_case_insensitive(
    headers: dict[str, str],
    name: str,
    value: str,
) -> None:
    lower = name.lower()
    existing_keys = [k for k in headers if k.lower() == lower]
    for k in existing_keys:
        del headers[k]
    headers[name] = value


def _has_header_ignore_case(headers: Mapping[str, str], target_name: str) -> bool:
    lower = target_name.lower()
    return any(k.lower() == lower for k in headers)


class _RequestSecretScope:
    """绑定到单次请求生命周期的敏感凭据收集器，防止脱敏遗漏或并发串扰。"""

    def __init__(self) -> None:
        self._secrets: list[str] = []
        self._seen: set[str] = set()

    def add(self, raw_secret: str | None) -> None:
        if raw_secret is None:
            return
        trimmed = raw_secret.strip()
        if len(trimmed) >= 6 and trimmed not in self._seen:
            self._seen.add(trimmed)
            self._secrets.append(trimmed)
        if trimmed.lower().startswith("bearer "):
            stripped = trimmed[7:].strip()
            if len(stripped) >= 6 and stripped not in self._seen:
                self._seen.add(stripped)
                self._secrets.append(stripped)

    def add_from_headers(self, headers: Mapping[str, str] | None) -> None:
        if not headers:
            return
        for key, val in headers.items():
            if key.lower() in _AUTH_SECRET_HEADER_NAMES:
                self.add(val)

    def snapshot(self) -> tuple[str, ...]:
        return tuple(self._secrets)


def _normalize_identity_input(
    *,
    custom_uid: Any = None,
    auth_proxy: Any = None,
    identity: FastGPTIdentity | Mapping[str, Any] | None = None,
) -> FastGPTIdentity | None:
    if identity is not None:
        try:
            return FastGPTIdentity.model_validate(_unwrap_models_in_collection(identity))
        except ValidationError as exc:
            raise FastGPTBadRequestError(f"Invalid identity: {exc}", cause=exc) from exc

    if custom_uid is not None and auth_proxy is not None:
        raise FastGPTBadRequestError(
            '"custom_uid" and "auth_proxy" are mutually exclusive and cannot be set together'
        )
    if custom_uid is not None:
        return FastGPTIdentity(custom_uid=str(custom_uid))
    if auth_proxy is not None:
        try:
            proxy_model = AuthProxyIdentity.model_validate(
                _unwrap_models_in_collection(auth_proxy)
            )
            return FastGPTIdentity(auth_proxy=proxy_model)
        except ValidationError as exc:
            raise FastGPTBadRequestError(f"Invalid auth_proxy: {exc}", cause=exc) from exc
    return None


def _encode_query_pairs(query_obj: Mapping[str, Any]) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for key, val in query_obj.items():
        if val is None:
            continue
        if isinstance(val, (list, tuple)):
            for item in val:
                if item is None:
                    continue
                if isinstance(item, bool):
                    pairs.append((key, "true" if item else "false"))
                elif isinstance(item, (dict, list)):
                    pairs.append((key, json.dumps(item, ensure_ascii=False, separators=(",", ":"))))
                else:
                    pairs.append((key, str(item)))
        elif isinstance(val, bool):
            pairs.append((key, "true" if val else "false"))
        elif isinstance(val, dict):
            pairs.append((key, json.dumps(val, ensure_ascii=False, separators=(",", ":"))))
        else:
            pairs.append((key, str(val)))
    return pairs


def _build_full_url(base_url: str, resolved_path: str, query_obj: Mapping[str, Any]) -> str:
    raw = f"{base_url}{resolved_path}"
    pairs = _encode_query_pairs(query_obj)
    if not pairs:
        return raw
    encoded_qs = urllib.parse.urlencode(pairs)
    separator = "&" if "?" in raw else "?"
    return f"{raw}{separator}{encoded_qs}"


class _PreparedHttpCall:
    __slots__ = (
        "url",
        "headers",
        "json_body",
        "content_body",
        "files",
        "form_data",
        "is_stream_body",
    )

    def __init__(
        self,
        *,
        url: str,
        headers: dict[str, str],
        json_body: Any = None,
        content_body: Any = None,
        files: list[tuple[str, MultipartFileTuple]] | None = None,
        form_data: dict[str, str] | None = None,
        is_stream_body: bool = False,
    ) -> None:
        self.url = url
        self.headers = headers
        self.json_body = json_body
        self.content_body = content_body
        self.files = files
        self.form_data = form_data
        self.is_stream_body = is_stream_body


class _BaseClientCore:
    """SyncBaseClient 与 AsyncBaseClient 共享的无 I/O 配置解析、上下文注入与错误/响应解码核心。"""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: Any = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = _DEFAULT_TIMEOUT,
        max_retries: int | None = None,
        default_headers: Mapping[str, str] | None = None,
        hooks: FastGPTHooks | None = None,
        logger: FastGPTLogger | FastGPTLogLevel | None = None,
    ) -> None:
        self.api_base_url = normalize_api_base_url(base_url)
        self._api_key_provider = api_key
        self._default_app_id = default_app_id
        self._identity = _normalize_identity_input(identity=identity)
        self._timeout: float | httpx.Timeout | None = (
            _DEFAULT_TIMEOUT if timeout is None else timeout
        )
        self._max_retries = max_retries
        self._default_headers = dict(default_headers) if default_headers else {}
        self._hooks = hooks
        self._logger_raw = logger
        self._logger = resolve_logger(logger)

    def _init_secret_scope(self, request_options: RequestOptions | None) -> _RequestSecretScope:
        scope = _RequestSecretScope()
        if isinstance(self._api_key_provider, str):
            scope.add(self._api_key_provider)
        if request_options:
            scope.add(request_options.get("api_key"))
            scope.add_from_headers(request_options.get("headers"))
        scope.add_from_headers(self._default_headers)
        return scope

    def _resolve_effective_identity(
        self,
        raw_input: dict[str, Any] | None,
        request_options: RequestOptions | None,
    ) -> FastGPTIdentity | None:
        if (
            request_options
            and request_options.get("custom_uid") is not None
            and request_options.get("auth_proxy") is not None
        ):
            raise FastGPTBadRequestError(
                'RequestOptions "custom_uid" and "auth_proxy" are mutually exclusive and '
                "cannot be set together"
            )

        if (
            raw_input
            and raw_input.get("customUid") is not None
            and raw_input.get("authProxy") is not None
        ):
            raise FastGPTBadRequestError(
                'Request payload "customUid" and "authProxy" are mutually exclusive and '
                "cannot be set together"
            )

        if request_options:
            if request_options.get("custom_uid") is not None:
                return FastGPTIdentity(custom_uid=str(request_options["custom_uid"]))
            if request_options.get("auth_proxy") is not None:
                return _normalize_identity_input(auth_proxy=request_options["auth_proxy"])

        if raw_input and (
            raw_input.get("customUid") is not None or raw_input.get("authProxy") is not None
        ):
            # 当调用方直接传入字符串形式的 authProxy（如 query JSON 字符串）时，
            # 保留原入参且不再叠加客户端默认身份。
            if isinstance(raw_input.get("authProxy"), str):
                return None
            return _normalize_identity_input(
                custom_uid=raw_input.get("customUid"),
                auth_proxy=raw_input.get("authProxy"),
            )

        return self._identity

    def _inject_context_into_target(
        self,
        *,
        target: dict[str, Any],
        spec: OperationSpec,
        carrier_type: ContextCarrier,
        effective_identity: FastGPTIdentity | None,
    ) -> None:
        if (
            spec.app_id_carrier == carrier_type
            and target.get("appId") is None
            and self._default_app_id is not None
        ):
            target["appId"] = self._default_app_id

        if spec.identity_carrier == carrier_type and effective_identity is not None:
            if effective_identity.custom_uid is not None:
                target["customUid"] = effective_identity.custom_uid
                target.pop("authProxy", None)
            elif effective_identity.auth_proxy is not None:
                target["authProxy"] = effective_identity.auth_proxy.model_dump(
                    mode="python", by_alias=True, exclude_none=True
                )
                target.pop("customUid", None)

    def _prepare_http_call(
        self,
        *,
        spec: OperationSpec,
        raw_input: dict[str, Any] | None,
        request_options: RequestOptions | None,
        accept_header: str,
    ) -> _PreparedHttpCall:
        effective_identity = self._resolve_effective_identity(raw_input, request_options)
        payload = raw_input or {}

        normalized_path = (
            spec.path[4:]
            if spec.path.startswith("/api/")
            else (spec.path if spec.path.startswith("/") else f"/{spec.path}")
        )
        resolved_path = normalized_path
        consumed_keys: set[str] = set()

        for path_param in spec.path_params:
            raw_val = payload.get(path_param)
            if raw_val is None or len(str(raw_val)) == 0:
                raise FastGPTBadRequestError(
                    f'Missing required path parameter "{path_param}" for '
                    f"{spec.http_method} {spec.path}"
                )
            resolved_path = resolved_path.replace(
                f"{{{path_param}}}", quote(str(raw_val), safe="")
            )
            consumed_keys.add(path_param)

        query_obj: dict[str, Any] = {}
        for q_key in spec.query_params:
            if q_key in payload:
                query_obj[q_key] = payload[q_key]
            consumed_keys.add(q_key)

        self._inject_context_into_target(
            target=query_obj,
            spec=spec,
            carrier_type="query",
            effective_identity=effective_identity,
        )
        full_url = _build_full_url(self.api_base_url, resolved_path, query_obj)

        headers: dict[str, str] = {
            "accept": accept_header,
            "x-fastgpt-client": f"fastgpt-python-sdk/{SDK_VERSION}",
        }
        for hk, hv in self._default_headers.items():
            _set_header_case_insensitive(headers, hk, hv)
        if request_options and request_options.get("headers"):
            for hk, hv in request_options["headers"].items():
                _set_header_case_insensitive(headers, hk, hv)

        if spec.request_content_type == "none":
            return _PreparedHttpCall(url=full_url, headers=headers)

        if spec.request_content_type == "octet-stream":
            bin_field = spec.binary_body_field or "file"
            raw_bin = payload.get(bin_field)
            if raw_bin is None:
                raise FastGPTBadRequestError(
                    f'Missing required binary field "{bin_field}" for '
                    f"{spec.http_method} {spec.path}"
                )
            if not _has_header_ignore_case(headers, "content-type"):
                headers["content-type"] = "application/octet-stream"
            is_stream = hasattr(raw_bin, "__iter__") and not isinstance(
                raw_bin, (bytes, bytearray)
            )
            return _PreparedHttpCall(
                url=full_url,
                headers=headers,
                content_body=bytes(raw_bin) if isinstance(raw_bin, bytearray) else raw_bin,
                is_stream_body=is_stream,
            )

        remaining_payload = {k: v for k, v in payload.items() if k not in consumed_keys}

        if spec.request_content_type == "multipart":
            mp_mode = spec.multipart_mode or "flatFields"
            if mp_mode == "fileAndJsonData":
                self._inject_context_into_target(
                    target=remaining_payload,
                    spec=spec,
                    carrier_type="multipartData",
                    effective_identity=effective_identity,
                )
            files, form_data = build_multipart_payload(payload=remaining_payload, mode=mp_mode)
            return _PreparedHttpCall(
                url=full_url,
                headers=headers,
                files=files,
                form_data=form_data,
            )

        self._inject_context_into_target(
            target=remaining_payload,
            spec=spec,
            carrier_type="body",
            effective_identity=effective_identity,
        )
        return _PreparedHttpCall(
            url=full_url,
            headers=headers,
            json_body=remaining_payload,
        )

    def _apply_auth_headers(
        self,
        *,
        spec: OperationSpec,
        headers: dict[str, str],
        url: str,
        api_key: str | None,
        secret_scope: _RequestSecretScope,
    ) -> dict[str, str]:
        final_headers = dict(headers)
        has_explicit_auth = _has_header_ignore_case(final_headers, "authorization")

        if not has_explicit_auth and api_key:
            auth_val = api_key if api_key.startswith("Bearer ") else f"Bearer {api_key}"
            final_headers["authorization"] = auth_val
        elif not has_explicit_auth and spec.path != "/core/ai/model/list":
            raise FastGPTAuthError(
                'Missing FastGPT API Key. Provide "api_key" in FastGPT(api_key=...), '
                "request_options, or FASTGPT_API_KEY env var.",
                url=url,
                extra_secrets=secret_scope.snapshot(),
            )

        secret_scope.add(api_key)
        secret_scope.add_from_headers(final_headers)
        return final_headers

    def _accept_header_for_spec(self, spec: OperationSpec) -> str:
        if spec.response_mode == "text":
            return "text/csv, text/plain, application/json"
        if spec.response_mode == "binary":
            return "*/*"
        return "application/json"

    def _max_retries_for_request(
        self,
        *,
        spec: OperationSpec,
        is_stream_body: bool,
        request_options: RequestOptions | None,
    ) -> int:
        if is_stream_body or spec.retryable is False:
            return 0
        if request_options and "max_retries" in request_options:
            return max(0, int(request_options["max_retries"]))
        if spec.retryable is True or (spec.retryable is None and spec.http_method == "GET"):
            return self._max_retries if self._max_retries is not None else _DEFAULT_GET_MAX_RETRIES
        return 0

    def _raise_for_http_error(
        self,
        *,
        response: httpx.Response,
        url: str,
        extra_secrets: Sequence[str],
    ) -> None:
        request_id = _extract_request_id(response.headers)
        raw_text = response.text or ""
        if raw_text.strip():
            try:
                parsed = json.loads(raw_text)
                if isinstance(parsed, dict):
                    server_code = (
                        parsed.get("code") if isinstance(parsed.get("code"), int) else None
                    )
                    status_text = (
                        parsed.get("statusText")
                        if isinstance(parsed.get("statusText"), str)
                        else None
                    )
                    err_obj = parsed.get("error")
                    if isinstance(parsed.get("message"), str) and parsed["message"]:
                        message = parsed["message"]
                    elif isinstance(err_obj, dict) and isinstance(err_obj.get("message"), str):
                        message = err_obj["message"]
                    else:
                        message = status_text or f"Request failed with HTTP {response.status_code}"
                    raise create_mapped_api_error(
                        message=message,
                        http_status=response.status_code,
                        server_code=server_code,
                        status_text=status_text,
                        request_id=request_id,
                        url=url,
                        extra_secrets=extra_secrets,
                    )
            except FastGPTError:
                raise
            except Exception:
                pass

        raise create_mapped_api_error(
            message=raw_text[:300] or f"Request failed with HTTP {response.status_code}",
            http_status=response.status_code,
            request_id=request_id,
            url=url,
            extra_secrets=extra_secrets,
        )

    def _decode_success_response(
        self,
        *,
        spec: OperationSpec,
        response: httpx.Response,
        url: str,
        response_type: Any,
        extra_secrets: Sequence[str],
    ) -> Any:
        request_id = _extract_request_id(response.headers)
        if spec.response_mode == "binary":
            return bytes(response.content)

        if spec.response_mode == "text":
            return response.text

        raw_text = response.text or ""
        if not raw_text.strip():
            return None

        try:
            parsed = json.loads(raw_text)
        except Exception:
            if spec.response_mode == "void":
                return None
            return raw_text

        if isinstance(parsed, dict):
            server_code = (
                parsed.get("code") if isinstance(parsed.get("code"), int) else None
            )
            if server_code is not None and server_code >= 400:
                status_text = (
                    parsed.get("statusText")
                    if isinstance(parsed.get("statusText"), str)
                    else None
                )
                message = (
                    parsed["message"]
                    if isinstance(parsed.get("message"), str) and parsed["message"]
                    else (status_text or f"FastGPT API error (code {server_code})")
                )
                raise create_mapped_api_error(
                    message=message,
                    http_status=response.status_code,
                    server_code=server_code,
                    status_text=status_text,
                    request_id=request_id,
                    url=url,
                    extra_secrets=extra_secrets,
                )

            if spec.response_mode == "void":
                return None

            if spec.response_mode == "envelope" and "code" in parsed and "data" in parsed:
                payload = parsed["data"]
                if response_type is None:
                    return payload
                return _get_type_adapter(response_type).validate_python(payload)

        if spec.response_mode == "void":
            return None
        if response_type is None:
            return parsed
        return _get_type_adapter(response_type).validate_python(parsed)

    def _handle_json_stream_handshake_error(
        self,
        *,
        spec: OperationSpec,
        response: httpx.Response,
        url: str,
        raw_text: str,
        request_id: str | None,
        extra_secrets: Sequence[str],
    ) -> None:
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, dict):
                code_val = parsed.get("code")
                if isinstance(code_val, int) and code_val >= 400:
                    msg = parsed.get("message")
                    status_text = parsed.get("statusText")
                    raise create_mapped_api_error(
                        message=(
                            msg
                            if isinstance(msg, str) and msg
                            else f"FastGPT stream error (code {code_val})"
                        ),
                        http_status=response.status_code,
                        server_code=code_val,
                        status_text=status_text if isinstance(status_text, str) else None,
                        request_id=request_id,
                        url=url,
                        extra_secrets=extra_secrets,
                    )
        except FastGPTError:
            raise
        except Exception:
            pass

        content_type = response.headers.get("content-type") or "unknown"
        raise FastGPTError(
            f"Expected text/event-stream response for {spec.path}, received {content_type}",
            http_status=response.status_code,
            request_id=request_id,
            url=url,
            extra_secrets=extra_secrets,
        )

    def _build_httpx_request(
        self,
        *,
        client: httpx.Client | httpx.AsyncClient,
        spec: OperationSpec,
        prepared: _PreparedHttpCall,
        headers: dict[str, str],
        timeout: float | httpx.Timeout | None,
    ) -> httpx.Request:
        req_kwargs: dict[str, Any] = {
            "method": spec.http_method,
            "url": prepared.url,
            "headers": headers,
        }
        if timeout is not None:
            req_kwargs["timeout"] = timeout

        if prepared.json_body is not None:
            req_kwargs["json"] = prepared.json_body
        elif prepared.files is not None:
            req_kwargs["files"] = prepared.files
            if prepared.form_data:
                req_kwargs["data"] = prepared.form_data
        elif prepared.content_body is not None:
            req_kwargs["content"] = prepared.content_body

        return client.build_request(**req_kwargs)


class SyncBaseClient(_BaseClientCore):
    """同步 HTTP 客户端传输、重试与 SSE 调度底座。"""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: CredentialProvider | None = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = _DEFAULT_TIMEOUT,
        max_retries: int | None = None,
        default_headers: Mapping[str, str] | None = None,
        hooks: FastGPTHooks | None = None,
        logger: FastGPTLogger | FastGPTLogLevel | None = None,
        http_client: httpx.Client | None = None,
        _owns_http_client: bool | None = None,
    ) -> None:
        super().__init__(
            base_url=base_url,
            api_key=api_key,
            default_app_id=default_app_id,
            identity=identity,
            timeout=timeout,
            max_retries=max_retries,
            default_headers=default_headers,
            hooks=hooks,
            logger=logger,
        )
        if http_client is not None:
            self._http_client = http_client
            self._owns_http_client = (
            False if _owns_http_client is None else bool(_owns_http_client)
        )
        else:
            self._http_client = httpx.Client(timeout=self._timeout)
            self._owns_http_client = True

    def close(self) -> None:
        """若本客户端独占底层 ``httpx.Client`` 连接池，则将其安全关闭。"""
        if self._owns_http_client:
            self._http_client.close()

    def _resolve_api_key_sync(self, request_options: RequestOptions | None) -> str | None:
        if request_options and request_options.get("api_key") is not None:
            return str(request_options["api_key"])
        configured = self._api_key_provider
        if configured is None:
            env_val = os.environ.get("FASTGPT_API_KEY")
            return env_val.strip() if env_val and env_val.strip() else None
        if callable(configured):
            resolved = configured()
            if inspect.iscoroutine(resolved):
                resolved.close()
                raise FastGPTAuthError("Sync FastGPT client cannot await async api_key provider")
            return str(resolved)
        return str(configured)

    def _send_with_retry_sync(
        self,
        *,
        spec: OperationSpec,
        prepared: _PreparedHttpCall,
        request_options: RequestOptions | None,
        secret_scope: _RequestSecretScope,
        stream: bool,
    ) -> tuple[httpx.Response, int]:
        api_key = self._resolve_api_key_sync(request_options)
        final_headers = self._apply_auth_headers(
            spec=spec,
            headers=prepared.headers,
            url=prepared.url,
            api_key=api_key,
            secret_scope=secret_scope,
        )
        extra_secrets = secret_scope.snapshot()
        timeout = (
            request_options["timeout"]
            if request_options and "timeout" in request_options
            else self._timeout
        )
        max_retries = (
            0
            if stream
            else self._max_retries_for_request(
                spec=spec,
                is_stream_body=prepared.is_stream_body,
                request_options=request_options,
            )
        )

        attempt = 0
        while True:
            attempt_start = time.monotonic()
            notify_request_sync(
                hooks=self._hooks,
                logger=self._logger,
                context=RequestHookContext(
                    operation_id=spec.id,
                    method=spec.http_method,
                    url=prepared.url,
                    headers=final_headers,
                    attempt=attempt,
                ),
                extra_secrets=extra_secrets,
            )

            try:
                httpx_req = self._build_httpx_request(
                    client=self._http_client,
                    spec=spec,
                    prepared=prepared,
                    headers=final_headers,
                    timeout=timeout,
                )
                response = self._http_client.send(httpx_req, stream=stream)
            except FastGPTError:
                raise
            except httpx.TimeoutException as exc:
                if attempt < max_retries:
                    attempt += 1
                    time.sleep(_compute_backoff_seconds(attempt - 1))
                    continue
                raise FastGPTTimeoutError(
                    f"Request to {spec.http_method} {spec.path} timed out",
                    url=prepared.url,
                    cause=exc,
                    extra_secrets=extra_secrets,
                ) from exc
            except httpx.RequestError as exc:
                if attempt < max_retries:
                    attempt += 1
                    time.sleep(_compute_backoff_seconds(attempt - 1))
                    continue
                raise FastGPTNetworkError(
                    f"Network request failed: {exc}",
                    url=prepared.url,
                    cause=exc,
                    extra_secrets=extra_secrets,
                ) from exc
            except Exception as exc:
                raise FastGPTNetworkError(
                    f"Transport request failed: {exc}",
                    url=prepared.url,
                    cause=exc,
                    extra_secrets=extra_secrets,
                ) from exc

            retry_backoff: float | None = None
            try:
                duration_ms = (time.monotonic() - attempt_start) * 1000.0
                notify_response_sync(
                    hooks=self._hooks,
                    logger=self._logger,
                    context=ResponseHookContext(
                        operation_id=spec.id,
                        method=spec.http_method,
                        url=prepared.url,
                        status_code=response.status_code,
                        request_id=_extract_request_id(response.headers),
                        duration_ms=duration_ms,
                        attempt=attempt,
                    ),
                    extra_secrets=extra_secrets,
                )

                if response.status_code in _RETRYABLE_HTTP_STATUSES and attempt < max_retries:
                    retry_backoff = _parse_retry_after_seconds(response.headers.get("retry-after"))
                    if retry_backoff is None:
                        retry_backoff = _compute_backoff_seconds(attempt)
                    response.close()
                else:
                    return response, attempt
            except BaseException:
                with contextlib.suppress(Exception):
                    response.close()
                raise

            attempt += 1
            time.sleep(retry_backoff)

    def _request_raw(
        self,
        *,
        spec: OperationSpec,
        request_type: Any,
        response_type: Any,
        request: Any = None,
        kwargs: dict[str, Any] | None = None,
        fixed_fields: Mapping[str, Any] | None = None,
        request_options: RequestOptions | None = None,
    ) -> APIResponse[Any]:
        started_at = time.monotonic()
        request_url = f"{self.api_base_url}{spec.path}"
        last_attempt = 0
        secret_scope = self._init_secret_scope(request_options)

        try:
            raw_input = prepare_request_payload(
                request_type=request_type,
                request=request,
                kwargs=kwargs,
                fixed_fields=fixed_fields,
            )
            prepared = self._prepare_http_call(
                spec=spec,
                raw_input=raw_input,
                request_options=request_options,
                accept_header=self._accept_header_for_spec(spec),
            )
            request_url = prepared.url
            secret_scope.add_from_headers(prepared.headers)

            response, last_attempt = self._send_with_retry_sync(
                spec=spec,
                prepared=prepared,
                request_options=request_options,
                secret_scope=secret_scope,
                stream=False,
            )
            try:
                extra_secrets = secret_scope.snapshot()

                if response.status_code >= 400:
                    self._raise_for_http_error(
                        response=response,
                        url=prepared.url,
                        extra_secrets=extra_secrets,
                    )

                decoded = self._decode_success_response(
                    spec=spec,
                    response=response,
                    url=prepared.url,
                    response_type=response_type,
                    extra_secrets=extra_secrets,
                )
                response_info = RawResponseInfo(
                    status_code=response.status_code,
                    headers=response.headers,
                    request_id=_extract_request_id(response.headers),
                    url=prepared.url,
                )
                return APIResponse(
                    http_response=response,
                    response_info=response_info,
                    parse_fn=lambda: decoded,
                )
            except BaseException:
                with contextlib.suppress(Exception):
                    response.close()
                raise
        except Exception as exc:
            notify_error_sync(
                hooks=self._hooks,
                logger=self._logger,
                context=ErrorHookContext(
                    operation_id=spec.id,
                    method=spec.http_method,
                    url=request_url,
                    duration_ms=(time.monotonic() - started_at) * 1000.0,
                    attempt=last_attempt,
                    error=exc,
                ),
                extra_secrets=secret_scope.snapshot(),
            )
            raise

    def _request(
        self,
        *,
        spec: OperationSpec,
        request_type: Any,
        response_type: Any,
        request: Any = None,
        kwargs: dict[str, Any] | None = None,
        fixed_fields: Mapping[str, Any] | None = None,
        request_options: RequestOptions | None = None,
    ) -> Any:
        return self._request_raw(
            spec=spec,
            request_type=request_type,
            response_type=response_type,
            request=request,
            kwargs=kwargs,
            fixed_fields=fixed_fields,
            request_options=request_options,
        ).parse()

    def _request_stream(
        self,
        *,
        spec: OperationSpec,
        request_type: Any,
        request: Any = None,
        kwargs: dict[str, Any] | None = None,
        fixed_fields: Mapping[str, Any] | None = None,
        request_options: RequestOptions | None = None,
    ) -> ChatStream:
        started_at = time.monotonic()
        request_url = f"{self.api_base_url}{spec.path}"
        last_attempt = 0
        secret_scope = self._init_secret_scope(request_options)

        try:
            raw_input = prepare_request_payload(
                request_type=request_type,
                request=request,
                kwargs=kwargs,
                fixed_fields=fixed_fields,
            )
            prepared = self._prepare_http_call(
                spec=spec,
                raw_input=raw_input,
                request_options=request_options,
                accept_header="text/event-stream",
            )
            request_url = prepared.url
            secret_scope.add_from_headers(prepared.headers)

            response, last_attempt = self._send_with_retry_sync(
                spec=spec,
                prepared=prepared,
                request_options=request_options,
                secret_scope=secret_scope,
                stream=True,
            )
            try:
                extra_secrets = secret_scope.snapshot()
                response_info = RawResponseInfo(
                    status_code=response.status_code,
                    headers=response.headers,
                    request_id=_extract_request_id(response.headers),
                    url=prepared.url,
                )

                if response.status_code >= 400:
                    response.read()
                    self._raise_for_http_error(
                        response=response,
                        url=prepared.url,
                        extra_secrets=extra_secrets,
                    )

                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type:
                    response.read()
                    self._handle_json_stream_handshake_error(
                        spec=spec,
                        response=response,
                        url=prepared.url,
                        raw_text=response.text or "",
                        request_id=response_info.request_id,
                        extra_secrets=extra_secrets,
                    )

                return ChatStream(
                    http_response=response,
                    response=response_info,
                    require_done_signal=True,
                    extra_secrets=extra_secrets,
                )
            except BaseException:
                with contextlib.suppress(Exception):
                    response.close()
                raise
        except Exception as exc:
            notify_error_sync(
                hooks=self._hooks,
                logger=self._logger,
                context=ErrorHookContext(
                    operation_id=spec.id,
                    method=spec.http_method,
                    url=request_url,
                    duration_ms=(time.monotonic() - started_at) * 1000.0,
                    attempt=last_attempt,
                    error=exc,
                ),
                extra_secrets=secret_scope.snapshot(),
            )
            raise


class AsyncBaseClient(_BaseClientCore):
    """异步 HTTP 客户端传输、重试与 SSE 调度底座。"""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: AsyncCredentialProvider | None = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = _DEFAULT_TIMEOUT,
        max_retries: int | None = None,
        default_headers: Mapping[str, str] | None = None,
        hooks: FastGPTHooks | None = None,
        logger: FastGPTLogger | FastGPTLogLevel | None = None,
        http_client: httpx.AsyncClient | None = None,
        _owns_http_client: bool | None = None,
    ) -> None:
        super().__init__(
            base_url=base_url,
            api_key=api_key,
            default_app_id=default_app_id,
            identity=identity,
            timeout=timeout,
            max_retries=max_retries,
            default_headers=default_headers,
            hooks=hooks,
            logger=logger,
        )
        if http_client is not None:
            self._http_client = http_client
            self._owns_http_client = (
            False if _owns_http_client is None else bool(_owns_http_client)
        )
        else:
            self._http_client = httpx.AsyncClient(timeout=self._timeout)
            self._owns_http_client = True

    async def aclose(self) -> None:
        """若本客户端独占底层 ``httpx.AsyncClient`` 连接池，则将其安全关闭。"""
        if self._owns_http_client:
            await aclose_shielded(self._http_client, suppress_errors=False)

    async def _resolve_api_key_async(self, request_options: RequestOptions | None) -> str | None:
        if request_options and request_options.get("api_key") is not None:
            return str(request_options["api_key"])
        configured = self._api_key_provider
        if configured is None:
            env_val = os.environ.get("FASTGPT_API_KEY")
            return env_val.strip() if env_val and env_val.strip() else None
        if callable(configured):
            resolved = configured()
            if inspect.isawaitable(resolved):
                resolved = await resolved
            return str(resolved)
        return str(configured)

    async def _send_with_retry_async(
        self,
        *,
        spec: OperationSpec,
        prepared: _PreparedHttpCall,
        request_options: RequestOptions | None,
        secret_scope: _RequestSecretScope,
        stream: bool,
    ) -> tuple[httpx.Response, int]:
        api_key = await self._resolve_api_key_async(request_options)
        final_headers = self._apply_auth_headers(
            spec=spec,
            headers=prepared.headers,
            url=prepared.url,
            api_key=api_key,
            secret_scope=secret_scope,
        )
        extra_secrets = secret_scope.snapshot()
        timeout = (
            request_options["timeout"]
            if request_options and "timeout" in request_options
            else self._timeout
        )
        max_retries = (
            0
            if stream
            else self._max_retries_for_request(
                spec=spec,
                is_stream_body=prepared.is_stream_body,
                request_options=request_options,
            )
        )

        attempt = 0
        while True:
            attempt_start = time.monotonic()
            await notify_request_async(
                hooks=self._hooks,
                logger=self._logger,
                context=RequestHookContext(
                    operation_id=spec.id,
                    method=spec.http_method,
                    url=prepared.url,
                    headers=final_headers,
                    attempt=attempt,
                ),
                extra_secrets=extra_secrets,
            )

            try:
                httpx_req = self._build_httpx_request(
                    client=self._http_client,
                    spec=spec,
                    prepared=prepared,
                    headers=final_headers,
                    timeout=timeout,
                )
                response = await self._http_client.send(httpx_req, stream=stream)
            except FastGPTError:
                raise
            except httpx.TimeoutException as exc:
                if attempt < max_retries:
                    attempt += 1
                    await asyncio.sleep(_compute_backoff_seconds(attempt - 1))
                    continue
                raise FastGPTTimeoutError(
                    f"Request to {spec.http_method} {spec.path} timed out",
                    url=prepared.url,
                    cause=exc,
                    extra_secrets=extra_secrets,
                ) from exc
            except httpx.RequestError as exc:
                if attempt < max_retries:
                    attempt += 1
                    await asyncio.sleep(_compute_backoff_seconds(attempt - 1))
                    continue
                raise FastGPTNetworkError(
                    f"Network request failed: {exc}",
                    url=prepared.url,
                    cause=exc,
                    extra_secrets=extra_secrets,
                ) from exc
            except Exception as exc:
                raise FastGPTNetworkError(
                    f"Transport request failed: {exc}",
                    url=prepared.url,
                    cause=exc,
                    extra_secrets=extra_secrets,
                ) from exc

            retry_backoff: float | None = None
            try:
                duration_ms = (time.monotonic() - attempt_start) * 1000.0
                await notify_response_async(
                    hooks=self._hooks,
                    logger=self._logger,
                    context=ResponseHookContext(
                        operation_id=spec.id,
                        method=spec.http_method,
                        url=prepared.url,
                        status_code=response.status_code,
                        request_id=_extract_request_id(response.headers),
                        duration_ms=duration_ms,
                        attempt=attempt,
                    ),
                    extra_secrets=extra_secrets,
                )

                if response.status_code in _RETRYABLE_HTTP_STATUSES and attempt < max_retries:
                    retry_backoff = _parse_retry_after_seconds(response.headers.get("retry-after"))
                    if retry_backoff is None:
                        retry_backoff = _compute_backoff_seconds(attempt)
                    await aclose_shielded(response, suppress_errors=False)
                else:
                    return response, attempt
            except BaseException:
                await aclose_shielded(response)
                raise

            attempt += 1
            await asyncio.sleep(retry_backoff)

    async def _request_raw(
        self,
        *,
        spec: OperationSpec,
        request_type: Any,
        response_type: Any,
        request: Any = None,
        kwargs: dict[str, Any] | None = None,
        fixed_fields: Mapping[str, Any] | None = None,
        request_options: RequestOptions | None = None,
    ) -> APIResponse[Any]:
        started_at = time.monotonic()
        request_url = f"{self.api_base_url}{spec.path}"
        last_attempt = 0
        secret_scope = self._init_secret_scope(request_options)

        try:
            raw_input = prepare_request_payload(
                request_type=request_type,
                request=request,
                kwargs=kwargs,
                fixed_fields=fixed_fields,
            )
            prepared = self._prepare_http_call(
                spec=spec,
                raw_input=raw_input,
                request_options=request_options,
                accept_header=self._accept_header_for_spec(spec),
            )
            request_url = prepared.url
            secret_scope.add_from_headers(prepared.headers)

            response, last_attempt = await self._send_with_retry_async(
                spec=spec,
                prepared=prepared,
                request_options=request_options,
                secret_scope=secret_scope,
                stream=False,
            )
            try:
                extra_secrets = secret_scope.snapshot()

                if response.status_code >= 400:
                    self._raise_for_http_error(
                        response=response,
                        url=prepared.url,
                        extra_secrets=extra_secrets,
                    )

                decoded = self._decode_success_response(
                    spec=spec,
                    response=response,
                    url=prepared.url,
                    response_type=response_type,
                    extra_secrets=extra_secrets,
                )
                response_info = RawResponseInfo(
                    status_code=response.status_code,
                    headers=response.headers,
                    request_id=_extract_request_id(response.headers),
                    url=prepared.url,
                )
                return APIResponse(
                    http_response=response,
                    response_info=response_info,
                    parse_fn=lambda: decoded,
                )
            except BaseException:
                await aclose_shielded(response)
                raise
        except Exception as exc:
            await notify_error_async(
                hooks=self._hooks,
                logger=self._logger,
                context=ErrorHookContext(
                    operation_id=spec.id,
                    method=spec.http_method,
                    url=request_url,
                    duration_ms=(time.monotonic() - started_at) * 1000.0,
                    attempt=last_attempt,
                    error=exc,
                ),
                extra_secrets=secret_scope.snapshot(),
            )
            raise

    async def _request(
        self,
        *,
        spec: OperationSpec,
        request_type: Any,
        response_type: Any,
        request: Any = None,
        kwargs: dict[str, Any] | None = None,
        fixed_fields: Mapping[str, Any] | None = None,
        request_options: RequestOptions | None = None,
    ) -> Any:
        raw_res = await self._request_raw(
            spec=spec,
            request_type=request_type,
            response_type=response_type,
            request=request,
            kwargs=kwargs,
            fixed_fields=fixed_fields,
            request_options=request_options,
        )
        return raw_res.parse()

    async def _request_stream(
        self,
        *,
        spec: OperationSpec,
        request_type: Any,
        request: Any = None,
        kwargs: dict[str, Any] | None = None,
        fixed_fields: Mapping[str, Any] | None = None,
        request_options: RequestOptions | None = None,
    ) -> AsyncChatStream:
        started_at = time.monotonic()
        request_url = f"{self.api_base_url}{spec.path}"
        last_attempt = 0
        secret_scope = self._init_secret_scope(request_options)

        try:
            raw_input = prepare_request_payload(
                request_type=request_type,
                request=request,
                kwargs=kwargs,
                fixed_fields=fixed_fields,
            )
            prepared = self._prepare_http_call(
                spec=spec,
                raw_input=raw_input,
                request_options=request_options,
                accept_header="text/event-stream",
            )
            request_url = prepared.url
            secret_scope.add_from_headers(prepared.headers)

            response, last_attempt = await self._send_with_retry_async(
                spec=spec,
                prepared=prepared,
                request_options=request_options,
                secret_scope=secret_scope,
                stream=True,
            )
            try:
                extra_secrets = secret_scope.snapshot()
                response_info = RawResponseInfo(
                    status_code=response.status_code,
                    headers=response.headers,
                    request_id=_extract_request_id(response.headers),
                    url=prepared.url,
                )

                if response.status_code >= 400:
                    await response.aread()
                    self._raise_for_http_error(
                        response=response,
                        url=prepared.url,
                        extra_secrets=extra_secrets,
                    )

                content_type = response.headers.get("content-type", "")
                if "application/json" in content_type:
                    await response.aread()
                    self._handle_json_stream_handshake_error(
                        spec=spec,
                        response=response,
                        url=prepared.url,
                        raw_text=response.text or "",
                        request_id=response_info.request_id,
                        extra_secrets=extra_secrets,
                    )

                return AsyncChatStream(
                    http_response=response,
                    response=response_info,
                    require_done_signal=True,
                    extra_secrets=extra_secrets,
                )
            except BaseException:
                await aclose_shielded(response)
                raise
        except Exception as exc:
            await notify_error_async(
                hooks=self._hooks,
                logger=self._logger,
                context=ErrorHookContext(
                    operation_id=spec.id,
                    method=spec.http_method,
                    url=request_url,
                    duration_ms=(time.monotonic() - started_at) * 1000.0,
                    attempt=last_attempt,
                    error=exc,
                ),
                extra_secrets=secret_scope.snapshot(),
            )
            raise
