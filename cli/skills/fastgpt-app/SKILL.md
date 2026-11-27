---
name: fastgpt-app
description: Discover, pull, run, test, save, and publish FastGPT Apps, inspect and export App chat logs and analytics, list plugin tools, and inspect code-sandbox packages.
---

# FastGPT Applications, Logs & Runtime Tools (`app`, `plugin`, `code-sandbox`)

Pay close attention to `authModes`: App authoring/sync/sandbox commands require a session `token`, while `app list` / `plugin tool list` allow `token` or `personalKey`, `app run` / `app logs` (except `export`) allow `token` / `personalKey` / `appKey`, and `app logs export` allows only `token` or `appKey`.

## 1. App Discovery, Sync & Lifecycle (`app`)

- List accessible apps, team tools, and folders (`token` or `personalKey`):
  - `fastgpt app list --format json`
  - `fastgpt app list --type chatAgent,advanced --search support --page 1 --page-size 20 --format json` (also `--parent-id <id|null>`)
- Pull, save, publish, and test (`token` only):
  - `fastgpt app pull <appId> --dir ./flow --format json` (supports `--app-id`, `--version-id`, `--locale`, `--force`, `--dry-run`)
  - `fastgpt app save --dir ./flow --dry-run --format json` (supports `[appId]`, `--app-id`, `--force`)
  - `fastgpt app publish --dir ./flow --version-name v1.2.0 --format json` (supports `[appId]`, `--app-id`, `--force`, `--dry-run`)
  - `fastgpt app test --dir ./flow --query "Hello" --format json` (supports `--cases <path|->`, `--remote`, `--variables <json>`, `--fail-fast`, `--timeout <ms>`, `--dry-run`; `--cases` and `--query` are mutually exclusive)
- Run App conversation (`token`, `personalKey`, or `appKey`; shares `chat run` flags):
  - `fastgpt app run --appId <appId> --text "Hello" --format json`

## 2. App Logs & Analytics (`app logs`)

All `app logs` commands take `--app-id <appId>` (optional when authenticated with an `appKey`). Time windows use either `--date-start <iso>` + `--date-end <iso>` or `--days <n>`.

- Cursor-based log search (`POST /core/app/logs/search`, `token`, `personalKey`, `appKey`):
  - `fastgpt app logs search --app-id <appId> --days 7 --format json` (pass `meta.nextCursor` via `--cursor <json>` for subsequent pages)
- Offset/page log list and active users (`token`, `personalKey`, `appKey`):
  - `fastgpt app logs list --app-id <appId> --days 7 --page 1 --page-size 20 --format json` (supports `--offset`)
  - `fastgpt app logs users --app-id <appId> --days 7 --page 1 --page-size 20 --format json`
- Pro-only analytics (`token`, `personalKey`, `appKey`; returns exit code `4` on community editions):
  - `fastgpt app logs stats --app-id <appId> --format json`
  - `fastgpt app logs chart --app-id <appId> --days 7 --format json`
- CSV export (`token` or `appKey` only; `personalKey` is blocked at exit code `3`):
  - `fastgpt app logs export --app-id <appId> --days 7 --output ./logs.csv --format json` (pass `--overwrite` to replace an existing file; `--title` defaults to headers matching `--log-keys` + `chatDetails`)

## 3. Plugin Tools & Code Sandbox (`plugin`, `code-sandbox`)

- List plugin-backed system tools (`token` or `personalKey`):
  - `fastgpt plugin tool list --format json`
  - `fastgpt plugin tool list --search weather --tags utility --format json` (also `--parent-id <toolId>`, `--source <source>`)
- Inspect available JS/Python packages and builtin globals in the code sandbox (`token` only):
  - `fastgpt code-sandbox packages --format json`
