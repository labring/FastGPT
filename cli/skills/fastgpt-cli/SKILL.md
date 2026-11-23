---
name: fastgpt-cli
description: Authenticate, configure, discover commands, consume JSON envelopes, handle exit codes, manage bundled skills, and invoke any FastGPT endpoint safely via the fastgpt api escape hatch.
---

# FastGPT CLI Core & Escape Hatch

Use this skill for authentication, configuration, diagnostics, agent self-discovery, output parsing, skill management, and calling endpoints without dedicated domain subcommands.

## 1. Authentication & Profiles

Precedence: CLI flags (`--profile`, `--base-url`, `--token`, `--api-key`) > environment (`FASTGPT_PROFILE`, `FASTGPT_BASE_URL`, `FASTGPT_TOKEN`, `FASTGPT_API_KEY`) > active profile in `~/.config/fastgpt/config.json`. Setting both `FASTGPT_TOKEN` and `FASTGPT_API_KEY` fails with an auth conflict error.

- Non-interactive login via stdin (never pass secrets as argv flags when avoidable):
  ```bash
  printf '%s\n' "$FASTGPT_API_KEY" | fastgpt login --base-url https://cloud.fastgpt.cn --api-key-stdin --format json
  printf '%s\n' "$FASTGPT_TOKEN" | fastgpt login --base-url https://cloud.fastgpt.cn --token-stdin --format json
  fastgpt login --base-url https://cloud.fastgpt.cn --username user@example.com --password-stdin --format json
  ```
- Inspect identity, permissions, API Key type/bound app, and quota: `fastgpt whoami --format json` (add `--no-cache-update` to keep cached metadata unchanged).
- Manage sessions and profiles:
  - `fastgpt auth status --verify --format json`
  - `fastgpt auth list --format json`
  - `fastgpt auth switch <profile>`
  - `fastgpt auth switch-team <teamId>` (or `--team-id <teamId>`, session `token` only, Pro edition)
  - `fastgpt logout` (use `--local` to skip server `/loginout`, `--purge` to delete profile entry)
- Configuration and diagnostics:
  - `fastgpt config list --format json`
  - `fastgpt config get baseUrl` (supported keys: `currentProfile`, `baseUrl`, `allowInsecureHttp`)
  - `fastgpt config set baseUrl https://cloud.fastgpt.cn`
  - `fastgpt doctor --format json`

Credential kinds determine which commands are allowed locally before any HTTP call (`3` = `AUTH_MODE_UNSUPPORTED`):

- `token` (session token): full member access including App draft/publish/workflow/code-sandbox.
- `personalKey`: OpenAPI endpoints (`dataset`, `app list`, `chat`, `model`, `plugin`, `api`).
- `appKey`: single-app bound endpoints (`chat`, `app run`, `app logs`, `whoami`, `api`).

## 2. Discovery, JSON Envelope & Exit Codes

Non-TTY execution defaults to `--format json`. Always discover exact flags before guessing:

- `fastgpt commands --compact --format json` (token-efficient summary of all commands)
- `fastgpt commands --domain dataset --risk read --compact --format json`
- `fastgpt commands --command "dataset collection create-file" --format json`

Output shaping flags: `--fields _id,name`, `--pick data.datasetId`, `--raw`, `--quiet`, `--no-color`.

Success JSON envelope (`schemaVersion: "fastgpt-cli-result/v1"`):
`{ ok: true, command, changed, data, meta: { durationMs, ... }, warnings? }`.

Error JSON envelope on `stderr`:
`{ ok: false, command, changed: false, error: { code, message, hint?, details? } }`.

Exit codes:

| Code | Meaning | Typical cause |
| --- | --- | --- |
| `0` | Success | Completed or `--dry-run` preview succeeded |
| `1` | Internal error | Unexpected CLI runtime failure |
| `2` | Argument / guard error | Invalid flags/JSON or missing `--yes` on destructive command |
| `3` | Auth / TLS error | Missing login, expired token, wrong credential kind, unsafe `http://` |
| `4` | API business error | Server 4xx/5xx or business validation error |
| `5` | Network error | DNS, TCP, TLS handshake, or stream failure |

## 3. Generic OpenAPI Escape Hatch (`api`)

Use `api` when a FastGPT endpoint does not have a typed subcommand yet.

- Inspect cached or live OpenAPI schemas (`--source system` default or `--source dev`):
  ```bash
  fastgpt api schema --search dataset --format json
  fastgpt api schema --source dev --tag 应用基础管理 --method post --format json
  fastgpt api schema /core/dataset/detail --format json
  fastgpt api schema /core/app/list --source dev --format json
  fastgpt api schema /core/dataset/detail --offline --format json
  ```
- Invoke REST endpoints (`path` is relative to `/api`; leading `/api` is deduplicated; endpoints outside `system` OpenAPI require `--source dev`):
  - `fastgpt api get /core/dataset/detail --query id=<datasetId> --format json`
  - `fastgpt api post /core/dataset/listV2 --body '{"pageNum":1,"pageSize":10}' --format json`
  - `fastgpt api put /core/app/update --source dev --query appId=<appId> --file ./payload.json --dry-run --format json`
  - `fastgpt api delete /core/app/del --source dev --query appId=<appId> --yes --format json`
  - `fastgpt api call POST /core/app/listV2 --source dev --body '{"pageNum":1,"pageSize":20}' --format json`
- Safety & transport options:
  - Repeatable `--query <k=v>` and `--header <k:v>` (`authorization`/`token`/`cookie`/`rootkey` headers are blocked; use `--token` or `--api-key`).
  - Input payloads: `--body <json>`, `--file <path>`, or `--stdin`.
  - Validation: OpenAPI checks run by default; pass `--refresh` to refresh cache, `--no-validate` if `/apidoc` is unavailable or undocumented.
  - Raw/binary output: `--raw` or `--output <path>` (add `--overwrite` to replace an existing file).
  - Write/destructive safety: pass `--dry-run` to preview redacted requests; destructive endpoints (`DELETE`, or `POST`/`PUT` paths matching `del`/`delete`/`remove`/`clear`/`cancel`/`purge`/`drop`/`reset`) require `--yes` in non-TTY/JSON mode.

## 4. Bundled Agent Skills Management (`skills`)

Manage the 5 official FastGPT CLI skills locally (`authModes: ['none']`):

- `fastgpt skills catalog --format json`
- `fastgpt skills install --target agents --scope project --dry-run --format json`
- `fastgpt skills install fastgpt-cli,fastgpt-knowledge --target claude --scope user`
- `fastgpt skills doctor --dir ./.agents/skills --format json`
- `fastgpt skills update --target agents --scope project` (pass `--force` to overwrite locally edited `SKILL.md` files)
- `fastgpt skills uninstall fastgpt-cli --dir ./.agents/skills --yes` (only removes CLI-managed files and preserves user-added files)
