"""通用同步与异步自动分页迭代器（offset / pageNum / cursor 三种 FastGPT 分页协议）。"""

from __future__ import annotations

import math
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

_TItem = TypeVar("_TItem")
_TItem_co = TypeVar("_TItem_co", covariant=True)
_TCursor = TypeVar("_TCursor")

_DEFAULT_PAGE_SIZE = 20
_MAX_SERVER_PAGE_SIZE = 500


class PageLike(Protocol[_TItem_co]):
    """兼容生成 Pydantic 列表响应对象与 PageSlice 的鸭子协议。"""

    @property
    def list(self) -> Sequence[_TItem_co]: ...


@dataclass(frozen=True)
class PageSlice(Generic[_TItem]):
    """标准页式分页响应切片。"""

    list: Sequence[_TItem]
    total: int | None = None
    page_size: int | None = None
    has_more: bool | None = None


@dataclass(frozen=True)
class CursorPageSlice(Generic[_TItem, _TCursor]):
    """游标式分页响应切片。"""

    list: Sequence[_TItem]
    next_cursor: _TCursor | None = None


def _is_finite_total(total: Any) -> bool:
    return (
        isinstance(total, (int, float))
        and not isinstance(total, bool)
        and math.isfinite(total)
        and total >= 0
    )


def _positive_int(size: Any) -> int | None:
    if (
        isinstance(size, (int, float))
        and not isinstance(size, bool)
        and math.isfinite(size)
        and size >= 1
    ):
        return int(math.floor(size))
    return None


def _get_page_field(page: Any, snake_name: str, camel_name: str) -> Any:
    if isinstance(page, Mapping):
        if snake_name in page:
            return page[snake_name]
        return page.get(camel_name)
    val = getattr(page, snake_name, None)
    if val is not None:
        return val
    return getattr(page, camel_name, None)


def _extract_page_items(page: Any) -> list[Any]:
    raw_items = _get_page_field(page, "list", "list")
    return list(raw_items) if raw_items else []


class SyncPageIterable(Generic[_TItem]):
    """统一同步分页迭代器：支持逐条 ``for item in pager``、按页 ``pager.pages()`` 与
    ``pager.to_list()``。"""

    def __init__(self, page_factory: Callable[[], Iterator[list[_TItem]]]) -> None:
        self._page_factory = page_factory

    def pages(self) -> Iterator[list[_TItem]]:
        """按页批量迭代条目列表。"""
        return self._page_factory()

    def __iter__(self) -> Iterator[_TItem]:
        for page in self.pages():
            yield from page

    def to_list(self) -> list[_TItem]:
        """收集全部条目到列表（建议配合 ``max_items`` 控制内存上限）。"""
        results: list[_TItem] = []
        for page in self.pages():
            results.extend(page)
        return results


class AsyncPageIterable(Generic[_TItem]):
    """统一异步分页迭代器：支持 ``async for item in pager``、``pager.pages()`` 与
    ``await pager.to_list()``。"""

    def __init__(self, page_factory: Callable[[], AsyncIterator[list[_TItem]]]) -> None:
        self._page_factory = page_factory

    def pages(self) -> AsyncIterator[list[_TItem]]:
        """按页异步批量迭代条目列表。"""
        return self._page_factory()

    async def __aiter__(self) -> AsyncIterator[_TItem]:
        async for page in self.pages():
            for item in page:
                yield item

    async def to_list(self) -> list[_TItem]:
        """异步收集全部条目到列表（建议配合 ``max_items`` 控制内存上限）。"""
        results: list[_TItem] = []
        async for page in self.pages():
            results.extend(page)
        return results


def _should_stop_offset(
    *,
    page: Any,
    items: list[Any],
    offset: int,
    requested_page_size: int,
) -> bool:
    has_more = _get_page_field(page, "has_more", "hasMore")
    if has_more is False:
        return True
    total = _get_page_field(page, "total", "total")
    if _is_finite_total(total):
        return bool(offset >= total)
    if has_more is True:
        return False
    effective_size = (
        _positive_int(_get_page_field(page, "page_size", "pageSize"))
        or requested_page_size
    )
    return len(items) < effective_size


def _should_stop_page_num(
    *,
    page: Any,
    items: list[Any],
    current_page_num: int,
    safe_initial_page_num: int,
    safe_page_size: int,
    loaded_from_start: int,
) -> bool:
    has_more = _get_page_field(page, "has_more", "hasMore")
    if has_more is False:
        return True
    if has_more is True:
        return False

    server_page_size = _positive_int(_get_page_field(page, "page_size", "pageSize"))
    total = _get_page_field(page, "total", "total")

    if _is_finite_total(total):
        if server_page_size is not None:
            end_offset = (current_page_num - 1) * server_page_size + len(items)
            return bool(end_offset >= total)
        if safe_initial_page_num == 1:
            return bool(loaded_from_start >= total)
        if len(items) >= safe_page_size:
            end_offset = (current_page_num - 1) * safe_page_size + len(items)
            return bool(end_offset >= total)
        return False

    expected_page_size = server_page_size or safe_page_size
    return len(items) < expected_page_size


def create_offset_paginator(
    *,
    fetch_page: Callable[[int, int], PageLike[_TItem] | Mapping[str, Any]],
    initial_offset: int = 0,
    page_size: int = _DEFAULT_PAGE_SIZE,
    max_items: int | None = None,
    max_pages: int | None = None,
) -> SyncPageIterable[_TItem]:
    """创建同步 ``offset + pageSize`` 自动分页迭代器。"""
    safe_page_size = min(max(1, int(page_size)), _MAX_SERVER_PAGE_SIZE)
    safe_initial_offset = max(0, int(initial_offset))

    def _iter_pages() -> Iterator[list[_TItem]]:
        offset = safe_initial_offset
        yielded_count = 0
        page_count = 0

        while True:
            if max_pages is not None and page_count >= max_pages:
                return
            if max_items is not None and yielded_count >= max_items:
                return

            allowance = (
                min(safe_page_size, max_items - yielded_count)
                if max_items is not None
                else safe_page_size
            )
            requested_size = max(1, allowance)
            page = fetch_page(offset, requested_size)
            items = _extract_page_items(page)
            if not items:
                return

            sliced = (
                items[: max_items - yielded_count]
                if max_items is not None and yielded_count + len(items) > max_items
                else items
            )
            yielded_count += len(sliced)
            offset += len(items)
            page_count += 1
            yield sliced

            if max_items is not None and yielded_count >= max_items:
                return
            if _should_stop_offset(
                page=page,
                items=items,
                offset=offset,
                requested_page_size=requested_size,
            ):
                return

    return SyncPageIterable(_iter_pages)


def create_async_offset_paginator(
    *,
    fetch_page: Callable[[int, int], Awaitable[PageLike[_TItem] | Mapping[str, Any]]],
    initial_offset: int = 0,
    page_size: int = _DEFAULT_PAGE_SIZE,
    max_items: int | None = None,
    max_pages: int | None = None,
) -> AsyncPageIterable[_TItem]:
    """创建异步 ``offset + pageSize`` 自动分页迭代器。"""
    safe_page_size = min(max(1, int(page_size)), _MAX_SERVER_PAGE_SIZE)
    safe_initial_offset = max(0, int(initial_offset))

    async def _iter_pages() -> AsyncIterator[list[_TItem]]:
        offset = safe_initial_offset
        yielded_count = 0
        page_count = 0

        while True:
            if max_pages is not None and page_count >= max_pages:
                return
            if max_items is not None and yielded_count >= max_items:
                return

            allowance = (
                min(safe_page_size, max_items - yielded_count)
                if max_items is not None
                else safe_page_size
            )
            requested_size = max(1, allowance)
            page = await fetch_page(offset, requested_size)
            items = _extract_page_items(page)
            if not items:
                return

            sliced = (
                items[: max_items - yielded_count]
                if max_items is not None and yielded_count + len(items) > max_items
                else items
            )
            yielded_count += len(sliced)
            offset += len(items)
            page_count += 1
            yield sliced

            if max_items is not None and yielded_count >= max_items:
                return
            if _should_stop_offset(
                page=page,
                items=items,
                offset=offset,
                requested_page_size=requested_size,
            ):
                return

    return AsyncPageIterable(_iter_pages)


def create_page_num_paginator(
    *,
    fetch_page: Callable[[int, int], PageLike[_TItem] | Mapping[str, Any]],
    initial_page_num: int = 1,
    page_size: int = _DEFAULT_PAGE_SIZE,
    max_items: int | None = None,
    max_pages: int | None = None,
) -> SyncPageIterable[_TItem]:
    """创建同步 ``pageNum + pageSize``（从 1 起始且保持固定页长寻址基线）自动分页迭代器。"""
    safe_page_size = min(max(1, int(page_size)), _MAX_SERVER_PAGE_SIZE)
    safe_initial_page_num = max(1, int(initial_page_num))

    def _iter_pages() -> Iterator[list[_TItem]]:
        page_num = safe_initial_page_num
        loaded_from_start = 0
        yielded_count = 0
        page_count = 0

        while True:
            if max_pages is not None and page_count >= max_pages:
                return
            if max_items is not None and yielded_count >= max_items:
                return

            current_page_num = page_num
            page = fetch_page(current_page_num, safe_page_size)
            items = _extract_page_items(page)
            if not items:
                return

            sliced = (
                items[: max_items - yielded_count]
                if max_items is not None and yielded_count + len(items) > max_items
                else items
            )
            yielded_count += len(sliced)
            loaded_from_start += len(items)
            page_num += 1
            page_count += 1
            yield sliced

            if max_items is not None and yielded_count >= max_items:
                return
            if _should_stop_page_num(
                page=page,
                items=items,
                current_page_num=current_page_num,
                safe_initial_page_num=safe_initial_page_num,
                safe_page_size=safe_page_size,
                loaded_from_start=loaded_from_start,
            ):
                return

    return SyncPageIterable(_iter_pages)


def create_async_page_num_paginator(
    *,
    fetch_page: Callable[[int, int], Awaitable[PageLike[_TItem] | Mapping[str, Any]]],
    initial_page_num: int = 1,
    page_size: int = _DEFAULT_PAGE_SIZE,
    max_items: int | None = None,
    max_pages: int | None = None,
) -> AsyncPageIterable[_TItem]:
    """创建异步 ``pageNum + pageSize``（保持固定页长寻址基线）自动分页迭代器。"""
    safe_page_size = min(max(1, int(page_size)), _MAX_SERVER_PAGE_SIZE)
    safe_initial_page_num = max(1, int(initial_page_num))

    async def _iter_pages() -> AsyncIterator[list[_TItem]]:
        page_num = safe_initial_page_num
        loaded_from_start = 0
        yielded_count = 0
        page_count = 0

        while True:
            if max_pages is not None and page_count >= max_pages:
                return
            if max_items is not None and yielded_count >= max_items:
                return

            current_page_num = page_num
            page = await fetch_page(current_page_num, safe_page_size)
            items = _extract_page_items(page)
            if not items:
                return

            sliced = (
                items[: max_items - yielded_count]
                if max_items is not None and yielded_count + len(items) > max_items
                else items
            )
            yielded_count += len(sliced)
            loaded_from_start += len(items)
            page_num += 1
            page_count += 1
            yield sliced

            if max_items is not None and yielded_count >= max_items:
                return
            if _should_stop_page_num(
                page=page,
                items=items,
                current_page_num=current_page_num,
                safe_initial_page_num=safe_initial_page_num,
                safe_page_size=safe_page_size,
                loaded_from_start=loaded_from_start,
            ):
                return

    return AsyncPageIterable(_iter_pages)


def create_cursor_paginator(
    *,
    fetch_page: Callable[
        [_TCursor | None],
        CursorPageSlice[_TItem, _TCursor] | PageLike[_TItem] | Mapping[str, Any],
    ],
    initial_cursor: _TCursor | None = None,
    max_items: int | None = None,
    max_pages: int | None = None,
) -> SyncPageIterable[_TItem]:
    """创建同步 ``cursor + nextCursor`` 自动分页迭代器。"""

    def _iter_pages() -> Iterator[list[_TItem]]:
        cursor = initial_cursor
        yielded_count = 0
        page_count = 0

        while True:
            if max_pages is not None and page_count >= max_pages:
                return
            if max_items is not None and yielded_count >= max_items:
                return

            page = fetch_page(cursor)
            items = _extract_page_items(page)
            if not items:
                return

            sliced = (
                items[: max_items - yielded_count]
                if max_items is not None and yielded_count + len(items) > max_items
                else items
            )
            yielded_count += len(sliced)
            page_count += 1
            yield sliced

            if max_items is not None and yielded_count >= max_items:
                return
            next_cursor = _get_page_field(page, "next_cursor", "nextCursor")
            if next_cursor is None:
                return
            cursor = next_cursor

    return SyncPageIterable(_iter_pages)


def create_async_cursor_paginator(
    *,
    fetch_page: Callable[
        [_TCursor | None],
        Awaitable[CursorPageSlice[_TItem, _TCursor] | PageLike[_TItem] | Mapping[str, Any]],
    ],
    initial_cursor: _TCursor | None = None,
    max_items: int | None = None,
    max_pages: int | None = None,
) -> AsyncPageIterable[_TItem]:
    """创建异步 ``cursor + nextCursor`` 自动分页迭代器。"""

    async def _iter_pages() -> AsyncIterator[list[_TItem]]:
        cursor = initial_cursor
        yielded_count = 0
        page_count = 0

        while True:
            if max_pages is not None and page_count >= max_pages:
                return
            if max_items is not None and yielded_count >= max_items:
                return

            page = await fetch_page(cursor)
            items = _extract_page_items(page)
            if not items:
                return

            sliced = (
                items[: max_items - yielded_count]
                if max_items is not None and yielded_count + len(items) > max_items
                else items
            )
            yielded_count += len(sliced)
            page_count += 1
            yield sliced

            if max_items is not None and yielded_count >= max_items:
                return
            next_cursor = _get_page_field(page, "next_cursor", "nextCursor")
            if next_cursor is None:
                return
            cursor = next_cursor

    return AsyncPageIterable(_iter_pages)
