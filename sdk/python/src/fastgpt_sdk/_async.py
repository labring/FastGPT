"""异步资源清理辅助：在 AnyIO / asyncio 取消作用域下屏蔽中断以完成 ``aclose()``。"""

from __future__ import annotations

import asyncio
import contextlib
import sys
from collections.abc import Awaitable
from typing import Any, Protocol


class _AsyncClosable(Protocol):
    def aclose(self) -> Awaitable[Any]: ...


async def aclose_shielded(
    resource: _AsyncClosable,
    *,
    suppress_errors: bool = True,
) -> None:
    """在取消作用域下屏蔽中断直至 ``resource.aclose()`` 完成，同时保留取消传播。

    - 若当前进程已加载 ``anyio``，通过 ``anyio.CancelScope(shield=True)`` 屏蔽层级取消
      （兼容 asyncio 与 Trio 后端），避免 ``anyio.fail_after`` / ``move_on_after`` 在
      ``aclose()`` 内部的异步检查点再次打断关闭流程。
    - 若当前处于 asyncio 事件循环中，额外以独立任务配合循环 ``asyncio.shield`` 等待结束，
      防御多次 ``Task.cancel()`` 在关闭过程中打断底层流释放。
    - ``suppress_errors=True`` 时静默 ``Exception`` 以免掩盖主流程异常且不产生未回收任务异常。
    """

    async def _run_aclose() -> None:
        if suppress_errors:
            with contextlib.suppress(Exception):
                await resource.aclose()
        else:
            await resource.aclose()

    anyio_mod = sys.modules.get("anyio")
    cancel_scope = getattr(anyio_mod, "CancelScope", None) if anyio_mod is not None else None

    with contextlib.ExitStack() as stack:
        if callable(cancel_scope):
            # 非 AnyIO/未知异步后端（如无 sniffio 识别）时回退至纯 asyncio 屏蔽逻辑。
            with contextlib.suppress(RuntimeError):
                stack.enter_context(cancel_scope(shield=True))

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop is None:
            await _run_aclose()
            return

        close_task: asyncio.Task[None] = loop.create_task(_run_aclose())
        cancelled_err: asyncio.CancelledError | None = None
        close_err: Exception | None = None
        while not close_task.done():
            try:
                await asyncio.shield(close_task)
            except asyncio.CancelledError as exc:
                cancelled_err = exc
            except Exception as exc:
                close_err = exc

        # 无论是否遭遇取消，均取走已完成任务的异常，避免 asyncio 报未回收任务警告。
        if close_err is None and not close_task.cancelled():
            try:
                close_task.result()
            except Exception as exc:
                if not suppress_errors:
                    close_err = exc

        if cancelled_err is not None:
            raise cancelled_err
        if close_err is not None:
            raise close_err
