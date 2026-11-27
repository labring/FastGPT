---
name: fastgpt-chat
description: Run FastGPT App conversations, inspect and manage chat history, paginate round-aligned message records, submit message feedback, and query available member models.
---

# FastGPT Chat & Model Catalog (`chat`, `model`)

All `chat` commands use OpenAPI authentication (`token`, `personalKey`, or `appKey`). Notice `chat` flags use camelCase (`--appId`, `--chatId`, `--dataId`). `model list` accepts `token` or `personalKey`.

## 1. Credential & Identity Rules for `chat`

- With an **App API Key**: `--appId` is optional (uses the bound App). Passing a mismatched `--appId` fails at exit code `2`.
- With a **Personal API Key** or **Session Token**: `--appId <appId>` is required.
- Optional user attribution (mutually exclusive):
  - `--customUid <id>`: identify end user on API Keys (`token` forbidden).
  - `--authProxy <json>`: proxy as `{"tmbId":"..."}` or `{"username":"..."}` on an enabled `personalKey` (`token` and `appKey` forbidden).

## 2. Running, Stopping & Initializing Conversations

- Run a turn (creates a new conversation when `--chatId` is omitted):
  ```bash
  fastgpt chat run --appId <appId> --text "Hello" --format json
  fastgpt chat run --appId <appId> --chatId <chatId> --text "Follow up" --detail --format json
  ```
  Options: `--text <str>` (mutually exclusive with `--messages <json>`), `--variables <json>`, `--metadata <json>`, `--responseChatItemId <id>`, `--detail`, `--retainDatasetCite`, `--showSkillReferences`, `--file <path>`, `--stdin`, `--timeoutMs <ms>` (default `300000`), `--dry-run`.
- Stop a running conversation (HTTP timeout on `chat run` does not stop the server execution):
  - `fastgpt chat stop --appId <appId> --chatId <chatId> --format json` (supports `--dry-run`)
- Read App config, variables, and conversation state without creating a chat:
  - `fastgpt chat init --appId <appId> --chatId <chatId> --format json`

## 3. Conversation History (`chat history`)

- List conversations:
  - `fastgpt chat history list --appId <appId> --pageNum 1 --pageSize 20 --format json`
  - Supports `--offset`, `--source <api|online|test|...>`, `--startCreateTime`, `--endCreateTime`, `--startUpdateTime`, `--endUpdateTime`.
- Batch status check (1-200 IDs):
  - `fastgpt chat history status --appId <appId> --chatIds <id1,id2> --format json`
- Mark read, update title/pin state, or soft-delete:
  - `fastgpt chat history mark-read --appId <appId> --chatId <chatId> --dry-run --format json`
  - `fastgpt chat history update --appId <appId> --chatId <chatId> --title "Summary" --top true --format json` (supports `--customTitle`, `--dry-run`)
  - `fastgpt chat history delete --appId <appId> --chatId <chatId> --yes --format json` (`risk: destructive`, supports `--dry-run`)

## 4. Round-Aligned Records & Feedback (`chat record`, `chat feedback`)

- Paginate messages chronologically (defaults to latest round):
  - `fastgpt chat record list --appId <appId> --chatId <chatId> --pageSize 20 --format json`
  - Cursor navigation (mutually exclusive): pass `meta.prevCursor` to `--prevId <dataId>` for older rounds, `meta.nextCursor` to `--nextId <dataId>` for newer rounds, or `--initialId <dataId>` to jump near a message. Supports `--includeDeleted` and `--loadCustomFeedbacks`.
- Inspect detailed execution trace/response of an assistant message (`dataId`, not database `_id`):
  - `fastgpt chat record detail --appId <appId> --chatId <chatId> --dataId <dataId> --format json`
- Update or clear user feedback on an assistant message:
  - `fastgpt chat feedback update --appId <appId> --chatId <chatId> --dataId <dataId> --good "Helpful answer" --format json`
  - `fastgpt chat feedback update --appId <appId> --chatId <chatId> --dataId <dataId> --bad "Inaccurate citation" --format json`
  - `fastgpt chat feedback update --appId <appId> --chatId <chatId> --dataId <dataId> --clear --format json` (`--clear` is mutually exclusive with `--good` / `--bad`; supports `--dry-run`)

## 5. Member Model Catalog (`model list`)

- Discover models, providers, and default model IDs available to the active member:
  - `fastgpt model list --format json`
  - `fastgpt model list --include-source-member --order-by custom --format json`
