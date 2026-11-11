# T01：`api` 通用逃生口（`fastgpt api` & `fastgpt api schema`）

- **阶段 / 优先级**：Phase 1 · P0（让未单独封装的任何 FastGPT API 立即可通过 CLI / Agent 调用）
- **状态**：待前置 T00（飞书多维表格 Record: `reczz28YDq8uU4ot` · [任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要 `requestRaw` / JSON 文件输入 / `--dry-run` / `destructive` 护栏）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T02 ~ T10 完全并行

---

## 1. 目标

对标 `lark-cli api`，提供基于 FastGPT 运行时 OpenAPI 文档（`/api/apidoc/devapi.json` 与 `/api/apidoc/systemopenapi.json`）的通用 REST 调用入口与 Schema 自省查询能力，覆盖 400+ 长尾或尚未封装的平台接口。

---

## 2. 命令设计与接口映射

### 2.1 子命令树

| 命令 | 风险级别 | `authModes` | 说明 |
|---|---|---|---|
| `fastgpt api schema [path]` | `read` | `['token', 'personalKey', 'appKey']`（支持 `--offline` 用本地缓存） | 列出可用路径（支持 `--tag`、`--search`、`--source dev\|system`）或输出指定接口的 method、summary、parameters、requestBody、response schema |
| `fastgpt api <method> <path>` | 动态判定（见下） | 依当前生效凭据与目标接口判定（见 3.1） | 向任意 FastGPT API 发送请求（`GET`/`POST`/`PUT`/`DELETE`） |

### 2.2 关键参数设计

- `fastgpt api <method> <path>`：
  - `--query <k=v>`（可重复）或 `--query-json <json>`
  - `--body <json>` / `--file <path>` / `--stdin`
  - `--header <k:v>`（受脱敏保护，禁止覆盖认证头除非显式传入）
  - `--source <dev|system>`（指定 schema 校验来源）
  - `--no-validate`（跳过本地 schema 校验强制发包，默认先用缓存 OpenAPI 做参数提示/校验）
  - `--raw`（使用 `requestRaw` 原样输出下载内容或写入 `--output <file>`）
  - `--dry-run` / `--yes`

---

## 3. 核心设计要点与限制

### 3.1 路径规范化与安全护栏（关键）
- **路径白名单与防 SSRF**：`<path>` 必须先规范化并禁止包含协议头（`http://`）、`..` 路径穿越或任意完整 URL，确保所有请求只发往已校验的 `resolvedAuth.baseUrl`。
- **风险动态判定**：
  - `GET` → `read`
  - `POST`/`PUT` → 默认 `write`（若路径包含 `delete` / `del` / `remove` / `clear` / `cancel` 等高危语义，提升为 `destructive`）
  - `DELETE` → `destructive`
  - 触发 `destructive` 时，同样受非 TTY 必须传 `--yes` 的安全门禁保护！
- **禁止越权提示**：当目标 path 处于 `/proApi/admin/**` 时，给出高危/管理员提示（`admin` 仅限管理员凭证）。
- **路径去重**：自动容忍用户传入 `/api/core/app/list` 与 `/core/app/list`（因为 `baseUrl` 已统一标准化为 `.../api`，需剥离多余前缀 `/api` 防止拼成 `/api/api/...`）。

### 3.2 OpenAPI 缓存策略（XDG 缓存目录）
- 运行时从目标实例拉取 `GET /api/apidoc/devapi.json` 或 `GET /api/apidoc/systemopenapi.json`（注意某些精简部署或旧版可能关闭部分 apidoc，404 时给出清晰提示，同时允许用户用 `--no-validate` 直接发包）。
- 缓存文件落盘在独立缓存目录（建议 `~/.cache/fastgpt/apidoc/<origin-hash>.json` 或 `FASTGPT_CONFIG_DIR/cache/`，权限 `0700`/`0600`），支持 `--refresh` 强制刷新与 TTL（例如 24 小时）。
- 本地 Schema 校验优先校验路径是否存在、HTTP Method 是否匹配、必填 query/body 字段是否缺失，降低 Agent 幻觉传参概率。

### 3.3 代码落点
- `src/domain/api/openapi-cache-service.ts`（缓存管理端口 + schema 检索与简明摘要生成）
- `src/domain/api/api-caller-service.ts`（路径规范化、动态风险计算、本地入参预检、调用 `FastGptHttpClient`）
- `src/infra/cache/apidoc-cache-store.ts`（文件缓存持久化）
- `src/cli/commands/api.ts`
- `src/cli/container.ts` / `src/cli/registry.ts` / `src/cli/program.ts`（单行登记）

---

## 4. 验收标准与测试清单

- [ ] 单元测试：`fastgpt api get /api/core/dataset/detail` 与 `/core/dataset/detail` 都能正确剥离重复 `/api` 前缀；拒绝 `https://evil.com/...` 或 `/../` 穿越。
- [ ] 单元测试：`DELETE /core/app/del` 与包含 `delete` 的路径在非 TTY 未传 `--yes` 时返回退出码 `2`。
- [ ] 单元测试：`--dry-run` 不发网络请求，完整输出规范化后的 `method`、`path`、`query`、`body`（脱敏）。
- [ ] 单元测试：`api schema` 支持关键词搜索并能解析 OpenAPI `$ref` / `requestBody` 必填字段，服务端无 apidoc 时优雅报错或配合 `--no-validate` 正常放行。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
