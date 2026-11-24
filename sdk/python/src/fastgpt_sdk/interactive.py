"""工作流人机交互（userSelect / userInput / paymentPause）识别与一键恢复助手。"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import TYPE_CHECKING, Annotated, Any, Literal, TypeGuard

from pydantic import AliasChoices, BaseModel, Field

from .options import FastGPTModel, RequestOptions
from .sse import AsyncChatStream, ChatStream

if TYPE_CHECKING:
    from .generated.models import ChatCompletionsV2Res
    from .generated.resources import AsyncChatResource, ChatResource


class UserSelectInteractiveOption(FastGPTModel):
    key: str
    value: str


class UserSelectInteractiveParams(FastGPTModel):
    description: str | None = None
    user_select_options: list[UserSelectInteractiveOption] = Field(
        validation_alias=AliasChoices("user_select_options", "userSelectOptions"),
        serialization_alias="userSelectOptions",
    )
    user_selected_val: str | None = Field(
        default=None,
        validation_alias=AliasChoices("user_selected_val", "userSelectedVal"),
        serialization_alias="userSelectedVal",
    )


class UserSelectInteractivePayload(FastGPTModel):
    type: Literal["userSelect"] = "userSelect"
    params: UserSelectInteractiveParams


class UserInputInteractiveParams(FastGPTModel):
    description: str | None = None
    input_form: list[dict[str, Any]] = Field(
        validation_alias=AliasChoices("input_form", "inputForm"),
        serialization_alias="inputForm",
    )
    submitted: bool | None = None


class UserInputInteractivePayload(FastGPTModel):
    type: Literal["userInput"] = "userInput"
    params: UserInputInteractiveParams


class PaymentPauseInteractiveParams(FastGPTModel):
    description: str | None = None
    continue_: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("continue_", "continue"),
        serialization_alias="continue",
    )


class PaymentPauseInteractivePayload(FastGPTModel):
    type: Literal["paymentPause"] = "paymentPause"
    params: PaymentPauseInteractiveParams


NestedInteractiveWrapperType = Literal[
    "childrenInteractive",
    "toolChildrenInteractive",
    "loopInteractive",
    "loopRunInteractive",
]


class NestedInteractiveParams(FastGPTModel):
    children_response: InteractivePayload = Field(
        validation_alias=AliasChoices("children_response", "childrenResponse"),
        serialization_alias="childrenResponse",
    )


class NestedInteractivePayload(FastGPTModel):
    type: NestedInteractiveWrapperType
    params: NestedInteractiveParams


class UnknownInteractivePayload(FastGPTModel):
    """无法识别或结构不匹配已知交互协议时的独立判别分支。"""

    type: Literal["unknown"] = "unknown"
    raw_type: str = Field(
        validation_alias=AliasChoices("raw_type", "rawType"),
        serialization_alias="rawType",
    )
    params: dict[str, Any] | None = None
    raw: dict[str, Any]


InteractivePayload = Annotated[
    UserSelectInteractivePayload
    | UserInputInteractivePayload
    | PaymentPauseInteractivePayload
    | NestedInteractivePayload
    | UnknownInteractivePayload,
    Field(discriminator="type"),
]

NestedInteractiveParams.model_rebuild()
NestedInteractivePayload.model_rebuild()


class InteractiveUserMessage(FastGPTModel):
    role: Literal["user"] = "user"
    content: str


_NESTED_WRAPPER_TYPES = frozenset(
    {
        "childrenInteractive",
        "toolChildrenInteractive",
        "loopInteractive",
        "loopRunInteractive",
    }
)


def _to_plain_dict(val: Any) -> dict[str, Any] | None:
    if isinstance(val, BaseModel):
        dumped = val.model_dump(mode="python", by_alias=True, exclude_none=True)
        return dumped if isinstance(dumped, dict) else None
    if isinstance(val, Mapping):
        return dict(val)
    return None


def _is_user_select_option_dict(val: Any) -> bool:
    return (
        isinstance(val, Mapping)
        and isinstance(val.get("key"), str)
        and isinstance(val.get("value"), str)
    )


def _parse_interactive_payload(val: Any, max_depth: int = 12) -> InteractivePayload | None:
    if max_depth < 0:
        return None
    raw_dict = _to_plain_dict(val)
    if raw_dict is None:
        return None
    raw_type = raw_dict.get("type")
    if not isinstance(raw_type, str) or len(raw_type) == 0:
        return None

    raw_params = _to_plain_dict(raw_dict.get("params"))

    if raw_type == "userSelect" and raw_params is not None:
        raw_opts = raw_params.get("userSelectOptions")
        if raw_opts is None:
            raw_opts = raw_params.get("user_select_options")
        if isinstance(raw_opts, list) and all(_is_user_select_option_dict(o) for o in raw_opts):
            desc = raw_params.get("description")
            selected = raw_params.get("userSelectedVal")
            if selected is None:
                selected = raw_params.get("user_selected_val")
            return UserSelectInteractivePayload(
                type="userSelect",
                params=UserSelectInteractiveParams(
                    description=desc if isinstance(desc, str) else None,
                    user_select_options=[
                        UserSelectInteractiveOption(key=str(o["key"]), value=str(o["value"]))
                        for o in raw_opts
                    ],
                    user_selected_val=selected if isinstance(selected, str) else None,
                ),
            )

    if raw_type == "userInput" and raw_params is not None:
        raw_form = raw_params.get("inputForm")
        if raw_form is None:
            raw_form = raw_params.get("input_form")
        if isinstance(raw_form, list) and all(isinstance(item, Mapping) for item in raw_form):
            desc = raw_params.get("description")
            submitted = raw_params.get("submitted")
            return UserInputInteractivePayload(
                type="userInput",
                params=UserInputInteractiveParams(
                    description=desc if isinstance(desc, str) else None,
                    input_form=[dict(item) for item in raw_form],
                    submitted=submitted if isinstance(submitted, bool) else None,
                ),
            )

    if raw_type == "paymentPause" and raw_params is not None:
        desc = raw_params.get("description")
        cont = raw_params.get("continue")
        if cont is None:
            cont = raw_params.get("continue_")
        return PaymentPauseInteractivePayload(
            type="paymentPause",
            params=PaymentPauseInteractiveParams(
                description=desc if isinstance(desc, str) else None,
                continue_=cont if isinstance(cont, bool) else None,
            ),
        )

    if raw_type in _NESTED_WRAPPER_TYPES and raw_params is not None:
        child_raw = raw_params.get("childrenResponse")
        if child_raw is None:
            child_raw = raw_params.get("children_response")
        nested_child = _parse_interactive_payload(child_raw, max_depth - 1)
        if nested_child is not None:
            extra_params = {
                k: v
                for k, v in raw_params.items()
                if k not in ("childrenResponse", "children_response")
            }
            return NestedInteractivePayload(
                type=raw_type,  # type: ignore[arg-type]
                params=NestedInteractiveParams(
                    children_response=nested_child,
                    **extra_params,
                ),
            )

    if raw_type == "unknown":
        orig_type = raw_dict.get("rawType") or raw_dict.get("raw_type")
        orig_raw = _to_plain_dict(raw_dict.get("raw"))
        if isinstance(orig_type, str) and orig_raw is not None:
            return UnknownInteractivePayload(
                raw_type=orig_type,
                params=raw_params,
                raw=orig_raw,
            )

    return UnknownInteractivePayload(
        raw_type=raw_type,
        params=raw_params,
        raw=raw_dict,
    )


def is_user_select_interactive(
    payload: InteractivePayload | None,
) -> TypeGuard[UserSelectInteractivePayload]:
    """判断交互负载是否为经过校验的 ``userSelect`` 节点。"""
    return isinstance(payload, UserSelectInteractivePayload)


def is_user_input_interactive(
    payload: InteractivePayload | None,
) -> TypeGuard[UserInputInteractivePayload]:
    """判断交互负载是否为经过校验的 ``userInput`` 表单节点。"""
    return isinstance(payload, UserInputInteractivePayload)


def is_payment_pause_interactive(
    payload: InteractivePayload | None,
) -> TypeGuard[PaymentPauseInteractivePayload]:
    """判断交互负载是否为 ``paymentPause`` 节点。"""
    return isinstance(payload, PaymentPauseInteractivePayload)


def unwrap_interactive(
    interactive: InteractivePayload,
    max_depth: int = 10,
) -> InteractivePayload:
    """递归展开嵌套子工作流 / 循环节点包装，定位最内层需要用户处理的交互节点。"""
    current: InteractivePayload = interactive
    depth = 0
    while depth < max_depth and isinstance(current, NestedInteractivePayload):
        current = current.params.children_response
        depth += 1
    return current


def extract_interactive(result: Any) -> InteractivePayload | None:
    """从非流式 completions_v2 响应、流式 final_result() 或原始字典中提取挂起交互。"""
    result_dict = _to_plain_dict(result)
    if result_dict is None:
        return None

    top_interactive = _parse_interactive_payload(result_dict.get("interactive"))
    if top_interactive is not None:
        return top_interactive

    direct_interactive = _parse_interactive_payload(result_dict)
    if direct_interactive is not None:
        return direct_interactive

    choices = result_dict.get("choices")
    if isinstance(choices, list) and len(choices) > 0:
        first_choice = choices[0]
        if isinstance(first_choice, Mapping):
            message = first_choice.get("message")
            if isinstance(message, Mapping):
                content = message.get("content")
                if isinstance(content, list):
                    for item in content:
                        if isinstance(item, Mapping):
                            item_interactive = _parse_interactive_payload(item.get("interactive"))
                            if item_interactive is not None:
                                return item_interactive
    return None


def is_interactive_pending(result: Any) -> bool:
    """判断一次对话响应或流式汇总结果是否处于工作流交互挂起状态。"""
    return extract_interactive(result) is not None


def build_user_select_message(selected_value: str) -> InteractiveUserMessage:
    """构造符合 FastGPT ``dispatchUserSelect`` 协议的选项回复消息。"""
    return InteractiveUserMessage(role="user", content=selected_value)


def build_user_form_message(values: Mapping[str, Any]) -> InteractiveUserMessage:
    """构造符合 FastGPT ``dispatchFormInput`` 协议的表单提交消息。"""
    return InteractiveUserMessage(
        role="user",
        content=json.dumps(dict(values), ensure_ascii=False, separators=(",", ":")),
    )


class _InteractiveHelperMixin:
    def is_pending(self, result: Any) -> bool:
        """判断对话结果是否命中交互挂起。"""
        return is_interactive_pending(result)

    def extract(self, result: Any) -> InteractivePayload | None:
        """从非流式或流式聚合结果中提取交互挂起配置。"""
        return extract_interactive(result)

    def unwrap(self, interactive: InteractivePayload) -> InteractivePayload:
        """递归展开嵌套子流程交互包装，定位最内层待用户处理的交互节点。"""
        return unwrap_interactive(interactive)

    def build_user_select_message(self, selected_value: str) -> InteractiveUserMessage:
        """构造 ``userSelect`` 节点恢复消息。"""
        return build_user_select_message(selected_value)

    def build_user_form_message(self, values: Mapping[str, Any]) -> InteractiveUserMessage:
        """构造 ``userInput`` 表单节点恢复消息。"""
        return build_user_form_message(values)


class ChatInteractiveHelper(_InteractiveHelperMixin):
    """挂载在同步 ``client.chat.interactive`` 上的工作流交互恢复助手。"""

    def __init__(self, chat_resource: ChatResource) -> None:
        self._chat = chat_resource

    def reply_user_select(
        self,
        *,
        chat_id: str,
        value: str,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> ChatCompletionsV2Res:
        """以非流式方式提交 ``userSelect`` 选项并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_select_message(value).model_dump()],
        }
        return self._chat.completions_v2(payload, request_options=request_options)

    def reply_user_select_stream(
        self,
        *,
        chat_id: str,
        value: str,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> ChatStream:
        """以流式 SSE 方式提交 ``userSelect`` 选项并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_select_message(value).model_dump()],
        }
        return self._chat.completions_v2_stream(payload, request_options=request_options)

    def reply_user_form(
        self,
        *,
        chat_id: str,
        values: Mapping[str, Any],
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> ChatCompletionsV2Res:
        """以非流式方式提交 ``userInput`` 表单并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_form_message(values).model_dump()],
        }
        return self._chat.completions_v2(payload, request_options=request_options)

    def reply_user_form_stream(
        self,
        *,
        chat_id: str,
        values: Mapping[str, Any],
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> ChatStream:
        """以流式 SSE 方式提交 ``userInput`` 表单并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_form_message(values).model_dump()],
        }
        return self._chat.completions_v2_stream(payload, request_options=request_options)


class AsyncChatInteractiveHelper(_InteractiveHelperMixin):
    """挂载在异步 ``async_client.chat.interactive`` 上的工作流交互恢复助手。"""

    def __init__(self, chat_resource: AsyncChatResource) -> None:
        self._chat = chat_resource

    async def reply_user_select(
        self,
        *,
        chat_id: str,
        value: str,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> ChatCompletionsV2Res:
        """以异步非流式方式提交 ``userSelect`` 选项并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_select_message(value).model_dump()],
        }
        return await self._chat.completions_v2(payload, request_options=request_options)

    async def reply_user_select_stream(
        self,
        *,
        chat_id: str,
        value: str,
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncChatStream:
        """以异步流式 SSE 方式提交 ``userSelect`` 选项并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_select_message(value).model_dump()],
        }
        return await self._chat.completions_v2_stream(payload, request_options=request_options)

    async def reply_user_form(
        self,
        *,
        chat_id: str,
        values: Mapping[str, Any],
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> ChatCompletionsV2Res:
        """以异步非流式方式提交 ``userInput`` 表单并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_form_message(values).model_dump()],
        }
        return await self._chat.completions_v2(payload, request_options=request_options)

    async def reply_user_form_stream(
        self,
        *,
        chat_id: str,
        values: Mapping[str, Any],
        request_options: RequestOptions | None = None,
        **kwargs: Any,
    ) -> AsyncChatStream:
        """以异步流式 SSE 方式提交 ``userInput`` 表单并恢复工作流执行。"""
        payload = {
            **kwargs,
            "chat_id": chat_id,
            "messages": [build_user_form_message(values).model_dump()],
        }
        return await self._chat.completions_v2_stream(payload, request_options=request_options)
