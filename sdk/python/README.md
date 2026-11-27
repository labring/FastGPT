# `fastgpt-sdk`

Official Python SDK (`import fastgpt_sdk`) for FastGPT System OpenAPI, built on `httpx` and Pydantic v2 with both synchronous (`FastGPT`) and asynchronous (`AsyncFastGPT`) clients.

- **Sync & Async dual clients** — `FastGPT` and `AsyncFastGPT` share identical Pydantic v2 models, method trees (`apps.logs`, `chat`, `datasets`, `models`), SSE streaming, interactive workflow continuation, and auto-pagination.
- **Idiomatic `snake_case` + bidirectional aliases** — pass Pythonic keyword arguments, Pydantic models from `fastgpt_sdk.generated.models`, or raw dicts (either `snake_case` or OpenAPI `camelCase`).
- **47 System OpenAPI operations** — deterministically generated from FastGPT's System OpenAPI IR alongside `@fastgpt/sdk` (TypeScript) to guarantee zero contract drift.

---

## Installation

Requires **Python >= 3.10**.

```bash
pip install fastgpt-sdk
# or
uv add fastgpt-sdk
```

---

## Quick Start & Authentication

Supports both **Personal API Keys** (full System OpenAPI access) and **App API Keys** (single bound app; `app_id` omitted automatically):

```python
import os
from fastgpt_sdk import FastGPT

with FastGPT(
    base_url=os.environ.get("FASTGPT_BASE_URL", "https://cloud.fastgpt.cn"),
    api_key=os.environ.get("FASTGPT_API_KEY"),
    default_app_id=os.environ.get("FASTGPT_APP_ID"),  # optional for personal keys
) as client:
    catalog = client.models.catalog()
    print(catalog.version, len(catalog.data.models) if catalog.data else 0)
```

### Asynchronous Client (`AsyncFastGPT`)

```python
import asyncio
from fastgpt_sdk import AsyncFastGPT

async def main() -> None:
    async with AsyncFastGPT(api_key="fastgpt-xxxx", default_app_id="68ad85a7463006c963799a05") as client:
        completion = await client.chat.completions_v2(
            chat_id="chat_001",
            messages=[{"role": "user", "content": "Summarize today's release notes."}],
            detail=True,
        )
        print(completion.choices)

asyncio.run(main())
```

### End-User Identity Isolation (`with_identity`) & Per-Request Overrides

```python
user_client = client.with_identity(custom_uid="customer_42")

# Automatically injects default_app_id + customUid into JSON body or query params
histories = user_client.chat.histories.list(page_size=20)

# Derived clients share the parent httpx pool; per-request overrides use request_options
detail = client.datasets.detail(
    id="68ad85a7463006c963799a05",
    request_options={"api_key": "fastgpt-personal-key", "timeout": 10.0, "max_retries": 0},
)
```

---

## Chat Completions (Sync & SSE Streaming)

Streaming and non-streaming variants of `/v2/chat/completions` are split into `completions_v2` and `completions_v2_stream`:

```python
# Synchronous SSE stream (or `async with await async_client.chat.completions_v2_stream(...) as stream:`)
with user_client.chat.completions_v2_stream(
    chat_id="chat_001",
    messages=[{"role": "user", "content": "Summarize today's release notes."}],
    detail=True,
) as stream:
    for event in stream:
        if event.type == "answer":
            print(event.text_delta, end="", flush=True)
        elif event.type == "flowNodeStatus":
            print("Node:", event.name, event.status)

    summary = stream.final_result()
    print("Quotes:", summary.quotes, "Interactive:", summary.interactive)
```

### Workflow Interactive Pause & Resume

```python
if user_client.chat.interactive.is_pending(completion):
    prompt = user_client.chat.interactive.unwrap(
        user_client.chat.interactive.extract(completion)
    )
    if prompt.type == "userSelect":
        user_client.chat.interactive.reply_user_select(
            chat_id="chat_001",
            value=prompt.params.user_select_options[0].value,
        )
    elif prompt.type == "userInput":
        user_client.chat.interactive.reply_user_form(
            chat_id="chat_001",
            values={"project": "FastGPT", "priority": "P0"},
        )
```

---

## Datasets: Multipart Uploads & Auto-Pagination

```python
from pathlib import Path

created = client.datasets.collections.create_by_local_file(
    dataset_id="68ad85a7463006c963799a05",
    training_type="chunk",
    file=("handbook.md", Path("./handbook.md").read_bytes(), "text/markdown"),
)
print("Collection ID:", created.collection_id)

# Offset auto-pagination (`for item in pager`, `.pages()`, or `.to_list()`)
for chunk in client.datasets.data.list_auto_paging(
    collection_id=created.collection_id,
    page_size=50,
    max_items=500,
):
    print(chunk.id_, chunk.q)

# Cursor auto-pagination for app logs (`POST /core/app/logs/search`)
for log in client.apps.logs.search_auto_paging(
    date_start="2026-01-01T00:00:00.000Z",
    date_end="2026-01-31T23:59:59.999Z",
    max_pages=5,
):
    print(log.chat_id, log.title)
```

---

## Raw Responses, Observability & Errors

```python
from fastgpt_sdk import (
    FastGPT,
    FastGPTAuthError,
    FastGPTConflictError,
    FastGPTHooks,
    FastGPTRateLimitError,
)

hooks = FastGPTHooks(
    on_request=lambda ctx: print("->", ctx.method, ctx.url, ctx.attempt),
    on_response=lambda ctx: print("<-", ctx.status_code, ctx.request_id, f"{ctx.duration_ms:.1f}ms"),
    on_error=lambda ctx: print("!!", ctx.operation_id, ctx.error),
)

client = FastGPT(api_key="fastgpt-xxxx", logger="warn", hooks=hooks)

raw = client.with_raw_response.models.list()
models_res = raw.parse()
print(len(models_res.models), raw.status_code, raw.request_id)

try:
    client.chat.histories.list()
except FastGPTAuthError:
    pass  # 401 / 403 / serverCode 514
except FastGPTConflictError:
    pass  # 409 / chatIsGenerating
except FastGPTRateLimitError:
    pass  # 429 / tooManyRequest
```

---

## Live Backend Smoke Testing

```bash
FASTGPT_SMOKE_BASE_URL=http://localhost:3000 \
FASTGPT_SMOKE_API_KEY=fastgpt-xxxx \
FASTGPT_SMOKE_APP_ID=68ad85a7463006c963799a05 \
uv run pytest tests/test_integration_smoke.py -v
```

### Package Modules

- `fastgpt_sdk` — `FastGPT`, `AsyncFastGPT`, identity/hook/logger types, error hierarchy, version metadata.
- `fastgpt_sdk.errors` — `FastGPTError` and mapped API/transport exception classes.
- `fastgpt_sdk.sse` — `ChatStream`, `AsyncChatStream`, `RawSseFrame`, `parse_chat_sse_frame`, and typed SSE events.
- `fastgpt_sdk.interactive` — workflow interactive extraction helpers and `reply_user_select` / `reply_user_form`.
- `fastgpt_sdk.pagination` — `SyncPageIterable`, `AsyncPageIterable`, and offset/pageNum/cursor paginator helpers.
- `fastgpt_sdk.options` — `APIResponse`, `FastGPTIdentity`, `AuthProxyIdentity`, `RequestOptions`, and `FastGPTModel`.
- `fastgpt_sdk.generated.models` — deterministic Pydantic v2 request/response models for all 47 System OpenAPI operations.
