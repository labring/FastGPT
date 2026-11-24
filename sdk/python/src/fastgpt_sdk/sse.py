"""FastGPT 多事件 SSE 流式解析与同步/异步流消费器（ChatStream / AsyncChatStream）。"""

from __future__ import annotations

import asyncio
import codecs
import contextlib
import json
from collections.abc import AsyncIterator, Callable, Iterator, Sequence
from dataclasses import dataclass
from typing import Annotated, Any, Literal

import httpx
from pydantic import Field

from .errors import FastGPTError, FastGPTNetworkError, FastGPTTimeoutError, create_mapped_api_error
from .options import FastGPTModel, RawResponseInfo

ChatStreamTerminalState = Literal["pending", "completed", "closed", "aborted", "failed"]


@dataclass(frozen=True)
class RawSseFrame:
    """底层 WHATWG EventSource 原始帧。"""

    event: str
    data: str
    id: str | None = None


class AnswerSseEvent(FastGPTModel):
    type: Literal["answer"] = "answer"
    text_delta: str = ""
    reasoning_delta: str | None = None
    fast: bool = False
    raw: Any = None


class FlowNodeStatusSseEvent(FastGPTModel):
    type: Literal["flowNodeStatus"] = "flowNodeStatus"
    status: str = ""
    name: str = ""
    raw: Any = None


class FlowNodeResponseSseEvent(FastGPTModel):
    type: Literal["flowNodeResponse"] = "flowNodeResponse"
    data: dict[str, Any] = Field(default_factory=dict)
    raw: Any = None


class FlowResponsesSseEvent(FastGPTModel):
    type: Literal["flowResponses"] = "flowResponses"
    data: list[dict[str, Any]] = Field(default_factory=list)
    raw: Any = None


class InteractiveSseEvent(FastGPTModel):
    type: Literal["interactive"] = "interactive"
    interactive: Any = None
    raw: Any = None


class ToolSseEvent(FastGPTModel):
    type: Literal["toolCall", "toolParams", "toolResponse"]
    data: Any = None
    raw: Any = None


class ChatTitleSseEvent(FastGPTModel):
    type: Literal["chatTitle"] = "chatTitle"
    title: str = ""
    raw: Any = None


class WorkflowDurationSseEvent(FastGPTModel):
    type: Literal["workflowDuration"] = "workflowDuration"
    duration_seconds: float = 0.0
    raw: Any = None


class UpdateVariablesSseEvent(FastGPTModel):
    type: Literal["updateVariables"] = "updateVariables"
    variables: dict[str, Any] = Field(default_factory=dict)
    raw: Any = None


class AgentLifecycleSseEvent(FastGPTModel):
    type: Literal["plan", "planStatus", "sandboxStatus", "skillCall"]
    data: Any = None
    raw: Any = None


class ResumePhaseSseEvent(FastGPTModel):
    type: Literal["resumePhase"] = "resumePhase"
    phase: str
    raw: str


class ResumeTerminalSseEvent(FastGPTModel):
    type: Literal["resumeCompleted", "resumeUnavailable"]
    data: Any = None
    raw: Any = None


class ErrorSseEvent(FastGPTModel):
    type: Literal["error"] = "error"
    error: Any
    raw: Any = None


class UnknownSseEvent(FastGPTModel):
    type: Literal["unknown"] = "unknown"
    event: str
    data: Any = None


ChatSseEvent = Annotated[
    AnswerSseEvent
    | FlowNodeStatusSseEvent
    | FlowNodeResponseSseEvent
    | FlowResponsesSseEvent
    | InteractiveSseEvent
    | ToolSseEvent
    | ChatTitleSseEvent
    | WorkflowDurationSseEvent
    | UpdateVariablesSseEvent
    | AgentLifecycleSseEvent
    | ResumePhaseSseEvent
    | ResumeTerminalSseEvent
    | ErrorSseEvent
    | UnknownSseEvent,
    Field(discriminator="type"),
]


class ChatStreamFinalResult(FastGPTModel):
    """流式对话完整或提前安全关闭后的聚合结果快照。"""

    text: str = ""
    reasoning_text: str = ""
    chat_title: str | None = None
    duration_seconds: float | None = None
    interactive: Any = None
    variables: dict[str, Any] | None = None
    node_responses: list[dict[str, Any]] = Field(default_factory=list)
    quotes: list[Any] = Field(default_factory=list)


def _extract_chunk_deltas(payload: Any) -> tuple[str, str | None]:
    if not isinstance(payload, dict):
        return "", None
    choices = payload.get("choices")
    if not isinstance(choices, list) or len(choices) == 0:
        return "", None
    first = choices[0]
    if not isinstance(first, dict):
        return "", None
    delta = first.get("delta")
    if not isinstance(delta, dict):
        return "", None
    content = delta.get("content")
    text_delta = content if isinstance(content, str) else ""
    reasoning_raw = delta.get("reasoning_content")
    reasoning_delta = reasoning_raw if isinstance(reasoning_raw, str) else None
    return text_delta, reasoning_delta


def parse_chat_sse_frame(
    frame: RawSseFrame,
    *,
    response_info: RawResponseInfo | None = None,
    extra_secrets: Sequence[str] | None = None,
) -> ChatSseEvent | None:
    """将底层 SSE 原始帧解析为强类型判别联合事件，收到终止帧返回 ``None``。"""
    trimmed_data = frame.data.strip()
    if trimmed_data == "[DONE]" or frame.event == "done":
        return None

    if frame.event == "resumePhase":
        return ResumePhaseSseEvent(phase=trimmed_data, raw=frame.data)

    payload: Any
    try:
        payload = json.loads(frame.data)
    except Exception:
        payload = frame.data

    event_name = frame.event or "message"
    req_id = response_info.request_id if response_info is not None else None
    url = response_info.url if response_info is not None else None

    if event_name in ("message", "answer", "fastAnswer"):
        if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
            err_obj = payload["error"]
            err_msg = err_obj.get("message")
            message = err_msg if isinstance(err_msg, str) else "Stream error received"
            err_type = err_obj.get("type")
            return ErrorSseEvent(
                error=create_mapped_api_error(
                    message=message,
                    status_text=err_type if isinstance(err_type, str) else None,
                    request_id=req_id,
                    url=url,
                    extra_secrets=extra_secrets,
                ),
                raw=payload,
            )

        text_delta, reasoning_delta = _extract_chunk_deltas(payload)
        return AnswerSseEvent(
            text_delta=text_delta,
            reasoning_delta=reasoning_delta,
            fast=event_name == "fastAnswer",
            raw=payload,
        )

    if event_name == "error":
        err_msg = "SSE workflow execution error"
        if isinstance(payload, str):
            err_msg = payload
        elif isinstance(payload, dict):
            if isinstance(payload.get("message"), str):
                err_msg = payload["message"]
            elif isinstance(payload.get("statusText"), str):
                err_msg = payload["statusText"]

        http_status = (
            payload.get("httpStatus")
            if isinstance(payload, dict) and isinstance(payload.get("httpStatus"), int)
            else None
        )
        server_code = (
            payload.get("code")
            if isinstance(payload, dict) and isinstance(payload.get("code"), int)
            else None
        )
        status_text = (
            payload.get("statusText")
            if isinstance(payload, dict) and isinstance(payload.get("statusText"), str)
            else None
        )
        return ErrorSseEvent(
            error=create_mapped_api_error(
                message=err_msg,
                http_status=http_status,
                server_code=server_code,
                status_text=status_text,
                request_id=req_id,
                url=url,
                extra_secrets=extra_secrets,
            ),
            raw=payload,
        )

    if event_name == "flowNodeStatus":
        raw_status = payload.get("status") if isinstance(payload, dict) else None
        raw_name = payload.get("name") if isinstance(payload, dict) else None
        status = raw_status if isinstance(raw_status, str) else ""
        name = raw_name if isinstance(raw_name, str) else ""
        return FlowNodeStatusSseEvent(status=status, name=name, raw=payload)

    if event_name == "flowNodeResponse":
        data_dict = payload if isinstance(payload, dict) else {"value": payload}
        return FlowNodeResponseSseEvent(data=data_dict, raw=payload)

    if event_name == "flowResponses":
        data_list = (
            [item for item in payload if isinstance(item, dict)]
            if isinstance(payload, list)
            else []
        )
        return FlowResponsesSseEvent(data=data_list, raw=payload)

    if event_name == "interactive":
        interactive_val = (
            payload["interactive"]
            if isinstance(payload, dict) and "interactive" in payload
            else payload
        )
        return InteractiveSseEvent(interactive=interactive_val, raw=payload)

    if event_name in ("toolCall", "toolParams", "toolResponse"):
        return ToolSseEvent(type=event_name, data=payload, raw=payload)  # type: ignore[arg-type]

    if event_name == "chatTitle":
        title = ""
        if isinstance(payload, dict) and isinstance(payload.get("title"), str):
            title = payload["title"]
        elif isinstance(payload, str):
            title = payload
        return ChatTitleSseEvent(title=title, raw=payload)

    if event_name == "workflowDuration":
        seconds = 0.0
        if isinstance(payload, (int, float)) and not isinstance(payload, bool):
            seconds = float(payload)
        elif isinstance(payload, dict) and isinstance(
            payload.get("durationSeconds"), (int, float)
        ):
            seconds = float(payload["durationSeconds"])
        elif isinstance(payload, str):
            try:
                seconds = float(payload)
            except ValueError:
                seconds = 0.0
        return WorkflowDurationSseEvent(duration_seconds=seconds, raw=payload)

    if event_name == "updateVariables":
        vars_dict = payload if isinstance(payload, dict) else {}
        return UpdateVariablesSseEvent(variables=vars_dict, raw=payload)

    if event_name in ("plan", "planStatus", "sandboxStatus", "skillCall"):
        return AgentLifecycleSseEvent(
            type=event_name,  # type: ignore[arg-type]
            data=payload,
            raw=payload,
        )

    if event_name in ("resumeCompleted", "resumeUnavailable"):
        return ResumeTerminalSseEvent(
            type=event_name,  # type: ignore[arg-type]
            data=payload,
            raw=payload,
        )

    return UnknownSseEvent(event=event_name, data=payload)


class _SseFrameDecoder:
    """增量 WHATWG EventSource 字节流帧解码器，兼容 UTF-8 跨片拆分、CRLF 及多行 data:。"""

    def __init__(self) -> None:
        self._utf8 = codecs.getincrementaldecoder("utf-8")(errors="replace")
        self._buffer = ""
        self._current_event = ""
        self._current_id: str | None = None
        self._data_lines: list[str] = []

    def _flush_frame(self) -> RawSseFrame | None:
        if not self._data_lines and not self._current_event:
            return None
        frame = RawSseFrame(
            event=self._current_event,
            data="\n".join(self._data_lines),
            id=self._current_id,
        )
        self._current_event = ""
        self._current_id = None
        self._data_lines = []
        return frame

    def _process_line(self, raw_line: str) -> RawSseFrame | None:
        line = raw_line[:-1] if raw_line.endswith("\r") else raw_line
        if line == "":
            return self._flush_frame()
        if line.startswith(":"):
            return None

        colon_idx = line.find(":")
        if colon_idx == -1:
            field = line
            value = ""
        else:
            field = line[:colon_idx]
            value = line[colon_idx + 1 :]
            if value.startswith(" "):
                value = value[1:]

        if field == "event":
            self._current_event = value
        elif field == "data":
            self._data_lines.append(value)
        elif field == "id" and "\0" not in value:
            self._current_id = value
        return None

    def feed_bytes(self, chunk: bytes) -> list[RawSseFrame]:
        self._buffer += self._utf8.decode(chunk, final=False)
        frames: list[RawSseFrame] = []
        while True:
            newline_idx = self._buffer.find("\n")
            if newline_idx == -1:
                break
            raw_line = self._buffer[:newline_idx]
            self._buffer = self._buffer[newline_idx + 1 :]
            frame = self._process_line(raw_line)
            if frame is not None:
                frames.append(frame)
        return frames

    def finish(self) -> list[RawSseFrame]:
        self._buffer += self._utf8.decode(b"", final=True)
        frames: list[RawSseFrame] = []
        if len(self._buffer) > 0:
            frame = self._process_line(self._buffer)
            self._buffer = ""
            if frame is not None:
                frames.append(frame)
        trailing = self._flush_frame()
        if trailing is not None:
            frames.append(trailing)
        return frames


def iterate_raw_sse_frames(byte_chunks: Iterator[bytes]) -> Iterator[RawSseFrame]:
    """按 WHATWG EventSource 规范解析同步字节块迭代器。"""
    decoder = _SseFrameDecoder()
    for chunk in byte_chunks:
        yield from decoder.feed_bytes(chunk)
    yield from decoder.finish()


async def aiterate_raw_sse_frames(
    byte_chunks: AsyncIterator[bytes],
) -> AsyncIterator[RawSseFrame]:
    """按 WHATWG EventSource 规范解析异步字节块迭代器。"""
    decoder = _SseFrameDecoder()
    async for chunk in byte_chunks:
        for frame in decoder.feed_bytes(chunk):
            yield frame
    for frame in decoder.finish():
        yield frame


class _BaseChatStreamState:
    """共享的 SSE 事件累加与终态维护基类。"""

    def __init__(
        self,
        *,
        response: RawResponseInfo,
        require_done_signal: bool = True,
        extra_secrets: Sequence[str] | None = None,
    ) -> None:
        self.response = response
        self._require_done_signal = require_done_signal
        self._extra_secrets = tuple(extra_secrets) if extra_secrets else None
        self._started = False
        self._disposed = False
        self._abort_requested = False
        self._state: ChatStreamTerminalState = "pending"
        self._terminal_error: BaseException | None = None

        self._text_parts: list[str] = []
        self._reasoning_parts: list[str] = []
        self._chat_title: str | None = None
        self._duration_seconds: float | None = None
        self._interactive: Any = None
        self._variables: dict[str, Any] | None = None
        self._node_responses: list[dict[str, Any]] = []
        self._quotes: list[Any] = []
        self._stream_error: FastGPTError | None = None

    @property
    def state(self) -> ChatStreamTerminalState:
        """当前流终态：pending / completed / closed / aborted / failed。"""
        return self._state

    def _is_aborted(self) -> bool:
        return self._abort_requested or self._state == "aborted"

    def _create_abort_error(self, cause: BaseException | None = None) -> FastGPTError:
        if isinstance(cause, FastGPTError):
            return cause
        return FastGPTError(
            "Chat stream was aborted",
            request_id=self.response.request_id,
            url=self.response.url,
            cause=cause,
            extra_secrets=self._extra_secrets,
        )

    def _wrap_transport_error(self, exc: BaseException) -> BaseException:
        if isinstance(exc, FastGPTError):
            return exc
        if isinstance(exc, httpx.TimeoutException):
            return FastGPTTimeoutError(
                f"Chat stream timed out: {exc}",
                request_id=self.response.request_id,
                url=self.response.url,
                cause=exc,
                extra_secrets=self._extra_secrets,
            )
        if isinstance(exc, (httpx.HTTPError, httpx.StreamError)):
            return FastGPTNetworkError(
                f"Chat stream transport error: {exc}",
                request_id=self.response.request_id,
                url=self.response.url,
                cause=exc,
                extra_secrets=self._extra_secrets,
            )
        return exc

    def _accumulate_event(self, event: ChatSseEvent) -> None:
        if isinstance(event, ErrorSseEvent):
            if self._stream_error is None:
                self._stream_error = (
                    event.error
                    if isinstance(event.error, FastGPTError)
                    else FastGPTError(
                        str(event.error),
                        request_id=self.response.request_id,
                        url=self.response.url,
                        extra_secrets=self._extra_secrets,
                    )
                )
            return
        if isinstance(event, AnswerSseEvent):
            if event.text_delta:
                self._text_parts.append(event.text_delta)
            if event.reasoning_delta is not None:
                self._reasoning_parts.append(event.reasoning_delta)
            return
        if isinstance(event, ChatTitleSseEvent):
            self._chat_title = event.title
            return
        if isinstance(event, WorkflowDurationSseEvent):
            self._duration_seconds = event.duration_seconds
            return
        if isinstance(event, InteractiveSseEvent):
            self._interactive = event.interactive
            return
        if isinstance(event, UpdateVariablesSseEvent):
            self._variables = {**(self._variables or {}), **event.variables}
            return
        if isinstance(event, FlowNodeResponseSseEvent):
            self._node_responses.append(event.data)
            quote_list = event.data.get("quoteList")
            if isinstance(quote_list, list):
                self._quotes.extend(quote_list)
            return
        if isinstance(event, FlowResponsesSseEvent):
            for item in event.data:
                self._node_responses.append(item)
                quote_list = item.get("quoteList")
                if isinstance(quote_list, list):
                    self._quotes.extend(quote_list)

    def _build_final_result_snapshot(self) -> ChatStreamFinalResult:
        return ChatStreamFinalResult(
            text="".join(self._text_parts),
            reasoning_text="".join(self._reasoning_parts),
            chat_title=self._chat_title,
            duration_seconds=self._duration_seconds,
            interactive=self._interactive,
            variables=dict(self._variables) if self._variables is not None else None,
            node_responses=list(self._node_responses),
            quotes=list(self._quotes),
        )


class ChatStream(_BaseChatStreamState):
    """同步 SSE 对话流封装：支持 ``for ev in stream`` 逐帧消费、上下文管理及
    ``final_result()`` 聚合。"""

    def __init__(
        self,
        *,
        http_response: httpx.Response,
        response: RawResponseInfo,
        byte_chunks: Iterator[bytes] | None = None,
        on_dispose: Callable[[], None] | None = None,
        require_done_signal: bool = True,
        extra_secrets: Sequence[str] | None = None,
    ) -> None:
        super().__init__(
            response=response,
            require_done_signal=require_done_signal,
            extra_secrets=extra_secrets,
        )
        self._http_response = http_response
        self._byte_chunks = byte_chunks
        self._on_dispose = on_dispose

    def _dispose(self) -> None:
        if self._disposed:
            return
        self._disposed = True
        with contextlib.suppress(Exception):
            self._http_response.close()
        if self._on_dispose is not None:
            self._on_dispose()

    def _finalize(
        self,
        *,
        state: Literal["completed", "closed", "aborted", "failed"],
        error: BaseException | None = None,
    ) -> None:
        if self._state != "pending":
            self._dispose()
            return
        self._state = state
        self._terminal_error = error
        self._dispose()

    def abort(self, cause: BaseException | None = None) -> None:
        """主动中断底层 HTTP 连接并将流终态结算为 ``aborted``。"""
        self._abort_requested = True
        abort_err = self._create_abort_error(cause)
        self._finalize(state="aborted", error=abort_err)

    def close(self) -> None:
        """安全提前关闭响应流，未失败或取消时标记为 ``closed`` 并释放连接。"""
        if self._state == "pending":
            self._finalize(state="closed")
        else:
            self._dispose()

    def __enter__(self) -> ChatStream:
        return self

    def __exit__(self, _exc_type: Any, exc: BaseException | None, _tb: Any) -> None:
        if exc is not None and self._state == "pending":
            wrapped = self._wrap_transport_error(exc)
            self._finalize(state="aborted" if self._abort_requested else "failed", error=wrapped)
            return
        self.close()

    def __iter__(self) -> Iterator[ChatSseEvent]:
        if self._started:
            raise FastGPTError(
                "ChatStream can only be iterated once",
                request_id=self.response.request_id,
                url=self.response.url,
                extra_secrets=self._extra_secrets,
            )
        self._started = True

        if self._is_aborted():
            abort_err = self._terminal_error or self._create_abort_error()
            self._finalize(state="aborted", error=abort_err)
            raise abort_err

        received_done = False
        reached_end = False
        failed_with: BaseException | None = None
        exited_early = False

        try:
            chunks = (
                self._byte_chunks
                if self._byte_chunks is not None
                else self._http_response.iter_bytes()
            )
            for raw_frame in iterate_raw_sse_frames(chunks):
                if self._is_aborted():
                    raise self._terminal_error or self._create_abort_error()

                parsed = parse_chat_sse_frame(
                    raw_frame,
                    response_info=self.response,
                    extra_secrets=self._extra_secrets,
                )
                if parsed is None:
                    received_done = True
                    reached_end = True
                    return

                self._accumulate_event(parsed)
                yield parsed

                if self._is_aborted():
                    raise self._terminal_error or self._create_abort_error()

            reached_end = True
            if self._stream_error is None and self._require_done_signal and not received_done:
                raise FastGPTNetworkError(
                    "Chat stream ended unexpectedly before receiving [DONE] termination frame",
                    request_id=self.response.request_id,
                    url=self.response.url,
                    extra_secrets=self._extra_secrets,
                )
        except GeneratorExit:
            exited_early = True
            raise
        except BaseException as exc:
            wrapped = (
                self._terminal_error or self._create_abort_error(exc)
                if self._is_aborted()
                else self._wrap_transport_error(exc)
            )
            failed_with = wrapped
            if wrapped is exc:
                raise
            raise wrapped from exc
        finally:
            if self._state != "pending":
                self._dispose()
            elif failed_with is not None:
                self._finalize(
                    state="aborted" if self._abort_requested else "failed",
                    error=failed_with,
                )
            elif self._abort_requested:
                self._finalize(state="aborted", error=self._create_abort_error())
            elif self._stream_error is not None:
                self._finalize(state="failed", error=self._stream_error)
            elif reached_end and (received_done or not self._require_done_signal):
                self._finalize(state="completed")
            elif exited_early or not reached_end:
                self._finalize(state="closed")

    def final_result(self) -> ChatStreamFinalResult:
        """消费剩余流帧（如尚未开始迭代）并返回聚合快照；异常或取消终止时抛出对应错误。"""
        if not self._started and self._state == "pending":
            for _event in self:
                pass
        if self._terminal_error is not None:
            raise self._terminal_error
        return self._build_final_result_snapshot()

    def final_text(self) -> str:
        """获取流结束后的完整回答文本。"""
        return self.final_result().text


class AsyncChatStream(_BaseChatStreamState):
    """异步 SSE 对话流封装：支持 ``async for ev in stream`` 逐帧消费及
    ``await stream.final_result()``。"""

    def __init__(
        self,
        *,
        http_response: httpx.Response,
        response: RawResponseInfo,
        byte_chunks: AsyncIterator[bytes] | None = None,
        on_dispose: Callable[[], None] | None = None,
        require_done_signal: bool = True,
        extra_secrets: Sequence[str] | None = None,
    ) -> None:
        super().__init__(
            response=response,
            require_done_signal=require_done_signal,
            extra_secrets=extra_secrets,
        )
        self._http_response = http_response
        self._byte_chunks = byte_chunks
        self._on_dispose = on_dispose
        self._close_task: asyncio.Task[None] | None = None

    async def _dispose_async(self) -> None:
        if self._disposed:
            return
        self._disposed = True
        with contextlib.suppress(Exception):
            await self._http_response.aclose()
        if self._on_dispose is not None:
            self._on_dispose()

    def _schedule_dispose(self) -> None:
        if self._disposed:
            return
        try:
            loop = asyncio.get_running_loop()
            if self._close_task is None or self._close_task.done():
                self._close_task = loop.create_task(self._dispose_async())
                self._close_task.add_done_callback(lambda _t: None)
        except RuntimeError:
            if self._on_dispose is not None:
                self._on_dispose()

    async def aclose(self) -> None:
        """安全提前关闭异步响应流并释放底层连接。"""
        if self._state == "pending":
            self._state = "closed"
        await self._dispose_async()

    def abort(self, cause: BaseException | None = None) -> None:
        """主动中断异步 HTTP 连接并将流终态结算为 ``aborted``。"""
        self._abort_requested = True
        if self._state == "pending":
            self._state = "aborted"
            self._terminal_error = self._create_abort_error(cause)
        self._schedule_dispose()

    async def __aenter__(self) -> AsyncChatStream:
        return self

    async def __aexit__(self, _exc_type: Any, exc: BaseException | None, _tb: Any) -> None:
        if exc is not None and self._state == "pending":
            wrapped = self._wrap_transport_error(exc)
            self._state = "aborted" if self._abort_requested else "failed"
            self._terminal_error = wrapped
            await self._dispose_async()
            return
        await self.aclose()

    async def __aiter__(self) -> AsyncIterator[ChatSseEvent]:
        if self._started:
            raise FastGPTError(
                "AsyncChatStream can only be iterated once",
                request_id=self.response.request_id,
                url=self.response.url,
                extra_secrets=self._extra_secrets,
            )
        self._started = True

        if self._is_aborted():
            abort_err = self._terminal_error or self._create_abort_error()
            if self._state == "pending":
                self._state = "aborted"
                self._terminal_error = abort_err
            await self._dispose_async()
            raise abort_err

        received_done = False
        reached_end = False
        failed_with: BaseException | None = None
        exited_early = False

        try:
            chunks = (
                self._byte_chunks
                if self._byte_chunks is not None
                else self._http_response.aiter_bytes()
            )
            async for raw_frame in aiterate_raw_sse_frames(chunks):
                if self._is_aborted():
                    raise self._terminal_error or self._create_abort_error()

                parsed = parse_chat_sse_frame(
                    raw_frame,
                    response_info=self.response,
                    extra_secrets=self._extra_secrets,
                )
                if parsed is None:
                    received_done = True
                    reached_end = True
                    return

                self._accumulate_event(parsed)
                yield parsed

                if self._is_aborted():
                    raise self._terminal_error or self._create_abort_error()

            reached_end = True
            if self._stream_error is None and self._require_done_signal and not received_done:
                raise FastGPTNetworkError(
                    "Chat stream ended unexpectedly before receiving [DONE] termination frame",
                    request_id=self.response.request_id,
                    url=self.response.url,
                    extra_secrets=self._extra_secrets,
                )
        except GeneratorExit:
            exited_early = True
            raise
        except BaseException as exc:
            wrapped = (
                self._terminal_error or self._create_abort_error(exc)
                if self._is_aborted()
                else self._wrap_transport_error(exc)
            )
            failed_with = wrapped
            if wrapped is exc:
                raise
            raise wrapped from exc
        finally:
            try:
                if self._state == "pending":
                    if failed_with is not None:
                        self._state = "aborted" if self._abort_requested else "failed"
                        self._terminal_error = failed_with
                    elif self._abort_requested:
                        self._state = "aborted"
                        self._terminal_error = self._create_abort_error()
                    elif self._stream_error is not None:
                        self._state = "failed"
                        self._terminal_error = self._stream_error
                    elif reached_end and (received_done or not self._require_done_signal):
                        self._state = "completed"
                    elif exited_early or not reached_end:
                        self._state = "closed"
            finally:
                await self._dispose_async()

    async def final_result(self) -> ChatStreamFinalResult:
        """异步消费剩余流帧并返回聚合结果；异常或取消终止时抛出对应错误。"""
        if not self._started and self._state == "pending":
            async for _event in self:
                pass
        if self._terminal_error is not None:
            raise self._terminal_error
        return self._build_final_result_snapshot()

    async def final_text(self) -> str:
        """异步获取流结束后的完整回答文本。"""
        return (await self.final_result()).text
