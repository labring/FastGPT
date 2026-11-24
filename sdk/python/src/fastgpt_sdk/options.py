"""@fastgpt-sdk 核心配置、模型基类、哨兵与原始响应包装类型定义。"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import IO, Any, Generic, Literal, Protocol, TypedDict, TypeGuard, TypeVar

import httpx
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator

_T = TypeVar("_T")


class NotGiven:
    """区分「调用方未传参（省略该键）」与「显式传入 None（序列化 null）」的哨兵类型。"""

    def __bool__(self) -> Literal[False]:
        return False

    def __repr__(self) -> str:
        return "NOT_GIVEN"


NOT_GIVEN = NotGiven()


def is_given(value: _T | NotGiven) -> TypeGuard[_T]:
    """判断可选参数是否被显式提供（非 NOT_GIVEN）。"""
    return not isinstance(value, NotGiven)


class FastGPTModel(BaseModel):
    """FastGPT SDK 所有生成 Pydantic 模型的公共基类。"""

    model_config = ConfigDict(
        populate_by_name=True,
        protected_namespaces=(),
        extra="allow",
    )


class FastGPTRequestModel(FastGPTModel):
    """支持二进制上传句柄与 camelCase/snake_case 双向绑定的请求模型基类。"""

    model_config = ConfigDict(
        populate_by_name=True,
        protected_namespaces=(),
        extra="allow",
        arbitrary_types_allowed=True,
    )


class FastGPTResponseModel(FastGPTModel):
    """兼容服务端向前扩展字段的响应模型基类。"""

    model_config = ConfigDict(
        populate_by_name=True,
        protected_namespaces=(),
        extra="allow",
    )


class AuthProxyIdentity(FastGPTModel):
    """团队成员身份代理（仅开启代理权限的个人密钥可用；tmb_id 与 username 互斥）。"""

    tmb_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("tmb_id", "tmbId"),
        serialization_alias="tmbId",
    )
    username: str | None = None

    @model_validator(mode="after")
    def _validate_exclusive_member(self) -> AuthProxyIdentity:
        has_tmb = self.tmb_id is not None and len(self.tmb_id) > 0
        has_user = self.username is not None and len(self.username) > 0
        if has_tmb and has_user:
            raise ValueError('AuthProxyIdentity "tmb_id" and "username" are mutually exclusive')
        if not has_tmb and not has_user:
            raise ValueError('AuthProxyIdentity requires either "tmb_id" or "username"')
        return self


class FastGPTIdentity(FastGPTModel):
    """调用者终端身份上下文（custom_uid 与 auth_proxy 严格互斥）。"""

    custom_uid: str | None = Field(
        default=None,
        validation_alias=AliasChoices("custom_uid", "customUid"),
        serialization_alias="customUid",
    )
    auth_proxy: AuthProxyIdentity | None = Field(
        default=None,
        validation_alias=AliasChoices("auth_proxy", "authProxy"),
        serialization_alias="authProxy",
    )

    @model_validator(mode="after")
    def _validate_identity_exclusivity(self) -> FastGPTIdentity:
        if self.custom_uid is not None and self.auth_proxy is not None:
            raise ValueError('"custom_uid" and "auth_proxy" are mutually exclusive')
        return self


CredentialProvider = str | Callable[[], str]
AsyncCredentialProvider = str | Callable[[], str | Awaitable[str]]

UploadableContent = bytes | bytearray | Path | IO[bytes]
Uploadable = (
    UploadableContent
    | tuple[str, UploadableContent]
    | tuple[str, UploadableContent, str]
)
BinaryInput = bytes | bytearray | IO[bytes] | Iterator[bytes] | AsyncIterator[bytes]

FastGPTLogLevel = Literal["debug", "info", "warn", "error", "silent"]


class FastGPTLogger(Protocol):
    """兼容标准库 ``logging.Logger`` 与自定义日志对象的最小协议。"""

    def debug(self, msg: str, *args: Any, **kwargs: Any) -> Any: ...
    def info(self, msg: str, *args: Any, **kwargs: Any) -> Any: ...
    def warning(self, msg: str, *args: Any, **kwargs: Any) -> Any: ...
    def error(self, msg: str, *args: Any, **kwargs: Any) -> Any: ...


@dataclass(frozen=True)
class RequestHookContext:
    operation_id: str
    method: str
    url: str
    headers: dict[str, str]
    attempt: int


@dataclass(frozen=True)
class ResponseHookContext:
    operation_id: str
    method: str
    url: str
    status_code: int
    request_id: str | None
    duration_ms: float
    attempt: int


@dataclass(frozen=True)
class ErrorHookContext:
    operation_id: str
    method: str
    url: str
    duration_ms: float
    attempt: int
    error: Exception


@dataclass(frozen=True)
class FastGPTHooks:
    """请求生命周期可观测性回调（支持同步函数或 async 协程函数）。"""

    on_request: Callable[[RequestHookContext], Any] | None = None
    on_response: Callable[[ResponseHookContext], Any] | None = None
    on_error: Callable[[ErrorHookContext], Any] | None = None


class RequestOptions(TypedDict, total=False):
    """单次请求级覆盖选项。"""

    api_key: str
    custom_uid: str
    auth_proxy: AuthProxyIdentity | Mapping[str, Any] | str
    timeout: float | httpx.Timeout
    max_retries: int
    headers: Mapping[str, str]


@dataclass(frozen=True)
class RawResponseInfo:
    """原始 HTTP 响应元信息。"""

    status_code: int
    headers: httpx.Headers
    request_id: str | None
    url: str


HttpMethod = Literal["GET", "POST", "PUT", "DELETE", "PATCH"]
RequestContentType = Literal["none", "json", "multipart", "octet-stream"]
MultipartMode = Literal["fileAndJsonData", "flatFields"]
ResponseMode = Literal["envelope", "rawJson", "void", "text", "binary"]
ContextCarrier = Literal["query", "body", "multipartData"]


@dataclass(frozen=True)
class OperationSpec:
    """由 SDK IR 固化的单接口契约传输元数据。"""

    id: str
    http_method: HttpMethod
    path: str
    request_content_type: RequestContentType
    response_mode: ResponseMode
    app_id_carrier: ContextCarrier | None = None
    identity_carrier: ContextCarrier | None = None
    path_params: tuple[str, ...] = ()
    query_params: tuple[str, ...] = ()
    body_params: tuple[str, ...] = ()
    multipart_mode: MultipartMode | None = None
    binary_body_field: str | None = None


_UNSET = object()


class APIResponse(Generic[_T]):
    """``client.with_raw_response`` 返回的原始 HTTP 响应与类型化业务数据包装。"""

    http_response: httpx.Response
    status_code: int
    headers: httpx.Headers
    request_id: str | None
    url: str

    def __init__(
        self,
        *,
        http_response: httpx.Response,
        response_info: RawResponseInfo,
        parse_fn: Callable[[], _T],
    ) -> None:
        self.http_response = http_response
        self.status_code = response_info.status_code
        self.headers = response_info.headers
        self.request_id = response_info.request_id
        self.url = response_info.url
        self._parse_fn = parse_fn
        self._cached: object = _UNSET

    def parse(self) -> _T:
        """返回经模型校验后的业务数据（void 操作返回 ``None``）；多次调用复用缓存。"""
        if self._cached is _UNSET:
            self._cached = self._parse_fn()
        return self._cached  # type: ignore[return-value]

    @property
    def data(self) -> _T:
        """``parse()`` 的只读属性快捷访问器。"""
        return self.parse()
