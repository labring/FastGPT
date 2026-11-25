"""SSE 帧解码、多事件分发、流生命周期与异常清理同步/异步测试。"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import anyio
import httpx
import pytest

from fastgpt_sdk import (
    AsyncFastGPT,
    FastGPT,
    FastGPTAuthError,
    FastGPTError,
    FastGPTHooks,
    FastGPTNetworkError,
)
from fastgpt_sdk.options import RawResponseInfo, ResponseHookContext
from fastgpt_sdk.sse import (
    AgentLifecycleSseEvent,
    AnswerSseEvent,
    ChatTitleSseEvent,
    ErrorSseEvent,
    FlowNodeResponseSseEvent,
    FlowNodeStatusSseEvent,
    FlowResponsesSseEvent,
    InteractiveSseEvent,
    RawSseFrame,
    ResumePhaseSseEvent,
    ResumeTerminalSseEvent,
    ToolSseEvent,
    UnknownSseEvent,
    UpdateVariablesSseEvent,
    WorkflowDurationSseEvent,
    aiterate_raw_sse_frames,
    iterate_raw_sse_frames,
    parse_chat_sse_frame,
)


def _chunk_bytes(payload: str, size: int) -> Iterator[bytes]:
    raw = payload.encode("utf-8")
    for idx in range(0, len(raw), size):
        yield raw[idx : idx + size]


async def _achunk_bytes(payload: str, size: int) -> AsyncIterator[bytes]:
    raw = payload.encode("utf-8")
    for idx in range(0, len(raw), size):
        yield raw[idx : idx + size]


def test_raw_sse_decoder_crlf_utf8_split_bom_comments_and_multiline_data() -> None:
    sse_text = (
        "\ufeff: keepalive comment\r\n"
        "id: evt-1\r\n"
        "event: answer\r\n"
        "data: line1 你好\r\n"
        "data:line2 世界\r\n"
        "\r\n"
        "data:[DONE]\r\n\r\n"
    )
    # 故意按 3 字节切分，使多字节 UTF-8 中文跨 chunk 边界
    frames = list(iterate_raw_sse_frames(_chunk_bytes(sse_text, 3)))
    assert len(frames) == 2
    assert frames[0] == RawSseFrame(event="answer", data="line1 你好\nline2 世界", id="evt-1")
    assert frames[1] == RawSseFrame(event="", data="[DONE]", id=None)


async def test_async_raw_sse_decoder() -> None:
    sse_text = 'event: chatTitle\ndata: {"title":"Async 标题"}\n\ndata: [DONE]\n\n'
    frames = [frame async for frame in aiterate_raw_sse_frames(_achunk_bytes(sse_text, 5))]
    assert len(frames) == 2
    assert frames[0].event == "chatTitle"
    assert parse_chat_sse_frame(frames[0]) == ChatTitleSseEvent(
        title="Async 标题",
        raw={"title": "Async 标题"},
    )
    assert parse_chat_sse_frame(frames[1]) is None


def test_parse_chat_sse_frame_all_event_variants() -> None:
    info = RawResponseInfo(
        status_code=200,
        headers=httpx.Headers({"x-fastgpt-request-id": "sse-req-1"}),
        request_id="sse-req-1",
        url="https://api.example.com/api/v2/chat/completions",
    )

    ans = parse_chat_sse_frame(
        RawSseFrame(
            event="answer",
            data=json.dumps({"choices": [{"delta": {"content": "Hi", "reasoning_content": "R"}}]}),
        )
    )
    assert isinstance(ans, AnswerSseEvent)
    assert ans.text_delta == "Hi"
    assert ans.reasoning_delta == "R"
    assert ans.fast is False

    fast_ans = parse_chat_sse_frame(
        RawSseFrame(event="fastAnswer", data=json.dumps({"choices": [{"delta": {"content": "!"}}]}))
    )
    assert isinstance(fast_ans, AnswerSseEvent)
    assert fast_ans.fast is True

    status = parse_chat_sse_frame(
        RawSseFrame(event="flowNodeStatus", data=json.dumps({"status": "running", "name": "LLM"}))
    )
    assert isinstance(status, FlowNodeStatusSseEvent)
    assert status.name == "LLM"

    node_resp = parse_chat_sse_frame(
        RawSseFrame(event="flowNodeResponse", data=json.dumps({"moduleName": "Chat"}))
    )
    assert isinstance(node_resp, FlowNodeResponseSseEvent)
    assert node_resp.data["moduleName"] == "Chat"

    flow_resps = parse_chat_sse_frame(
        RawSseFrame(event="flowResponses", data=json.dumps([{"id": "n1"}]))
    )
    assert isinstance(flow_resps, FlowResponsesSseEvent)
    assert flow_resps.data == [{"id": "n1"}]

    inter = parse_chat_sse_frame(
        RawSseFrame(
            event="interactive",
            data=json.dumps({"interactive": {"type": "userSelect", "params": {}}}),
        )
    )
    assert isinstance(inter, InteractiveSseEvent)
    assert inter.interactive == {"type": "userSelect", "params": {}}

    tool = parse_chat_sse_frame(RawSseFrame(event="toolCall", data=json.dumps({"id": "t1"})))
    assert isinstance(tool, ToolSseEvent)
    assert tool.type == "toolCall"

    dur = parse_chat_sse_frame(
        RawSseFrame(event="workflowDuration", data=json.dumps({"durationSeconds": 1.25}))
    )
    assert isinstance(dur, WorkflowDurationSseEvent)
    assert dur.duration_seconds == 1.25

    vars_ev = parse_chat_sse_frame(
        RawSseFrame(event="updateVariables", data=json.dumps({"city": "Shanghai"}))
    )
    assert isinstance(vars_ev, UpdateVariablesSseEvent)
    assert vars_ev.variables == {"city": "Shanghai"}

    lifecycle = parse_chat_sse_frame(
        RawSseFrame(event="skillCall", data=json.dumps({"skill": "search"}))
    )
    assert isinstance(lifecycle, AgentLifecycleSseEvent)
    assert lifecycle.type == "skillCall"

    resume_phase = parse_chat_sse_frame(RawSseFrame(event="resumePhase", data="catchup"))
    assert isinstance(resume_phase, ResumePhaseSseEvent)
    assert resume_phase.phase == "catchup"

    resume_done = parse_chat_sse_frame(RawSseFrame(event="resumeCompleted", data='{"ok":true}'))
    assert isinstance(resume_done, ResumeTerminalSseEvent)
    assert resume_done.type == "resumeCompleted"

    err_ev = parse_chat_sse_frame(
        RawSseFrame(
            event="error",
            data=json.dumps(
                {"httpStatus": 401, "code": 514, "statusText": "unAuthApiKey", "message": "Bad key"}
            ),
        ),
        response_info=info,
        extra_secrets=["SecretTokenXYZ123"],
    )
    assert isinstance(err_ev, ErrorSseEvent)
    assert isinstance(err_ev.error, FastGPTAuthError)
    assert err_ev.error.request_id == "sse-req-1"

    unknown = parse_chat_sse_frame(RawSseFrame(event="futureEvent", data='{"a":1}'))
    assert isinstance(unknown, UnknownSseEvent)
    assert unknown.event == "futureEvent"
    assert unknown.data == {"a": 1}

    assert parse_chat_sse_frame(RawSseFrame(event="", data="[DONE]")) is None
    assert parse_chat_sse_frame(RawSseFrame(event="done", data="")) is None


def _build_sse_response(
    chunks: list[bytes],
    *,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    class _SyncByteStream(httpx.SyncByteStream):
        def __init__(self, parts: list[bytes]) -> None:
            self._parts = parts
            self.closed = False

        def __iter__(self) -> Iterator[bytes]:
            yield from self._parts

        def close(self) -> None:
            self.closed = True

    return httpx.Response(
        status_code=status_code,
        headers={"content-type": "text/event-stream; charset=utf-8", **(headers or {})},
        stream=_SyncByteStream(chunks),
    )


def _build_async_sse_response(chunks: list[bytes]) -> httpx.Response:
    class _AsyncByteStream(httpx.AsyncByteStream):
        def __init__(self, parts: list[bytes]) -> None:
            self._parts = parts
            self.closed = False

        async def __aiter__(self) -> AsyncIterator[bytes]:
            for part in self._parts:
                yield part

        async def aclose(self) -> None:
            self.closed = True

    return httpx.Response(
        status_code=200,
        headers={"content-type": "text/event-stream; charset=utf-8"},
        stream=_AsyncByteStream(chunks),
    )


def test_sync_chat_stream_final_result_early_close_abort_and_eof() -> None:
    sse_payload = (
        b'event: chatTitle\ndata: {"title":"Summary"}\n\n'
        b'event: answer\ndata: {"choices":[{"delta":{"reasoning_content":"Think..."}}]}\n\n'
        b'event: answer\ndata: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'
        b'event: fastAnswer\ndata: {"choices":[{"delta":{"content":"FastGPT"}}]}\n\n'
        b'event: updateVariables\ndata: {"step":"done"}\n\n'
        b'event: flowResponses\ndata: [{"moduleName":"Reply"}]\n\n'
        b'event: workflowDuration\ndata: {"durationSeconds":0.75}\n\n'
        b"data: [DONE]\n\n"
    )

    # 1. 正常消费至 [DONE]
    transport_ok = httpx.MockTransport(lambda _r: _build_sse_response([sse_payload]))
    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.Client(transport=transport_ok),
        ) as client,
        client.chat.completions_v2_stream(chat_id="c1") as stream,
    ):
        assert stream.final_text() == "Hello FastGPT"
        snap = stream.final_result()
        assert snap.reasoning_text == "Think..."
        assert snap.chat_title == "Summary"
        assert snap.variables == {"step": "done"}
        assert snap.node_responses == [{"moduleName": "Reply"}]
        assert snap.duration_seconds == 0.75
        assert stream.state == "completed"
        with pytest.raises(FastGPTError):
            list(stream)

    # 2. 提前 break 与 abort 关闭连接
    raw_resp = _build_sse_response([sse_payload[:80], sse_payload[80:]])
    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _r: raw_resp)),
        ) as client,
        client.chat.completions_v2_stream(chat_id="c2") as stream,
    ):
        for _ev in stream:
            break
        stream.close()
        assert stream.state == "closed"
        assert raw_resp.is_closed

    raw_resp_abort = _build_sse_response(
        [b'event: answer\ndata: {"choices":[{"delta":{"content":"part1"}}]}\n\n']
    )
    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-secret-abort",
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _r: raw_resp_abort)),
        ) as client,
        client.chat.completions_v2_stream(chat_id="c3") as stream,
    ):
        with pytest.raises(FastGPTError) as exc_info:
            for _ev in stream:
                stream.abort()
        assert stream.state == "aborted"
        assert "fastgpt-secret-abort" not in str(exc_info.value)

    # 3. 缺少 [DONE] 意外断流
    eof_resp = _build_sse_response(
        [b'event: answer\ndata: {"choices":[{"delta":{"content":"x"}}]}\n\n']
    )
    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _r: eof_resp)),
        ) as client,
        client.chat.completions_v2_stream(chat_id="c4") as stream,
        pytest.raises(FastGPTNetworkError),
    ):
        stream.final_result()

    # 4. 流握手期返回 JSON 业务错误（HTTP 200 code != 200）
    err_json_resp = httpx.Response(
        status_code=200,
        headers={"content-type": "application/json"},
        json={"code": 514, "statusText": "unAuthApiKey", "message": "Invalid stream key"},
    )
    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _r: err_json_resp)),
        ) as client,
        pytest.raises(FastGPTAuthError),
    ):
        client.chat.completions_v2_stream(chat_id="c5")
    assert err_json_resp.is_closed


async def test_async_chat_stream_events_close_and_error() -> None:
    sse_payload = (
        b'event: answer\ndata: {"choices":[{"delta":{"content":"Async "}}]}\n\n'
        b'event: answer\ndata: {"choices":[{"delta":{"content":"Stream"}}]}\n\n'
        b"data: [DONE]\n\n"
    )

    async def handler_ok(_req: httpx.Request) -> httpx.Response:
        return _build_async_sse_response([sse_payload[:40], sse_payload[40:]])

    async with (
        AsyncFastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler_ok)),
        ) as client,
        await client.chat.completions_v2_stream(chat_id="ac1") as stream,
    ):
        events: list[Any] = [ev async for ev in stream]
        assert len(events) == 2
        assert (await stream.final_text()) == "Async Stream"
        assert stream.state == "completed"

    # 流内 error 事件触发 FastGPTAuthError 并将 state 置为 failed
    err_payload = (
        b'event: error\ndata: {"httpStatus":401,"code":514,"statusText":"unAuthApiKey"}\n\n'
        b"data: [DONE]\n\n"
    )

    async def handler_err(_req: httpx.Request) -> httpx.Response:
        return _build_async_sse_response([err_payload])

    async with (
        AsyncFastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler_err)),
        ) as client,
        await client.chat.completions_v2_stream(chat_id="ac2") as stream,
    ):
        with pytest.raises(FastGPTAuthError):
            await stream.final_result()
        assert stream.state == "failed"


async def test_async_stream_cancelling_during_on_response_closes_response_and_stream() -> None:
    hook_entered = asyncio.Event()
    release_hook = asyncio.Event()

    class _TrackedAsyncStream(httpx.AsyncByteStream):
        def __init__(self) -> None:
            self.closed = False

        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield b'event: answer\ndata: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
            yield b"data: [DONE]\n\n"

        async def aclose(self) -> None:
            self.closed = True

    tracked_stream = _TrackedAsyncStream()
    raw_resp = httpx.Response(
        status_code=200,
        headers={"content-type": "text/event-stream; charset=utf-8"},
        stream=tracked_stream,
    )

    async def handler(_req: httpx.Request) -> httpx.Response:
        return raw_resp

    async def slow_on_response(_ctx: ResponseHookContext) -> None:
        hook_entered.set()
        await release_hook.wait()

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        hooks=FastGPTHooks(on_response=slow_on_response),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        task = asyncio.create_task(client.chat.completions_v2_stream(chat_id="cancel-win"))
        await hook_entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert raw_resp.is_closed
    assert tracked_stream.closed


def test_sync_stream_hook_base_exception_closes_response_and_stream() -> None:
    class _TrackedSyncStream(httpx.SyncByteStream):
        def __init__(self) -> None:
            self.closed = False

        def __iter__(self) -> Iterator[bytes]:
            yield b'event: answer\ndata: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
            yield b"data: [DONE]\n\n"

        def close(self) -> None:
            self.closed = True

    class _AbortSignal(BaseException):
        pass

    tracked_stream = _TrackedSyncStream()
    raw_resp = httpx.Response(
        status_code=200,
        headers={"content-type": "text/event-stream; charset=utf-8"},
        stream=tracked_stream,
    )

    def broken_on_response(_ctx: ResponseHookContext) -> None:
        raise _AbortSignal("interrupt before handoff")

    with (
        FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            hooks=FastGPTHooks(on_response=broken_on_response),
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _r: raw_resp)),
        ) as client,
        pytest.raises(_AbortSignal),
    ):
        client.chat.completions_v2_stream(chat_id="sync-abort-win")

    assert raw_resp.is_closed
    assert tracked_stream.closed


class _SlowCloseAsyncStream(httpx.AsyncByteStream):
    def __init__(
        self,
        *,
        chunks: list[bytes] | None = None,
        stall_forever: bool = False,
        close_delay: float = 0.02,
        use_anyio_sleep_in_close: bool = True,
        close_started: asyncio.Event | None = None,
    ) -> None:
        self._chunks = chunks if chunks is not None else []
        self._stall_forever = stall_forever
        self._close_delay = close_delay
        self._use_anyio_sleep_in_close = use_anyio_sleep_in_close
        self._close_started = close_started
        self.closed = False

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk
        if self._stall_forever:
            await anyio.sleep(1.0)

    async def aclose(self) -> None:
        if self._close_started is not None:
            self._close_started.set()
        if self._use_anyio_sleep_in_close:
            await anyio.sleep(self._close_delay)
        else:
            await asyncio.sleep(self._close_delay)
        self.closed = True


async def test_async_stream_anyio_fail_after_during_on_response_completes_async_aclose() -> None:
    tracked_stream = _SlowCloseAsyncStream(
        chunks=[
            b'event: answer\ndata: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
            b"data: [DONE]\n\n",
        ],
    )
    raw_resp = httpx.Response(
        status_code=200,
        headers={"content-type": "text/event-stream; charset=utf-8"},
        stream=tracked_stream,
    )

    async def handler(_req: httpx.Request) -> httpx.Response:
        return raw_resp

    async def stalling_on_response(_ctx: ResponseHookContext) -> None:
        await anyio.sleep(1.0)

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        hooks=FastGPTHooks(on_response=stalling_on_response),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        with pytest.raises(TimeoutError), anyio.fail_after(0.02):
            await client.chat.completions_v2_stream(chat_id="anyio-hook")

        assert raw_resp.is_closed
        assert tracked_stream.closed


async def test_async_stream_anyio_fail_after_during_handshake_aread_completes_async_aclose() -> (
    None
):
    tracked_stream = _SlowCloseAsyncStream(stall_forever=True)
    raw_resp = httpx.Response(
        status_code=500,
        headers={"content-type": "application/json"},
        stream=tracked_stream,
    )

    async def handler(_req: httpx.Request) -> httpx.Response:
        return raw_resp

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        with pytest.raises(TimeoutError), anyio.fail_after(0.02):
            await client.chat.completions_v2_stream(chat_id="anyio-handshake")

        assert raw_resp.is_closed
        assert tracked_stream.closed


async def test_async_stream_anyio_fail_after_mid_iteration_completes_async_aclose() -> None:
    tracked_stream = _SlowCloseAsyncStream(
        chunks=[b'event: answer\ndata: {"choices":[{"delta":{"content":"partial"}}]}\n\n'],
        stall_forever=True,
    )
    raw_resp = httpx.Response(
        status_code=200,
        headers={"content-type": "text/event-stream; charset=utf-8"},
        stream=tracked_stream,
    )

    async def handler(_req: httpx.Request) -> httpx.Response:
        return raw_resp

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        with pytest.raises(TimeoutError), anyio.fail_after(0.02):
            async with await client.chat.completions_v2_stream(chat_id="anyio-iter") as stream:
                async for _ev in stream:
                    pass

        assert raw_resp.is_closed
        assert tracked_stream.closed


async def test_async_stream_repeated_task_cancel_during_aclose_completes_stream_close() -> None:
    hook_entered = asyncio.Event()
    close_started = asyncio.Event()
    tracked_stream = _SlowCloseAsyncStream(
        chunks=[
            b'event: answer\ndata: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
            b"data: [DONE]\n\n",
        ],
        close_delay=0.03,
        use_anyio_sleep_in_close=False,
        close_started=close_started,
    )
    raw_resp = httpx.Response(
        status_code=200,
        headers={"content-type": "text/event-stream; charset=utf-8"},
        stream=tracked_stream,
    )

    async def handler(_req: httpx.Request) -> httpx.Response:
        return raw_resp

    async def blocking_on_response(_ctx: ResponseHookContext) -> None:
        hook_entered.set()
        await asyncio.Future()

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        hooks=FastGPTHooks(on_response=blocking_on_response),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        task = asyncio.create_task(client.chat.completions_v2_stream(chat_id="double-cancel"))
        await hook_entered.wait()
        task.cancel()
        await close_started.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

        assert raw_resp.is_closed
        assert tracked_stream.closed
