"""FastGPT & AsyncFastGPT 客户端初始化、鉴权、身份注入、重试与错误映射测试。"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from fastgpt_sdk import (
    AsyncFastGPT,
    AuthProxyIdentity,
    FastGPT,
    FastGPTAuthError,
    FastGPTBadRequestError,
    FastGPTConflictError,
    FastGPTError,
    FastGPTIdentity,
    FastGPTNotFoundError,
    FastGPTRateLimitError,
    FastGPTServerError,
    FastGPTTimeoutError,
    __version__,
)
from fastgpt_sdk._base_client import normalize_api_base_url
from fastgpt_sdk._version import SDK_VERSION


def _json_response(
    body: Any,
    *,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        headers={"content-type": "application/json", **(headers or {})},
        json=body,
    )


def test_version_parity_and_base_url_normalization(monkeypatch: pytest.MonkeyPatch) -> None:
    pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"
    pyproject_text = pyproject_path.read_text(encoding="utf-8")
    version_match = re.search(r'^version\s*=\s*"([^"]+)"', pyproject_text, flags=re.MULTILINE)
    assert version_match is not None
    assert version_match.group(1) == SDK_VERSION
    assert __version__ == SDK_VERSION

    assert normalize_api_base_url("https://cloud.fastgpt.cn") == "https://cloud.fastgpt.cn/api"
    assert normalize_api_base_url("https://cloud.fastgpt.cn/") == "https://cloud.fastgpt.cn/api"
    assert (
        normalize_api_base_url("https://host.example.com/api")
        == "https://host.example.com/api"
    )
    assert (
        normalize_api_base_url("https://host.example.com/api/")
        == "https://host.example.com/api"
    )

    monkeypatch.setenv("FASTGPT_BASE_URL", "https://env.fastgpt.local/")
    assert normalize_api_base_url() == "https://env.fastgpt.local/api"


def test_sync_auth_headers_public_exception_and_dynamic_key() -> None:
    seen: list[dict[str, Any]] = []
    seq = 0

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(
            {
                "url": str(request.url),
                "auth": request.headers.get("authorization"),
                "client": request.headers.get("x-fastgpt-client"),
            }
        )
        if request.url.path.endswith("/catalog"):
            return _json_response(
                {
                    "code": 200,
                    "statusText": "",
                    "message": "",
                    "data": {
                        "version": "v1",
                        "data": {"models": [], "providers": [], "defaultModelIds": {}},
                    },
                }
            )
        return _json_response(
            {
                "code": 200,
                "statusText": "",
                "message": "",
                "data": {"models": [], "providers": []},
            }
        )

    transport = httpx.MockTransport(handler)
    with FastGPT(
        base_url="https://api.example.com",
        http_client=httpx.Client(transport=transport),
    ) as unauth_client:
        with pytest.raises(FastGPTAuthError):
            unauth_client.models.catalog()

        # 公开模型列表接口允许无 API Key 访问
        res = unauth_client.models.list()
        assert res.models == []
        assert seen[0]["auth"] is None
        assert seen[0]["client"] == f"fastgpt-python-sdk/{SDK_VERSION}"

    def next_key() -> str:
        nonlocal seq
        seq += 1
        return f"fastgpt-dynamic-{seq}"

    with FastGPT(
        base_url="https://api.example.com",
        api_key=next_key,
        http_client=httpx.Client(transport=transport),
    ) as dynamic_client:
        dynamic_client.models.catalog()
        dynamic_client.models.catalog()
        assert seen[1]["auth"] == "Bearer fastgpt-dynamic-1"
        assert seen[2]["auth"] == "Bearer fastgpt-dynamic-2"


async def test_async_auth_provider_and_env_key(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str | None] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.headers.get("authorization"))
        return _json_response(
            {"code": 200, "data": {"version": "v1", "models": [], "providers": []}}
        )

    transport = httpx.MockTransport(handler)
    seq = 0

    async def async_key() -> str:
        nonlocal seq
        seq += 1
        return f"fastgpt-async-{seq}"

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key=async_key,
        http_client=httpx.AsyncClient(transport=transport),
    ) as client:
        cat = await client.models.catalog()
        assert cat.version == "v1"
        await client.models.catalog()
        assert calls == ["Bearer fastgpt-async-1", "Bearer fastgpt-async-2"]

    monkeypatch.setenv("FASTGPT_API_KEY", "fastgpt-from-env-9999")
    async with AsyncFastGPT(
        base_url="https://api.example.com",
        http_client=httpx.AsyncClient(transport=transport),
    ) as env_client:
        await env_client.models.catalog()
        assert calls[-1] == "Bearer fastgpt-from-env-9999"


def test_identity_injection_pool_sharing_and_exclusivity() -> None:
    captured: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        captured.append({"url": str(request.url), "body": body})
        if request.url.path.endswith("/core/chat/init"):
            return _json_response(
                {
                    "code": 200,
                    "data": {
                        "chatId": "chat-1",
                        "title": "Test Chat",
                        "appId": "app-default-1",
                        "app": {
                            "name": "Test App",
                            "avatar": "/icon.png",
                            "intro": "intro",
                            "type": "simple",
                            "pluginInputs": [],
                        },
                    },
                }
            )
        return _json_response({"code": 200, "data": {"total": 0, "list": []}})

    http_client = httpx.Client(transport=httpx.MockTransport(handler))
    root = FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-personal-key",
        default_app_id="app-default-1",
        http_client=http_client,
    )

    user_client = root.with_identity(custom_uid="end-user-42")
    # 退出派生客户端上下文绝不能关闭父客户端底层连接池
    with user_client:
        user_client.chat.init(chat_id="chat-1")
    assert not http_client.is_closed

    parsed_qs = parse_qs(urlparse(captured[0]["url"]).query)
    assert parsed_qs["appId"] == ["app-default-1"]
    assert parsed_qs["customUid"] == ["end-user-42"]

    # 单次 request_options 中的 auth_proxy 覆盖默认 custom_uid
    user_client.chat.histories.list(
        page_size=10,
        request_options={"auth_proxy": AuthProxyIdentity(username="alice")},
    )
    assert captured[1]["body"] == {
        "pageSize": 10,
        "appId": "app-default-1",
        "authProxy": {"username": "alice"},
    }

    # 非应用维度接口（datasets.list）绝不误注入 appId 或 customUid
    user_client.datasets.list(search_key="kb")
    assert captured[2]["body"] == {"searchKey": "kb"}

    # 互斥校验
    with pytest.raises(FastGPTBadRequestError):
        root.with_identity(custom_uid="u1", auth_proxy={"tmb_id": "t1"})
    with pytest.raises(ValueError):
        FastGPTIdentity(custom_uid="u1", auth_proxy=AuthProxyIdentity(tmb_id="t1"))
    with pytest.raises(ValueError):
        AuthProxyIdentity(tmb_id="t1", username="alice")

    # with_options 支持在不传 http_client 时共享父客户端连接池
    owned_root = FastGPT(base_url="https://api.example.com", api_key="fastgpt-key")
    derived = owned_root.with_options(default_app_id="app-override")
    with derived:
        assert derived._default_app_id == "app-override"
    assert not owned_root._http_client.is_closed
    owned_root.close()
    assert owned_root._http_client.is_closed
    http_client.close()


def test_http_status_priority_envelope_errors_and_secret_redaction() -> None:
    cases: list[tuple[int, dict[str, Any], type[FastGPTError]]] = [
        (
            200,
            {"code": 514, "statusText": "tokenInvalid", "message": "Invalid fastgpt-1234567890"},
            FastGPTAuthError,
        ),
        (
            401,
            {"code": 514, "statusText": "unAuthApiKey", "message": "Invalid API Key"},
            FastGPTAuthError,
        ),
        (403, {"code": 403, "message": "Forbidden"}, FastGPTAuthError),
        (500, {"code": 506001, "statusText": "openapiUnAuth", "message": "No"}, FastGPTAuthError),
        (404, {"code": 404, "message": "Not found"}, FastGPTNotFoundError),
        (
            410,
            {"code": 502005, "statusText": "expired", "message": "Expired"},
            FastGPTNotFoundError,
        ),
        (
            500,
            {"code": 502000, "statusText": "appUnExist", "message": "Missing"},
            FastGPTNotFoundError,
        ),
        (
            402,
            {"code": 510, "statusText": "insufficientQuota", "message": "Quota"},
            FastGPTBadRequestError,
        ),
        (409, {"code": 409, "message": "Conflict"}, FastGPTConflictError),
        (429, {"code": 429, "message": "Too many"}, FastGPTRateLimitError),
        (
            # HTTP 429 必须优先于旧版鉴权 statusText
            429,
            {"code": 506001, "statusText": "openapiUnAuth", "message": "Rate limited"},
            FastGPTRateLimitError,
        ),
        (
            # HTTP 503 必须优先于旧版不存在 statusText
            503,
            {"code": 502000, "statusText": "appUnExist", "message": "Overloaded"},
            FastGPTServerError,
        ),
        (
            200,
            {
                "code": 500,
                "statusText": "core.chat.error",
                "message": "Bearer secretValue987654321 failed",
            },
            FastGPTServerError,
        ),
    ]

    for http_status, body, expected_cls in cases:
        transport = httpx.MockTransport(
            lambda _req, s=http_status, b=body: _json_response(
                b, status_code=s, headers={"x-fastgpt-request-id": "trace-py-77"}
            )
        )
        with FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            max_retries=0,
            http_client=httpx.Client(transport=transport),
        ) as client:
            with pytest.raises(expected_cls) as exc_info:
                client.models.catalog()
            err = exc_info.value
            assert err.request_id == "trace-py-77"
            assert "fastgpt-1234567890" not in err.message
            assert "secretValue987654321" not in err.message


def test_retry_on_get_only_and_timeout_mapping() -> None:
    get_attempts = 0
    post_attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal get_attempts, post_attempts
        if request.method == "GET":
            get_attempts += 1
            if get_attempts == 1:
                return _json_response(
                    {"message": "overload"},
                    status_code=503,
                    headers={"retry-after": "0"},
                )
            return _json_response(
            {"code": 200, "data": {"version": "v1", "models": [], "providers": []}}
        )
        post_attempts += 1
        return _json_response({"message": "unavailable"}, status_code=503)

    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    ) as client:
        res = client.models.catalog()
        assert res.version == "v1"
        assert get_attempts == 2

        with pytest.raises(FastGPTServerError):
            client.datasets.list()
        assert post_attempts == 1

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        max_retries=0,
        http_client=httpx.Client(transport=httpx.MockTransport(timeout_handler)),
    ) as slow_client, pytest.raises(FastGPTTimeoutError):
        slow_client.models.catalog()


async def test_async_retry_and_timeout_mapping() -> None:
    attempts = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return _json_response(
                {"message": "rate"}, status_code=429, headers={"retry-after": "0"}
            )
        return _json_response({"code": 200, "data": {"version": "async-v1"}})

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        res = await client.models.catalog()
        assert res.version == "async-v1"
        assert attempts == 2

    async def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("connect timeout", request=request)

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(timeout_handler)),
    ) as slow_client:
        with pytest.raises(FastGPTTimeoutError):
            await slow_client.models.catalog()
