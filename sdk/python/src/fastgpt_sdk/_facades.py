"""组合生成层 Resource 与手写高阶 Helper（交互恢复与自动分页）的外观层。"""

from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from .generated.models import (
    AppsLogsListUsersReq,
    AppsLogsListUsersResListItem,
    AppsLogsSearchReq,
    AppsLogsSearchReqCursor,
    AppsLogsSearchResListItem,
    ChatHistoriesListReq,
    ChatHistoriesListResListItem,
    ChatRecordsListReq,
    DatasetsCollectionsListReq,
    DatasetsCollectionsListResListItem,
    DatasetsDataListReq,
    DatasetsDataListResListItem,
    DatasetsListReq,
    DatasetsListResListItem,
)
from .generated.resources import (
    AppsLogsResource,
    AppsResource,
    AsyncAppsLogsResource,
    AsyncAppsResource,
    AsyncChatHistoriesResource,
    AsyncChatRecordsResource,
    AsyncChatResource,
    AsyncDatasetsCollectionsResource,
    AsyncDatasetsDataResource,
    AsyncDatasetsResource,
    AsyncModelsResource,
    ChatHistoriesResource,
    ChatRecordsResource,
    ChatResource,
    DatasetsCollectionsResource,
    DatasetsDataResource,
    DatasetsResource,
    ModelsResource,
)
from .interactive import AsyncChatInteractiveHelper, ChatInteractiveHelper
from .options import RequestOptions
from .pagination import (
    AsyncPageIterable,
    SyncPageIterable,
    create_async_cursor_paginator,
    create_async_offset_paginator,
    create_cursor_paginator,
    create_offset_paginator,
)

if TYPE_CHECKING:
    from ._base_client import AsyncBaseClient, SyncBaseClient


def _normalize_req_dict(request: Any, kwargs: dict[str, Any]) -> dict[str, Any]:
    if request is not None:
        if hasattr(request, "model_dump"):
            return dict(request.model_dump(mode="python", by_alias=True, exclude_unset=True))
        if isinstance(request, Mapping):
            return dict(request)
    return dict(kwargs)


def _strip_offset_fields(req_dict: dict[str, Any]) -> tuple[dict[str, Any], int | None, int | None]:
    cleaned = dict(req_dict)
    raw_offset = cleaned.pop("offset", None)
    raw_page_size = cleaned.pop("pageSize", None)
    if raw_page_size is None:
        raw_page_size = cleaned.pop("page_size", None)
    cleaned.pop("pageNum", None)
    cleaned.pop("page_num", None)
    offset_val = int(raw_offset) if isinstance(raw_offset, (int, float)) else None
    size_val = int(raw_page_size) if isinstance(raw_page_size, (int, float)) else None
    return cleaned, offset_val, size_val


class AppsLogsFacade(AppsLogsResource):
    def search_auto_paging(
        self,
        request: AppsLogsSearchReq | Mapping[str, Any] | None = None,
        /,
        *,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[AppsLogsSearchResListItem]:
        """按游标自动分页遍历应用对话日志搜索结果（``POST /core/app/logs/search``）。"""
        base = _normalize_req_dict(request, kwargs)
        initial_cursor = base.pop("cursor", None)

        def _fetch(cursor: AppsLogsSearchReqCursor | dict[str, Any] | None) -> Any:
            payload = dict(base)
            if cursor is not None:
                payload["cursor"] = cursor
            return self.search(payload, request_options=request_options)

        return create_cursor_paginator(
            fetch_page=_fetch,
            initial_cursor=initial_cursor,
            max_items=max_items,
            max_pages=max_pages,
        )

    def list_users_auto_paging(
        self,
        request: AppsLogsListUsersReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[AppsLogsListUsersResListItem]:
        """自动分页遍历应用日志用户列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_offset_paginator(
            fetch_page=lambda offset, size: self.list_users(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AppsFacade(AppsResource):
    logs: AppsLogsFacade

    def __init__(self, client: SyncBaseClient) -> None:
        super().__init__(client)
        self.logs = AppsLogsFacade(client)


class ChatHistoriesFacade(ChatHistoriesResource):
    def list_auto_paging(
        self,
        request: ChatHistoriesListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[ChatHistoriesListResListItem]:
        """自动分页遍历会话历史列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class ChatRecordsFacade(ChatRecordsResource):
    def list_auto_paging(
        self,
        request: ChatRecordsListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[dict[str, Any]]:
        """自动分页遍历会话消息记录列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class ChatFacade(ChatResource):
    histories: ChatHistoriesFacade
    records: ChatRecordsFacade
    interactive: ChatInteractiveHelper

    def __init__(self, client: SyncBaseClient) -> None:
        super().__init__(client)
        self.histories = ChatHistoriesFacade(client)
        self.records = ChatRecordsFacade(client)
        self.interactive = ChatInteractiveHelper(self)


class DatasetsCollectionsFacade(DatasetsCollectionsResource):
    def list_auto_paging(
        self,
        request: DatasetsCollectionsListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[DatasetsCollectionsListResListItem]:
        """自动分页遍历知识库集合列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class DatasetsDataFacade(DatasetsDataResource):
    def list_auto_paging(
        self,
        request: DatasetsDataListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[DatasetsDataListResListItem]:
        """自动分页遍历集合数据分块列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class DatasetsFacade(DatasetsResource):
    collections: DatasetsCollectionsFacade
    data: DatasetsDataFacade

    def __init__(self, client: SyncBaseClient) -> None:
        super().__init__(client)
        self.collections = DatasetsCollectionsFacade(client)
        self.data = DatasetsDataFacade(client)

    def list_auto_paging(
        self,
        request: DatasetsListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> SyncPageIterable[DatasetsListResListItem]:
        """自动分页遍历知识库列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AsyncAppsLogsFacade(AsyncAppsLogsResource):
    def search_auto_paging(
        self,
        request: AppsLogsSearchReq | Mapping[str, Any] | None = None,
        /,
        *,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[AppsLogsSearchResListItem]:
        """按游标异步自动分页遍历应用对话日志搜索结果。"""
        base = _normalize_req_dict(request, kwargs)
        initial_cursor = base.pop("cursor", None)

        async def _fetch(cursor: AppsLogsSearchReqCursor | dict[str, Any] | None) -> Any:
            payload = dict(base)
            if cursor is not None:
                payload["cursor"] = cursor
            return await self.search(payload, request_options=request_options)

        return create_async_cursor_paginator(
            fetch_page=_fetch,
            initial_cursor=initial_cursor,
            max_items=max_items,
            max_pages=max_pages,
        )

    def list_users_auto_paging(
        self,
        request: AppsLogsListUsersReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[AppsLogsListUsersResListItem]:
        """异步自动分页遍历应用日志用户列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_async_offset_paginator(
            fetch_page=lambda offset, size: self.list_users(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AsyncAppsFacade(AsyncAppsResource):
    logs: AsyncAppsLogsFacade

    def __init__(self, client: AsyncBaseClient) -> None:
        super().__init__(client)
        self.logs = AsyncAppsLogsFacade(client)


class AsyncChatHistoriesFacade(AsyncChatHistoriesResource):
    def list_auto_paging(
        self,
        request: ChatHistoriesListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[ChatHistoriesListResListItem]:
        """异步自动分页遍历会话历史列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_async_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AsyncChatRecordsFacade(AsyncChatRecordsResource):
    def list_auto_paging(
        self,
        request: ChatRecordsListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[dict[str, Any]]:
        """异步自动分页遍历会话消息记录列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_async_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AsyncChatFacade(AsyncChatResource):
    histories: AsyncChatHistoriesFacade
    records: AsyncChatRecordsFacade
    interactive: AsyncChatInteractiveHelper

    def __init__(self, client: AsyncBaseClient) -> None:
        super().__init__(client)
        self.histories = AsyncChatHistoriesFacade(client)
        self.records = AsyncChatRecordsFacade(client)
        self.interactive = AsyncChatInteractiveHelper(self)


class AsyncDatasetsCollectionsFacade(AsyncDatasetsCollectionsResource):
    def list_auto_paging(
        self,
        request: DatasetsCollectionsListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[DatasetsCollectionsListResListItem]:
        """异步自动分页遍历知识库集合列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_async_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AsyncDatasetsDataFacade(AsyncDatasetsDataResource):
    def list_auto_paging(
        self,
        request: DatasetsDataListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[DatasetsDataListResListItem]:
        """异步自动分页遍历集合数据分块列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_async_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


class AsyncDatasetsFacade(AsyncDatasetsResource):
    collections: AsyncDatasetsCollectionsFacade
    data: AsyncDatasetsDataFacade

    def __init__(self, client: AsyncBaseClient) -> None:
        super().__init__(client)
        self.collections = AsyncDatasetsCollectionsFacade(client)
        self.data = AsyncDatasetsDataFacade(client)

    def list_auto_paging(
        self,
        request: DatasetsListReq | Mapping[str, Any] | None = None,
        /,
        *,
        page_size: int | None = None,
        max_items: int | None = None,
        max_pages: int | None = None,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncPageIterable[DatasetsListResListItem]:
        """异步自动分页遍历知识库列表。"""
        base, req_offset, req_size = _strip_offset_fields(_normalize_req_dict(request, kwargs))
        effective_size = page_size if page_size is not None else (req_size or 20)

        return create_async_offset_paginator(
            fetch_page=lambda offset, size: self.list(
                {**base, "offset": offset, "pageSize": size},
                request_options=request_options,
            ),
            initial_offset=req_offset or 0,
            page_size=effective_size,
            max_items=max_items,
            max_pages=max_pages,
        )


__all__ = [
    "AppsFacade",
    "AppsLogsFacade",
    "AsyncAppsFacade",
    "AsyncAppsLogsFacade",
    "AsyncChatFacade",
    "AsyncChatHistoriesFacade",
    "AsyncChatRecordsFacade",
    "AsyncDatasetsCollectionsFacade",
    "AsyncDatasetsDataFacade",
    "AsyncDatasetsFacade",
    "AsyncModelsResource",
    "ChatFacade",
    "ChatHistoriesFacade",
    "ChatRecordsFacade",
    "DatasetsCollectionsFacade",
    "DatasetsDataFacade",
    "DatasetsFacade",
    "ModelsResource",
]
