"""生成模型别名、资源方法树、raw response、multipart 上传与二进制响应测试。"""

from __future__ import annotations

import io
import warnings
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from pydantic import TypeAdapter, ValidationError

from fastgpt_sdk import (
    APIResponse,
    AsyncFastGPT,
    AuthProxyIdentity,
    FastGPT,
    FastGPTBadRequestError,
    FastGPTIdentity,
)
from fastgpt_sdk.generated.models import (
    AppsLogsGetTotalDataRes,
    AppsLogsSearchReq,
    AppsLogsSearchReqCursor,
    DatasetsCollectionsCreateByLocalFileReq,
    DatasetsCollectionsCreateByLocalFileRes,
    DatasetsCollectionsDeleteReq,
    DatasetsListRes,
    DatasetsSearchReq,
    ModelsCatalogRes,
)


def _json_response(body: Any, *, status_code: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        headers={"content-type": "application/json", "x-fastgpt-request-id": "req-res-1"},
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


def test_bidirectional_aliases_and_strict_union_validation() -> None:
    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("error", UserWarning)

        req = AppsLogsSearchReq(
            app_id="app-1",
            date_start="2026-01-01T00:00:00.000Z",
            date_end="2026-01-31T23:59:59.999Z",
            cursor=AppsLogsSearchReqCursor(timestamp=1700000000000, id="log-9"),
        )
        wire = req.model_dump(by_alias=True, exclude_none=True, mode="json")
        assert wire == {
            "appId": "app-1",
            "dateStart": "2026-01-01T00:00:00.000Z",
            "dateEnd": "2026-01-31T23:59:59.999Z",
            "cursor": {"timestamp": 1700000000000, "id": "log-9"},
        }

        from_camel = AppsLogsSearchReq.model_validate(wire)
        assert from_camel.app_id == "app-1"
        assert from_camel.cursor is not None
        assert from_camel.cursor.timestamp == 1700000000000

        catalog = ModelsCatalogRes.model_validate(
            {
                "version": "v2",
                "data": {
                    "models": [],
                    "providers": [],
                    "defaultModelIds": {"llm": "gpt-4o"},
                },
            }
        )
        assert catalog.version == "v2"
        assert catalog.data is not None
        assert catalog.data.default_model_ids.llm == "gpt-4o"

        ds_page = DatasetsListRes.model_validate(
            {
                "total": 1,
                "list": [
                    {
                        "_id": "ds-1",
                        "tmbId": "tmb-1",
                        "avatar": "/ds.png",
                        "createTime": "2026-01-01T00:00:00.000Z",
                        "updateTime": "2026-01-02T00:00:00.000Z",
                        "name": "Knowledge Base",
                        "intro": "Docs",
                        "type": "dataset",
                        "permission": _sample_permission(),
                        "inheritPermission": True,
                    }
                ],
            }
        )
        assert ds_page.list[0].id_ == "ds-1"
        assert ds_page.list[0].tmb_id == "tmb-1"

        with pytest.raises(ValidationError):
            DatasetsListRes.model_validate({"total": 0})

    assert recorded == []

    # never 互斥约束：禁止同时传 id 与 collectionIds
    delete_adapter: TypeAdapter[DatasetsCollectionsDeleteReq] = TypeAdapter(
        DatasetsCollectionsDeleteReq
    )
    ok_single = delete_adapter.validate_python({"id": "col-1"})
    assert ok_single.id == "col-1"

    with pytest.raises(ValidationError):
        delete_adapter.validate_python({"id": "col-1", "collection_ids": ["col-2"]})


def test_resource_tree_envelope_raw_response_void_multipart_and_binary() -> None:
    calls: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        calls.append(
            {
                "method": request.method,
                "path": path,
                "query": parse_qs(urlparse(str(request.url)).query),
                "content_type": request.headers.get("content-type", ""),
                "body": request.content,
            }
        )

        if path == "/api/proApi/core/app/logs/getTotalData":
            return _json_response(
                {
                    "code": 200,
                    "data": {
                        "totalUsers": 12,
                        "totalChats": 34,
                        "totalPoints": 5.5,
                        "totalInputTokens": 1000,
                        "totalOutputTokens": 450,
                    },
                }
            )
        if path == "/api/core/dataset/collection/create/localFile":
            return _json_response(
                {
                    "code": 200,
                    "data": {
                        "collectionId": "col-uploaded-1",
                        "results": {"insertLen": 3},
                    },
                }
            )
        if path == "/api/core/dataset/collection/batchDownload":
            return httpx.Response(
                status_code=200,
                headers={
                    "content-type": "application/zip",
                    "x-fastgpt-request-id": "req-bin-1",
                },
                content=b"PK\x03\x04mock-zip",
            )
        if path == "/api/core/dataset/delete":
            return _json_response({"code": 200, "data": None})
        if path == "/api/v2/chat/completions":
            return _json_response(
                {
                    "id": "c-widened",
                    "model": "",
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 1},
                    "choices": [
                        {
                            "message": {"role": "assistant", "content": "pong"},
                            "finish_reason": "stop",
                            "index": 0,
                        }
                    ],
                }
            )
        raise AssertionError(f"Unexpected path: {path}")

    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        default_app_id="app-1",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    ) as client:
        # 确认不暴露未授权的非 OpenAPI / 兜底资源
        assert not hasattr(client, "system")
        assert not hasattr(client, "raw_request")
        assert hasattr(client.apps, "logs")
        assert hasattr(client.chat, "histories")
        assert hasattr(client.chat, "records")
        assert hasattr(client.chat, "feedbacks")
        assert hasattr(client.chat, "interactive")
        assert hasattr(client.datasets, "collections")
        assert hasattr(client.datasets, "data")
        assert hasattr(client, "models")

        # with_raw_response envelope
        raw_total: APIResponse[AppsLogsGetTotalDataRes] = (
            client.with_raw_response.apps.logs.get_total_data()
        )
        assert raw_total.status_code == 200
        assert raw_total.request_id == "req-res-1"
        parsed_total = raw_total.parse()
        assert parsed_total.total_users == 12
        assert parsed_total.total_output_tokens == 450
        assert calls[0]["query"] == {"appId": ["app-1"]}

        # multipart upload
        upload_res: DatasetsCollectionsCreateByLocalFileRes = (
            client.datasets.collections.create_by_local_file(
                file=("notes.txt", b"hello fastgpt", "text/plain"),
                dataset_id="ds-1",
                training_type="chunk",
            )
        )
        assert upload_res.collection_id == "col-uploaded-1"
        assert upload_res.results.insert_len == 3
        upload_ct = calls[1]["content_type"]
        upload_body = calls[1]["body"].decode("utf-8", errors="replace")
        assert "multipart/form-data" in upload_ct
        assert 'filename="notes.txt"' in upload_body
        assert "hello fastgpt" in upload_body
        assert 'name="data"' in upload_body
        assert '"datasetId":"ds-1"' in upload_body or '"datasetId": "ds-1"' in upload_body

        # binary download
        raw_zip = client.with_raw_response.datasets.collections.batch_download(ticket="tick-99")
        assert raw_zip.request_id == "req-bin-1"
        assert raw_zip.parse() == b"PK\x03\x04mock-zip"
        assert client.datasets.collections.batch_download(ticket="tick-99") == b"PK\x03\x04mock-zip"

        # 放宽后的 dict/Sequence kwargs 入参（无 pydantic mypy 插件下直接通过 strict 检查）
        comp_res = client.chat.completions_v2(
            chat_id="c-widened",
            messages=[{"role": "user", "content": "hi"}],
        )
        assert comp_res.choices[0].message.content == "pong"

        # void endpoint
        client.datasets.delete(id="ds-1")
        assert calls[-1]["method"] == "DELETE"
        assert calls[-1]["query"] == {"id": ["ds-1"]}
        raw_sync_del = client.with_raw_response.datasets.delete(id="ds-1")
        assert raw_sync_del.status_code == 200
        assert raw_sync_del.parse() is None


async def test_async_resources_multipart_binary_and_void() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/core/dataset/collection/create/localFile":
            return _json_response(
                {
                    "code": 200,
                    "data": {"collectionId": "col-async-1", "results": {"insertLen": 1}},
                }
            )
        if request.url.path == "/api/core/dataset/collection/batchDownload":
            return httpx.Response(status_code=200, content=b"ZIPDATA")
        if request.url.path == "/api/core/dataset/delete":
            return _json_response({"code": 200, "data": None})
        return _json_response({"code": 200, "data": {"models": [], "providers": []}})

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ) as client:
        res = await client.datasets.collections.create_by_local_file(
            file=b"raw-bytes",
            dataset_id="ds-async",
        )
        assert res.collection_id == "col-async-1"

        raw_bin = await client.with_raw_response.datasets.collections.batch_download(
            ticket="t-async"
        )
        assert raw_bin.parse() == b"ZIPDATA"

        models_res = await client.models.list()
        assert models_res.models == []

        await client.datasets.delete(id="ds-async")
        raw_del = await client.with_raw_response.datasets.delete(id="ds-async")
        assert raw_del.status_code == 200
        assert raw_del.parse() is None


def test_dual_alias_conflict_rejection_and_equal_dedup() -> None:
    with pytest.raises(ValidationError):
        DatasetsCollectionsCreateByLocalFileReq.model_validate(
            {"dataset_id": "ds-A", "datasetId": "ds-B", "file": b"hello"}
        )

    # bool 与 int (True vs 1) 也必须视为冲突，防止 alias 静默吞并
    with pytest.raises(ValidationError):
        DatasetsCollectionsCreateByLocalFileReq.model_validate(
            {
                "dataset_id": "ds-A",
                "data_enhance_collection_name": True,
                "dataEnhanceCollectionName": 1,
                "file": b"hello",
            }
        )

    # 嵌套子模型（如 datasets.search 的 scope）同样拒绝冲突双别名
    with pytest.raises(ValidationError):
        DatasetsSearchReq.model_validate(
            {
                "scope": {"dataset_ids": ["ds-A"], "datasetIds": ["ds-B"]},
                "query": {"text": "hello"},
            }
        )

    with pytest.raises(ValidationError):
        AuthProxyIdentity.model_validate({"tmb_id": "t-1", "tmbId": "t-2"})
    with pytest.raises(ValidationError):
        FastGPTIdentity.model_validate({"custom_uid": "u-1", "customUid": "u-2"})

    # 相同双别名应归一化消除重复键，绝不残留在 model_extra 中
    deduped = DatasetsCollectionsCreateByLocalFileReq.model_validate(
        {"dataset_id": "ds-A", "datasetId": "ds-A", "file": b"hello"}
    )
    assert deduped.dataset_id == "ds-A"
    assert not deduped.model_extra
    assert deduped.model_dump(mode="python", by_alias=True, exclude_unset=True) == {
        "file": b"hello",
        "datasetId": "ds-A",
    }

    sent: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(request)
        return _json_response(
            {"code": 200, "data": {"collectionId": "c1", "results": {"insertLen": 1}}}
        )

    with FastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    ) as client:
        with pytest.raises(FastGPTBadRequestError):
            client.datasets.collections.create_by_local_file(
                {"dataset_id": "ds-A", "datasetId": "ds-B", "file": b"x"}
            )
        assert sent == []


async def test_file_handle_bytesio_path_bytearray_and_text_stream_rejection(
    tmp_path: Path,
) -> None:
    captured_bodies: list[str] = []

    def sync_handler(request: httpx.Request) -> httpx.Response:
        captured_bodies.append(request.content.decode("utf-8", errors="replace"))
        return _json_response(
            {"code": 200, "data": {"collectionId": "col-fh-1", "results": {"insertLen": 1}}}
        )

    sample_file = tmp_path / "doc.txt"
    sample_file.write_bytes(b"real-file-bytes")

    with warnings.catch_warnings(record=True) as recorded:
        warnings.simplefilter("error", UserWarning)

        with FastGPT(
            base_url="https://api.example.com",
            api_key="fastgpt-key",
            http_client=httpx.Client(transport=httpx.MockTransport(sync_handler)),
        ) as client:
            # 1. 直接传入 open(..., "rb") 真实文件句柄
            with sample_file.open("rb") as fp:
                res1 = client.datasets.collections.create_by_local_file(file=fp, dataset_id="ds-1")
                assert res1.collection_id == "col-fh-1"

            # 2. 传入带文件名的 BytesIO 元组
            res2 = client.datasets.collections.create_by_local_file(
                file=("stream.txt", io.BytesIO(b"stream-hello"), "text/plain"),
                dataset_id="ds-1",
            )
            assert res2.collection_id == "col-fh-1"

            # 3. 传入 Path 与 bytearray，以及命名 BytesIO 模型直传
            client.datasets.collections.create_by_local_file(
                DatasetsCollectionsCreateByLocalFileReq(
                    file=("direct.bin", io.BytesIO(b"direct-io")),
                    dataset_id="ds-1",
                )
            )
            client.datasets.collections.create_by_local_file(file=sample_file, dataset_id="ds-1")
            client.datasets.collections.create_by_local_file(
                file=bytearray(b"bytearray-payload"),
                dataset_id="ds-1",
            )

            # 4. 文本流（StringIO 与 open(..., "r")）必须在发请求前被统一拦截
            with pytest.raises(FastGPTBadRequestError):
                client.datasets.collections.create_by_local_file(
                    file=io.StringIO("plain-text"),  # type: ignore[arg-type]
                    dataset_id="ds-1",
                )
            with sample_file.open("r", encoding="utf-8") as text_fp, pytest.raises(
                FastGPTBadRequestError
            ):
                client.datasets.collections.create_by_local_file(
                    file=("bad.txt", text_fp),  # type: ignore[arg-type]
                    dataset_id="ds-1",
                )

    assert recorded == []
    assert len(captured_bodies) == 5
    assert 'filename="doc.txt"' in captured_bodies[0]
    assert "real-file-bytes" in captured_bodies[0]
    assert 'filename="stream.txt"' in captured_bodies[1]
    assert "stream-hello" in captured_bodies[1]
    assert 'filename="direct.bin"' in captured_bodies[2]
    assert "direct-io" in captured_bodies[2]
    assert 'filename="doc.txt"' in captured_bodies[3]
    assert "bytearray-payload" in captured_bodies[4]

    async def async_handler(request: httpx.Request) -> httpx.Response:
        captured_bodies.append(request.content.decode("utf-8", errors="replace"))
        return _json_response(
            {"code": 200, "data": {"collectionId": "col-async-fh", "results": {"insertLen": 1}}}
        )

    async with AsyncFastGPT(
        base_url="https://api.example.com",
        api_key="fastgpt-key",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(async_handler)),
    ) as async_client:
        with sample_file.open("rb") as fp:
            async_res = await async_client.datasets.collections.create_by_local_file(
                file=("async-doc.txt", fp, "text/plain"),
                dataset_id="ds-async",
            )
            assert async_res.collection_id == "col-async-fh"

    assert 'filename="async-doc.txt"' in captured_bodies[-1]
    assert "real-file-bytes" in captured_bodies[-1]
