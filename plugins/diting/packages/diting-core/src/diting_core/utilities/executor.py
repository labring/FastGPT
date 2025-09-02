#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import asyncio
from typing import Callable, Any, Iterator, List, Coroutine


async def task_wrapper(
    sem: asyncio.Semaphore, func: Callable[..., Any], *args: Any, **kwargs: Any
) -> Any:
    async with sem:  # Acquire semaphore
        return await func(*args, **kwargs)


def is_event_loop_running() -> bool:
    """
    Check if an event loop is currently running.
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False
    else:
        return loop.is_running()


async def as_completed(
    coroutines: List[Coroutine[Any, Any, None]], max_workers: int
) -> Iterator[asyncio.Future[Any]]:
    """
    Wrap coroutines with a semaphore if max_workers is specified.

    Returns an iterator of futures that completes as tasks finish.
    """
    if max_workers == -1:
        tasks = [asyncio.create_task(coro) for coro in coroutines]
    else:
        semaphore = asyncio.Semaphore(max_workers)

        async def sema_coro(coro: Coroutine[Any, Any, None]) -> Any:
            async with semaphore:
                return await coro

        tasks = [asyncio.create_task(sema_coro(coro)) for coro in coroutines]

    return asyncio.as_completed(tasks)
