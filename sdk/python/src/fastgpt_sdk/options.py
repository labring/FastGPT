"""@fastgpt-sdk 核心配置、模型基类、哨兵与原始响应包装类型定义。"""

from __future__ import annotations

import io
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Mapping
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import (
    IO,
    Annotated,
    Any,
    Generic,
    Literal,
    Protocol,
    TypeAlias,
    TypedDict,
    TypeGuard,
    TypeVar,
)

import httpx
from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    PlainSerializer,
    PlainValidator,
    model_validator,
)

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


def _values_equal_strict(left: Any, right: Any) -> bool:
    """严格比较同一字段多个别名传入的值是否一致，区分 ``bool`` 与 ``int``。"""
    if type(left) is bool or type(right) is bool:
        return type(left) is type(right) and bool(left) == bool(right)
    if isinstance(left, BaseModel) and isinstance(right, Mapping):
        left_dict = left.model_dump(mode="python", by_alias=False, exclude_unset=True)
        return _values_equal_strict(left_dict, right)
    if isinstance(left, Mapping) and isinstance(right, BaseModel):
        right_dict = right.model_dump(mode="python", by_alias=False, exclude_unset=True)
        return _values_equal_strict(left, right_dict)
    if isinstance(left, Mapping) and isinstance(right, Mapping):
        if len(left) != len(right):
            return False
        return all(k in right and _values_equal_strict(v, right[k]) for k, v in left.items())
    if isinstance(left, (list, tuple)) and isinstance(right, (list, tuple)):
        if type(left) is not type(right) or len(left) != len(right):
            return False
        return all(_values_equal_strict(a, b) for a, b in zip(left, right, strict=True))
    return bool(left == right)


@lru_cache(maxsize=512)
def _field_alias_groups(model_cls: type[BaseModel]) -> tuple[tuple[str, tuple[str, ...]], ...]:
    groups: list[tuple[str, tuple[str, ...]]] = []
    for field_name, field_info in model_cls.model_fields.items():
        aliases: list[str] = [field_name]
        if isinstance(field_info.alias, str) and field_info.alias not in aliases:
            aliases.append(field_info.alias)
        if (
            isinstance(field_info.serialization_alias, str)
            and field_info.serialization_alias not in aliases
        ):
            aliases.append(field_info.serialization_alias)
        if isinstance(field_info.validation_alias, AliasChoices):
            for choice in field_info.validation_alias.choices:
                if isinstance(choice, str) and choice not in aliases:
                    aliases.append(choice)
        elif (
            isinstance(field_info.validation_alias, str)
            and field_info.validation_alias not in aliases
        ):
            aliases.append(field_info.validation_alias)
        groups.append((field_name, tuple(aliases)))
    return tuple(groups)


class FastGPTModel(BaseModel):
    """FastGPT SDK 所有生成 Pydantic 模型的公共基类。"""

    model_config = ConfigDict(
        populate_by_name=True,
        protected_namespaces=(),
        extra="allow",
    )


class _StrictAliasInputModel(FastGPTModel):
    """输入模型公共基类：验证前归一化同字段双别名并拒绝冲突值，防止 extra 改写 wire 值。"""

    @model_validator(mode="before")
    @classmethod
    def _normalize_and_reject_alias_conflicts(cls, data: Any) -> Any:
        if not isinstance(data, Mapping):
            return data

        normalized = dict(data)
        for field_name, aliases in _field_alias_groups(cls):
            present = [alias for alias in aliases if alias in normalized]
            if len(present) <= 1:
                continue

            first_val = normalized[present[0]]
            for other_alias in present[1:]:
                if not _values_equal_strict(first_val, normalized[other_alias]):
                    raise ValueError(
                        f"Conflicting values provided for field aliases {present} "
                        f"(field {field_name!r})"
                    )

            for alias in present:
                normalized.pop(alias, None)
            normalized[field_name] = first_val

        return normalized


class FastGPTRequestModel(_StrictAliasInputModel):
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


class AuthProxyIdentity(_StrictAliasInputModel):
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


class FastGPTIdentity(_StrictAliasInputModel):
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

def is_readable_binary_stream(value: Any) -> bool:
    """判断输入是否为可读二进制流（显式拒绝 str、bytes、Path 及文本模式流）。"""
    if isinstance(value, (str, bytes, bytearray, Path, io.TextIOBase)):
        return False
    mode = getattr(value, "mode", None)
    if (
        isinstance(mode, str)
        and "b" not in mode
        and not isinstance(value, (io.BufferedIOBase, io.RawIOBase))
    ):
        return False
    return callable(getattr(value, "read", None))


def _validate_uploadable_content(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray, Path)) or is_readable_binary_stream(value):
        return value
    raise ValueError(
        "Invalid file upload content: expected bytes, bytearray, Path, or readable binary stream"
    )


def _validate_uploadable(value: Any) -> Any:
    if isinstance(value, tuple):
        if len(value) not in (2, 3) or not isinstance(value[0], str) or len(value[0]) == 0:
            raise ValueError(
                "Invalid file tuple upload input: expected (filename, content) or "
                "(filename, content, content_type)"
            )
        _validate_uploadable_content(value[1])
        if len(value) == 3 and (not isinstance(value[2], str) or len(value[2]) == 0):
            raise ValueError("File tuple content_type must be a non-empty string")
        return value
    return _validate_uploadable_content(value)


def _validate_binary_input(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray)) or is_readable_binary_stream(value):
        return value
    if (
        isinstance(value, (Iterator, AsyncIterator))
        and not isinstance(value, (str, bytes, bytearray, Path, Mapping, list, tuple))
    ):
        return value
    raise ValueError(
        "Invalid binary input: expected bytes, bytearray, readable binary stream, "
        "or byte chunk iterator/async iterator"
    )


def _passthrough_serialize(value: Any) -> Any:
    return value


UploadableContent: TypeAlias = Annotated[
    bytes | bytearray | Path | IO[bytes],
    PlainValidator(_validate_uploadable_content),
    PlainSerializer(_passthrough_serialize, return_type=Any),
]
Uploadable: TypeAlias = Annotated[
    UploadableContent
    | tuple[str, UploadableContent]
    | tuple[str, UploadableContent, str],
    PlainValidator(_validate_uploadable),
    PlainSerializer(_passthrough_serialize, return_type=Any),
]
BinaryInput: TypeAlias = Annotated[
    bytes | bytearray | IO[bytes] | Iterator[bytes] | AsyncIterator[bytes],
    PlainValidator(_validate_binary_input),
    PlainSerializer(_passthrough_serialize, return_type=Any),
]

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
    auth_proxy: AuthProxyIdentity | Mapping[str, Any]
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
    retryable: bool | None = None


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
