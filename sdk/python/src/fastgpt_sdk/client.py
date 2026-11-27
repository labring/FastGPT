"""FastGPT 官方 Python SDK 主客户端入口（FastGPT 同步 / AsyncFastGPT 异步）。"""

from __future__ import annotations

from collections.abc import Mapping
from functools import cached_property
from typing import Any

import httpx

from ._base_client import AsyncBaseClient, SyncBaseClient, _normalize_identity_input
from ._facades import (
    AppsFacade,
    AsyncAppsFacade,
    AsyncChatFacade,
    AsyncDatasetsFacade,
    AsyncModelsResource,
    ChatFacade,
    DatasetsFacade,
    ModelsResource,
)
from .generated.resources import (
    AsyncWithRawResponseAppsResource,
    AsyncWithRawResponseChatResource,
    AsyncWithRawResponseDatasetsResource,
    AsyncWithRawResponseModelsResource,
    WithRawResponseAppsResource,
    WithRawResponseChatResource,
    WithRawResponseDatasetsResource,
    WithRawResponseModelsResource,
)
from .options import (
    AsyncCredentialProvider,
    AuthProxyIdentity,
    CredentialProvider,
    FastGPTHooks,
    FastGPTIdentity,
    FastGPTLogger,
    FastGPTLogLevel,
)


class _SyncWithRawResponse:
    def __init__(self, client: SyncBaseClient) -> None:
        self.apps = WithRawResponseAppsResource(client)
        self.chat = WithRawResponseChatResource(client)
        self.datasets = WithRawResponseDatasetsResource(client)
        self.models = WithRawResponseModelsResource(client)


class _AsyncWithRawResponse:
    def __init__(self, client: AsyncBaseClient) -> None:
        self.apps = AsyncWithRawResponseAppsResource(client)
        self.chat = AsyncWithRawResponseChatResource(client)
        self.datasets = AsyncWithRawResponseDatasetsResource(client)
        self.models = AsyncWithRawResponseModelsResource(client)


class FastGPT(SyncBaseClient):
    """FastGPT 官方同步 SDK 客户端主入口。"""

    apps: AppsFacade
    chat: ChatFacade
    datasets: DatasetsFacade
    models: ModelsResource

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: CredentialProvider | None = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = 60.0,
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
            http_client=http_client,
            _owns_http_client=_owns_http_client,
        )
        self._raw_base_url = base_url
        self.apps = AppsFacade(self)
        self.chat = ChatFacade(self)
        self.datasets = DatasetsFacade(self)
        self.models = ModelsResource(self)

    @cached_property
    def with_raw_response(self) -> _SyncWithRawResponse:
        """返回原始 HTTP 响应视图资源树，每次调用返回含 status_code/headers/parse() 的
        APIResponse。"""
        return _SyncWithRawResponse(self)

    def with_identity(
        self,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        /,
        *,
        custom_uid: str | None = None,
        auth_proxy: AuthProxyIdentity | Mapping[str, Any] | None = None,
    ) -> FastGPT:
        """派生绑定特定调用者身份的新客户端实例，复用父客户端底层连接池。"""
        normalized = _normalize_identity_input(
            custom_uid=custom_uid,
            auth_proxy=auth_proxy,
            identity=identity,
        )
        return FastGPT(
            base_url=self._raw_base_url,
            api_key=self._api_key_provider,
            default_app_id=self._default_app_id,
            identity=normalized,
            timeout=self._timeout,
            max_retries=self._max_retries,
            default_headers=self._default_headers,
            hooks=self._hooks,
            logger=self._logger_raw,
            http_client=self._http_client,
            _owns_http_client=False,
        )

    def with_options(
        self,
        *,
        base_url: str | None = None,
        api_key: CredentialProvider | None = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = None,
        max_retries: int | None = None,
        default_headers: Mapping[str, str] | None = None,
        hooks: FastGPTHooks | None = None,
        logger: FastGPTLogger | FastGPTLogLevel | None = None,
        http_client: httpx.Client | None = None,
    ) -> FastGPT:
        """派生覆盖部分配置的新客户端实例；始终不接管父客户端或外部传入 http_client 的关闭权。"""
        return FastGPT(
            base_url=base_url if base_url is not None else self._raw_base_url,
            api_key=api_key if api_key is not None else self._api_key_provider,
            default_app_id=(
                default_app_id if default_app_id is not None else self._default_app_id
            ),
            identity=identity if identity is not None else self._identity,
            timeout=timeout if timeout is not None else self._timeout,
            max_retries=max_retries if max_retries is not None else self._max_retries,
            default_headers=(
                default_headers if default_headers is not None else self._default_headers
            ),
            hooks=hooks if hooks is not None else self._hooks,
            logger=logger if logger is not None else self._logger_raw,
            http_client=http_client if http_client is not None else self._http_client,
            _owns_http_client=False,
        )

    def __enter__(self) -> FastGPT:
        return self

    def __exit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        self.close()


class AsyncFastGPT(AsyncBaseClient):
    """FastGPT 官方异步 SDK 客户端主入口。"""

    apps: AsyncAppsFacade
    chat: AsyncChatFacade
    datasets: AsyncDatasetsFacade
    models: AsyncModelsResource

    def __init__(
        self,
        *,
        base_url: str | None = None,
        api_key: AsyncCredentialProvider | None = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = 60.0,
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
            http_client=http_client,
            _owns_http_client=_owns_http_client,
        )
        self._raw_base_url = base_url
        self.apps = AsyncAppsFacade(self)
        self.chat = AsyncChatFacade(self)
        self.datasets = AsyncDatasetsFacade(self)
        self.models = AsyncModelsResource(self)

    @cached_property
    def with_raw_response(self) -> _AsyncWithRawResponse:
        """返回异步原始 HTTP 响应视图资源树。"""
        return _AsyncWithRawResponse(self)

    def with_identity(
        self,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        /,
        *,
        custom_uid: str | None = None,
        auth_proxy: AuthProxyIdentity | Mapping[str, Any] | None = None,
    ) -> AsyncFastGPT:
        """派生绑定特定调用者身份的新异步客户端实例，复用父客户端底层连接池。"""
        normalized = _normalize_identity_input(
            custom_uid=custom_uid,
            auth_proxy=auth_proxy,
            identity=identity,
        )
        return AsyncFastGPT(
            base_url=self._raw_base_url,
            api_key=self._api_key_provider,
            default_app_id=self._default_app_id,
            identity=normalized,
            timeout=self._timeout,
            max_retries=self._max_retries,
            default_headers=self._default_headers,
            hooks=self._hooks,
            logger=self._logger_raw,
            http_client=self._http_client,
            _owns_http_client=False,
        )

    def with_options(
        self,
        *,
        base_url: str | None = None,
        api_key: AsyncCredentialProvider | None = None,
        default_app_id: str | None = None,
        identity: FastGPTIdentity | Mapping[str, Any] | None = None,
        timeout: float | httpx.Timeout | None = None,
        max_retries: int | None = None,
        default_headers: Mapping[str, str] | None = None,
        hooks: FastGPTHooks | None = None,
        logger: FastGPTLogger | FastGPTLogLevel | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> AsyncFastGPT:
        """派生覆盖部分配置的新异步客户端实例；始终不接管父客户端或外部传入 http_client 的
        关闭权。"""
        return AsyncFastGPT(
            base_url=base_url if base_url is not None else self._raw_base_url,
            api_key=api_key if api_key is not None else self._api_key_provider,
            default_app_id=(
                default_app_id if default_app_id is not None else self._default_app_id
            ),
            identity=identity if identity is not None else self._identity,
            timeout=timeout if timeout is not None else self._timeout,
            max_retries=max_retries if max_retries is not None else self._max_retries,
            default_headers=(
                default_headers if default_headers is not None else self._default_headers
            ),
            hooks=hooks if hooks is not None else self._hooks,
            logger=logger if logger is not None else self._logger_raw,
            http_client=http_client if http_client is not None else self._http_client,
            _owns_http_client=False,
        )

    async def __aenter__(self) -> AsyncFastGPT:
        return self

    async def __aexit__(self, _exc_type: Any, _exc: Any, _tb: Any) -> None:
        await self.aclose()
