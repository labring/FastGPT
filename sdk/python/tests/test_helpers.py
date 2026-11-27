"""工作流交互恢复助手与 offset/pageNum/cursor 自动分页同步/异步测试。"""

from __future__ import annotations

import json
from typing import Any

import httpx

from fastgpt_sdk import AsyncFastGPT, FastGPT
from fastgpt_sdk.generated.models import ChatCompletionsV2Res
from fastgpt_sdk.interactive import (
    NestedInteractivePayload,
    PaymentPauseInteractivePayload,
    UserInputInteractivePayload,
    UserSelectInteractivePayload,
    extract_interactive,
    is_interactive_pending,
    is_payment_pause_interactive,
    is_user_input_interactive,
    is_user_select_interactive,
    unwrap_interactive,
)
from fastgpt_sdk.pagination import (
    PageSlice,
    create_async_page_num_paginator,
    create_page_num_paginator,
)
from fastgpt_sdk.sse import ChatStreamFinalResult


def _json_response(body: Any) -> httpx.Response:
    return httpx.Response(
        status_code=200,
        headers={"content-type": "application/json"},
        json=body,
    )


def _sample_permission() -> dict[str, Any]:
    return {
        "role": 7,
        "isOwner": True,
        "hasManagePer": True,
        "hasWritePer": True,
        "hasReadPer": True,
        "hasManageRole": True,
        "hasWriteRole": True,
        "hasReadRole": True,
    }


def _dataset_item(idx: int) -> dict[str, Any]:
    return {
        "_id": f"ds-{idx}",
        "tmbId": "tmb-1",
        "avatar": "/ds.png",
        "createTime": "2026-01-01T00:00:00.000Z",
        "updateTime": "2026-01-01T00:00:00.000Z",
        "name": f"Dataset {idx}",
        "intro": "intro",
        "type": "dataset",
        "permission": _sample_permission(),
        "inheritPermission": True,
    }


def _completion_res(content: Any) -> dict[str, Any]:
    return {
        "id": "chat-inter-1",
        "model": "",
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 1},
        "choices": [
            {
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
                "index": 0,
            }
        ],
    }


def test_interactive_extract_unwrap_and_typeguards() -> None:
    assert not is_interactive_pending(None)
    assert not is_interactive_pending(ChatCompletionsV2Res.model_validate(_completion_res("hello")))

    nested_raw = {
        "type": "childrenInteractive",
        "params": {
            "childrenResponse": {
                "type": "userSelect",
                "params": {
                    "description": "Choose mode",
                    "userSelectOptions": [
                        {"key": "fast", "value": "Fast Mode"},
                        {"key": "deep", "value": "Deep Mode"},
                    ],
                },
            }
        },
    }

    res = ChatCompletionsV2Res.model_validate(_completion_res([{"interactive": nested_raw}]))
    assert is_interactive_pending(res)
    outer = extract_interactive(res)
    assert isinstance(outer, NestedInteractivePayload)
    inner = unwrap_interactive(outer)
    assert is_user_select_interactive(inner)
    assert isinstance(inner, UserSelectInteractivePayload)
    assert [opt.key for opt in inner.params.user_select_options] == ["fast", "deep"]

    stream_snap = ChatStreamFinalResult(
        interactive={
            "type": "userInput",
            "params": {
                "description": "Fill details",
                "inputForm": [{"type": "input", "key": "city", "label": "City", "required": True}],
            },
        }
    )
    form_payload = extract_interactive(stream_snap)
    assert is_user_input_interactive(form_payload)
    assert isinstance(form_payload, UserInputInteractivePayload)
    assert form_payload.params.input_form[0]["key"] == "city"

    pay_payload = extract_interactive(
        {"type": "paymentPause", "params": {"description": "Out of credits", "continue": False}}
    )
    assert is_payment_pause_interactive(pay_payload)
    assert isinstance(pay_payload, PaymentPauseInteractivePayload)
    assert pay_payload.params.continue_ is False


def test_sync_interactive_reply_and_all_auto_paginators() -> None:
    sent_bodies: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else {}
        sent_bodies.append({"path": request.url.path, "body": body})

        if request.url.path == "/api/v2/chat/completions":
            return _json_response(_completion_res("Resumed!"))

        if request.url.path == "/api/core/dataset/listV2":
            offset = int(body.get("offset", 0))
            page_size = int(body.get("pageSize", 20))
            all_items = [_dataset_item(i) for i in range(5)]
            chunk = all_items[offset : offset + page_size]
            return _json_response({"code": 200, "data": {"total": 5, "list": chunk}})

        if request.url.path == "/api/core/app/logs/getUsers":
            offset = int(body.get("offset", 0))
            page_size = int(body.get("pageSize", 20))
            users = [
                {"outLinkUid": f"u-{i}", "tmbId": "t1", "name": f"User {i}", "count": 1}
                for i in range(3)
            ]
            return _json_response(
                {"code": 200, "data": {"total": 3, "list": users[offset : offset + page_size]}}
            )

        if request.url.path == "/api/core/app/logs/search":
            cursor = body.get("cursor")
            if cursor is None:
                return _json_response(
                    {
                        "code": 200,
                        "data": {
                            "list": [
                                {
                                    "_id": "log-1",
                                    "chatId": "c1",
                                    "source": "api",
                                    "updateTime": "2026-01-01T00:00:00.000Z",
                                }
                            ],
                            "nextCursor": {"timestamp": 1700000001000, "id": "log-1"},
                        },
                    }
                )
            return _json_response(
                {
                    "code": 200,
                    "data": {
                        "list": [
                            {
                                "_id": "log-2",
                                "chatId": "c2",
                                "source": "api",
                                "updateTime": "2026-01-01T00:00:01.000Z",
                            }
                        ],
                        "nextCursor": None,
                    },
                }
            )

        raise AssertionError(f"Unexpected path: {request.url.path}")

    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        default_app_id="app-1",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    ) as client:
        sel_res = client.chat.interactive.reply_user_select(chat_id="c1", value="fast")
        assert sel_res.choices[0].message.content == "Resumed!"
        assert sent_bodies[-1]["body"]["messages"] == [{"role": "user", "content": "fast"}]

        client.chat.interactive.reply_user_form(chat_id="c1", values={"city": "Hangzhou", "n": 2})
        assert sent_bodies[-1]["body"]["messages"] == [
            {"role": "user", "content": '{"city":"Hangzhou","n":2}'}
        ]

        # Offset paginator across 3 pages (2 + 2 + 1), and max_items truncation
        ds_items = client.datasets.list_auto_paging(page_size=2).to_list()
        assert [item.id_ for item in ds_items] == ["ds-0", "ds-1", "ds-2", "ds-3", "ds-4"]

        ds_capped = client.datasets.list_auto_paging(page_size=2, max_items=3).to_list()
        assert len(ds_capped) == 3

        # PageNum paginator
        user_pages = list(
            client.apps.logs.list_users_auto_paging(
                date_start="2026-01-01T00:00:00.000Z",
                date_end="2026-01-02T00:00:00.000Z",
                page_size=2,
            ).pages()
        )
        assert [len(page) for page in user_pages] == [2, 1]

        # Cursor paginator
        log_items = client.apps.logs.search_auto_paging(
            date_start="2026-01-01T00:00:00.000Z",
            date_end="2026-01-02T00:00:00.000Z",
        ).to_list()
        assert [item.chat_id for item in log_items] == ["c1", "c2"]


async def test_async_interactive_and_auto_paginators() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else {}
        if request.url.path == "/api/v2/chat/completions":
            return _json_response(_completion_res("Async resumed"))
        if request.url.path == "/api/core/dataset/listV2":
            offset = int(body.get("offset", 0))
            items = [_dataset_item(i) for i in range(2)]
            return _json_response({"code": 200, "data": {"total": 2, "list": items[offset:]}})
        if request.url.path == "/api/core/app/logs/getUsers":
            offset = int(body.get("offset", 0))
            items = (
                [{"outLinkUid": "u-1", "tmbId": "t1", "name": "Alice", "count": 2}]
                if offset == 0
                else []
            )
            return _json_response({"code": 200, "data": {"total": 1, "list": items}})
        if request.url.path == "/api/core/app/logs/search":
            return _json_response(
                {
                    "code": 200,
                    "data": {
                        "list": [
                            {
                                "_id": "alog-1",
                                "chatId": "ac-1",
                                "source": "api",
                                "updateTime": "2026-01-01T00:00:00.000Z",
                            }
                        ],
                        "nextCursor": None,
                    },
                }
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        default_app_id="app-1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        res = await client.chat.interactive.reply_user_select(chat_id="ac", value="deep")
        assert res.choices[0].message.content == "Async resumed"

        datasets = await client.datasets.list_auto_paging(page_size=2).to_list()
        assert [d.id_ for d in datasets] == ["ds-0", "ds-1"]

        users = await client.apps.logs.list_users_auto_paging(
            date_start="2026-01-01T00:00:00.000Z",
            date_end="2026-01-02T00:00:00.000Z",
            page_size=2,
        ).to_list()
        assert [u.name for u in users] == ["Alice"]

        logs = await client.apps.logs.search_auto_paging(
            date_start="2026-01-01T00:00:00.000Z",
            date_end="2026-01-02T00:00:00.000Z",
        ).to_list()
        assert [entry.chat_id for entry in logs] == ["ac-1"]


def test_sync_and_async_page_num_paginators() -> None:
    seen_pages: list[tuple[int, int]] = []
    dataset = [f"item-{i}" for i in range(5)]

    def fetch_sync(page_num: int, page_size: int) -> PageSlice[str]:
        seen_pages.append((page_num, page_size))
        start = (page_num - 1) * page_size
        return PageSlice(total=5, list=dataset[start : start + page_size])

    collected = create_page_num_paginator(fetch_page=fetch_sync, page_size=2).to_list()
    assert collected == dataset
    assert seen_pages == [(1, 2), (2, 2), (3, 2)]

    capped_items = create_page_num_paginator(
        fetch_page=fetch_sync,
        page_size=2,
        max_items=3,
    ).to_list()
    assert capped_items == ["item-0", "item-1", "item-2"]

    capped_pages = list(
        create_page_num_paginator(fetch_page=fetch_sync, page_size=2, max_pages=1).pages()
    )
    assert capped_pages == [["item-0", "item-1"]]


async def test_async_page_num_paginator() -> None:
    seen_pages: list[tuple[int, int]] = []
    dataset = [f"async-{i}" for i in range(3)]

    async def fetch_async(page_num: int, page_size: int) -> PageSlice[str]:
        seen_pages.append((page_num, page_size))
        start = (page_num - 1) * page_size
        return PageSlice(total=3, list=dataset[start : start + page_size])

    collected = await create_async_page_num_paginator(
        fetch_page=fetch_async,
        page_size=2,
    ).to_list()
    assert collected == dataset
    assert seen_pages == [(1, 2), (2, 2)]

    capped = await create_async_page_num_paginator(
        fetch_page=fetch_async,
        page_size=2,
        max_pages=1,
    ).to_list()
    assert capped == ["async-0", "async-1"]
