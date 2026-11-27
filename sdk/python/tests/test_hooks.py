"""请求级敏感凭据脱敏、可观测性钩子（Sync/Async）与异常隔离测试。"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
import pytest

from fastgpt_sdk import (
    AsyncFastGPT,
    ErrorHookContext,
    FastGPT,
    FastGPTError,
    FastGPTHooks,
    FastGPTServerError,
    RequestHookContext,
    ResponseHookContext,
)


class _RecordingLogger:
    def __init__(self) -> None:
        self.entries: list[tuple[str, str]] = []

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.entries.append(("debug", msg % args if args else msg))

    def info(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.entries.append(("info", msg % args if args else msg))

    def warning(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.entries.append(("warning", msg % args if args else msg))

    def error(self, msg: str, *args: Any, **kwargs: Any) -> None:
        self.entries.append(("error", msg % args if args else msg))


def test_hooks_redacted_across_retries_and_isolated_errors() -> None:
    req_contexts: list[RequestHookContext] = []
    res_contexts: list[ResponseHookContext] = []
    err_contexts: list[ErrorHookContext] = []
    logger = _RecordingLogger()

    catalog_attempt = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal catalog_attempt
        if "/core/dataset/collection/batchDownload" in str(request.url):
            return httpx.Response(
                200,
                content=b"PK\x03\x04",
                headers={"content-type": "application/zip", "x-request-id": "req-py-bin"},
            )
        catalog_attempt += 1
        if catalog_attempt == 1:
            return httpx.Response(
                503,
                json={"message": "overload"},
                headers={"retry-after": "0"},
            )
        return httpx.Response(
            200,
            json={"code": 200, "data": {"version": "v1"}},
            headers={"content-type": "application/json", "x-request-id": "req-py-1"},
        )

    hooks = FastGPTHooks(
        on_request=req_contexts.append,
        on_response=res_contexts.append,
        on_error=err_contexts.append,
    )

    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-supersecretkey9999",
        logger=logger,
        hooks=hooks,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    ) as client:
        data = client.datasets.collections.batch_download(ticket="secret-ticket-888")
        assert data == b"PK\x03\x04"

        cat = client.models.catalog()
        assert cat.version == "v1"

    assert len(req_contexts) == 3
    assert "secret-ticket-888" not in req_contexts[0].url
    assert req_contexts[1].attempt == 0
    assert req_contexts[2].attempt == 1
    assert "supersecretkey9999" not in req_contexts[1].headers["authorization"]
    assert len(res_contexts) == 3
    assert res_contexts[1].status_code == 503
    assert res_contexts[2].status_code == 200
    assert res_contexts[2].request_id == "req-py-1"
    assert err_contexts == []

    serialized_logs = json.dumps(logger.entries)
    assert "supersecretkey9999" not in serialized_logs
    assert "secret-ticket-888" not in serialized_logs


def test_hook_exception_isolation_and_error_view_cause_redaction() -> None:
    err_contexts: list[ErrorHookContext] = []
    logger = _RecordingLogger()
    custom_oem_key = "acme-oemsecretkey987654321"
    openapi_key = "openapi-liveserverkey123456789"

    class SecretCarryingCauseError(RuntimeError):
        def __init__(self, msg: str) -> None:
            super().__init__(msg)
            self.headers = {"authorization": "Bearer rawHeaderSecret7777"}
            self.api_key = "fastgpt-rawpropkey8888"

    raw_cause = SecretCarryingCauseError(
        f"Upstream failed with Bearer secretCauseToken9999 and {custom_oem_key} and {openapi_key} "
        f"?ticket=leak-ticket-1"
    )

    def broken_on_request(_ctx: RequestHookContext) -> None:
        raise RuntimeError(f"Hook crash with {custom_oem_key} and {openapi_key} ?token=hook-tok")

    def failing_transport(_request: httpx.Request) -> httpx.Response:
        raise raw_cause

    hooks = FastGPTHooks(on_request=broken_on_request, on_error=err_contexts.append)
    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key=custom_oem_key,
            default_headers={"x-trace-key": custom_oem_key},
            max_retries=0,
            logger=logger,
            hooks=hooks,
            http_client=httpx.Client(transport=httpx.MockTransport(failing_transport)),
        ) as client,
        pytest.raises(FastGPTError) as exc_info,
    ):
        client.models.catalog()

    caught = exc_info.value
    assert custom_oem_key not in caught.message
    assert openapi_key not in caught.message
    assert len(err_contexts) == 1

    hook_err = err_contexts[0].error
    assert hook_err is not caught
    assert hook_err.__cause__ is not raw_cause
    assert not hasattr(hook_err.__cause__, "headers")
    assert not hasattr(hook_err.__cause__, "api_key")

    hook_dump = f"{hook_err} | {hook_err.__cause__}"
    for leak in (
        custom_oem_key,
        openapi_key,
        "secretCauseToken9999",
        "leak-ticket-1",
        "rawHeaderSecret7777",
        "fastgpt-rawpropkey8888",
    ):
        assert leak not in hook_dump

    warn_dump = json.dumps(logger.entries)
    assert custom_oem_key not in warn_dump
    assert openapi_key not in warn_dump
    assert "hook-tok" not in warn_dump


async def test_request_scoped_redaction_across_45_concurrent_rotating_keys() -> None:
    err_contexts: list[ErrorHookContext] = []
    req_contexts: list[RequestHookContext] = []

    async def on_req_async(ctx: RequestHookContext) -> None:
        req_contexts.append(ctx)

    seq = 0
    slow_gate = asyncio.Event()
    slow_secret = "oemrot-slow-request-secret-0000"

    def rotating_key() -> str:
        nonlocal seq
        idx = seq
        seq += 1
        return slow_secret if idx == 0 else f"oemrot-fast-request-secret-{idx:04d}"

    async def handler(request: httpx.Request) -> httpx.Response:
        token = (request.headers.get("authorization") or "").replace("Bearer ", "").strip()
        if token == slow_secret:
            await slow_gate.wait()
            raise httpx.ReadError(f"slow failed with {slow_secret}", request=request)
        return httpx.Response(200, json={"code": 200, "data": {"version": "v1"}})

    hooks = FastGPTHooks(on_request=on_req_async, on_error=err_contexts.append)
    stdlib_logger = logging.getLogger("test_fastgpt_hooks")

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key=rotating_key,
        max_retries=0,
        logger=stdlib_logger,
        hooks=hooks,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        slow_task = asyncio.create_task(client.models.catalog())
        await asyncio.sleep(0)
        await asyncio.gather(*(client.models.catalog() for _ in range(44)))
        slow_gate.set()

        with pytest.raises(FastGPTError) as exc_info:
            await slow_task

    assert slow_secret not in exc_info.value.message
    assert len(err_contexts) == 1
    assert slow_secret not in str(err_contexts[0].error)
    assert slow_secret not in str(err_contexts[0].error.__cause__)
    assert len(req_contexts) == 45
    assert all(slow_secret not in ctx.headers.get("authorization", "") for ctx in req_contexts)


def test_http_200_error_triggers_on_error_hook() -> None:
    err_contexts: list[ErrorHookContext] = []
    transport = httpx.MockTransport(
        lambda _req: httpx.Response(
            200,
            json={"code": 500, "statusText": "internalErr", "message": "Upstream error"},
        )
    )
    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key-12345",
        max_retries=0,
        hooks=FastGPTHooks(on_error=err_contexts.append),
        http_client=httpx.Client(transport=transport),
    ) as client, pytest.raises(FastGPTServerError):
        client.models.catalog()

    assert len(err_contexts) == 1
    assert err_contexts[0].operation_id == "models.catalog"
    assert isinstance(err_contexts[0].error, FastGPTServerError)
