"""可选真实 FastGPT 服务冒烟测试（默认跳过，设置环境变量后运行）。"""

from __future__ import annotations

import os

import pytest

from fastgpt_sdk import AsyncFastGPT, FastGPT

_SMOKE_BASE_URL = os.environ.get("FASTGPT_SMOKE_BASE_URL", "").strip()
_SMOKE_API_KEY = os.environ.get("FASTGPT_SMOKE_API_KEY", "").strip()
_SMOKE_APP_ID = os.environ.get("FASTGPT_SMOKE_APP_ID", "").strip() or None

_SKIP_SMOKE = not (_SMOKE_BASE_URL and _SMOKE_API_KEY)


@pytest.mark.skipif(
    _SKIP_SMOKE,
    reason="Set FASTGPT_SMOKE_BASE_URL and FASTGPT_SMOKE_API_KEY to run live smoke tests",
)
def test_live_sync_smoke() -> None:
    with FastGPT(
        base_url=_SMOKE_BASE_URL,
        api_key=_SMOKE_API_KEY,
        default_app_id=_SMOKE_APP_ID,
    ) as client:
        models_res = client.models.list()
        assert isinstance(models_res.models, list)

        catalog_res = client.models.catalog()
        assert catalog_res.version

        if _SMOKE_APP_ID is not None:
            histories = client.chat.histories.list_auto_paging(max_pages=1).to_list()
            assert isinstance(histories, list)


@pytest.mark.skipif(
    _SKIP_SMOKE,
    reason="Set FASTGPT_SMOKE_BASE_URL and FASTGPT_SMOKE_API_KEY to run live smoke tests",
)
async def test_live_async_smoke() -> None:
    async with AsyncFastGPT(
        base_url=_SMOKE_BASE_URL,
        api_key=_SMOKE_API_KEY,
        default_app_id=_SMOKE_APP_ID,
    ) as client:
        catalog_res = await client.models.catalog()
        assert catalog_res.version

        if _SMOKE_APP_ID is not None:
            async with await client.chat.completions_v2_stream(
                messages=[{"role": "user", "content": "Say ok."}],
            ) as stream:
                text = await stream.final_text()
                assert isinstance(text, str)
