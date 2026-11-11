# T07：`tool` 工具集、HTTP 工具与团队插件域

- **所属需求包**：`PKG-04` 工作流 GitOps 与工具生态（Record: `reczz28YGuG6RMRm`）
- **覆盖 FR**：`FR-403` 系统工具与 HTTP 工具、`FR-404` 团队插件与两阶段安装包
- **阶段 / 优先级**：Phase 2 · P2
- **状态**：待前置 T00（PRD Record: `reczz28YDq8uYkYY` · [飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（需要 multipart 上传、`--file`、`--dry-run`、破坏性确认）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T06、T08 ~ T10 并行

---

## 1. 目标

覆盖除 MCP 之外的 FastGPT 工具生态能力（MCP 已独立为 `T08`）：系统工具与工具集浏览、HTTP 工具集创建与调试、团队自定义插件包的上传安装与版本管理。

---

## 2. 命令设计与接口映射

> 开发前请逐一核对 `projects/app/src/pages/api/core/app/httpTools/**`、`tool/**`、`toolSet/**` 及 `core/plugin/team/**` 的实际鉴权与参数格式。

### 2.1 通用工具与工具集（`tool`）

| 命令 | 对应服务端接口 | 风险 | 典型 `authModes` |
|---|---|---|---|
| `tool list` | `/core/app/toolSet/listV2` + `/core/app/tool/getSystemToolTemplates` | `read` | 核对路由（通常 `['token']` / `['token', 'personalKey']`） |
| `tool children <toolSetId>` | `/core/app/tool/getToolSetChildren` | `read` | 核对路由 |
| `tool preview <toolId>` | `/core/app/tool/getPreviewNode` | `read` | 核对路由 |

### 2.2 HTTP 工具集（`tool http`）

| 命令 | 对应服务端接口 | 风险 | 说明 |
|---|---|---|---|
| `tool http parse-schema <url>` | `/core/app/httpTools/getApiSchemaByUrl` | `read` | 从 OpenAPI/Swagger URL 解析工具定义预览 |
| `tool http create` | `/core/app/httpTools/create` | `write` | 通过 `--file` / `--stdin` 创建 HTTP 工具集 |
| `tool http update <appId>` | `/core/app/httpTools/update` | `write` | 更新 HTTP 工具集配置（支持 `--dry-run`） |
| `tool http run` | `/core/app/httpTools/runTool` | `write` | 在线测试运行指定 HTTP 工具节点 |

### 2.3 团队插件（`tool plugin`）

| 命令 | 对应服务端接口 | 风险 | 说明 |
|---|---|---|---|
| `tool plugin list` | `/core/plugin/team/tool/list` | `read` | 列出当前团队插件工具 |
| `tool plugin detail <toolId>` | `/core/plugin/team/tool/detail` | `read` | 查看插件详情与当前版本 |
| `tool plugin versions <toolId>` | `/core/plugin/team/tool/versions` | `read` | 查看插件历史版本 |
| `tool plugin install-pkg <file>` | `/core/plugin/team/pkg/upload` -> `/core/plugin/team/pkg/confirm` | `write` | 上传插件包预检并在确认后正式安装 |
| `tool plugin install-url <url>` | `/core/plugin/team/pkg/installWithUrl` | `write` | 从 URL 安装插件包 |
| `tool plugin delete <toolId>` | `/core/plugin/team/tool/delete` | `destructive` | 删除团队插件（需 `--yes`） |
| `tool plugin tags` | `/core/plugin/toolTag/list` | `read` | 列出插件分类标签 |

---

## 3. 核心实现要点与限制

- **两阶段包上传保护**：`tool plugin install-pkg` 调 `pkg/upload` 解析元数据后，在非 `--dry-run` 且处于 TTY 时展示将覆盖/新增的插件名与版本并确认后才调 `pkg/confirm`；在非 TTY 必须传 `--yes` 或仅用 `--dry-run` 执行到 `upload` 预检停下。
- **边界划分**：不要把 `mcpTools` 与 `support/mcp` 放进 `tool`（已归入 `T08 mcp`）；不要把系统管理员插件后台接口（`/core/plugin/admin/*`）混入普通 `tool`（管理员操作归 `T10 admin`）。
- **目录落点**：
  - `src/domain/tool/tool-service.ts`
  - `src/domain/tool/http-tool-service.ts`
  - `src/domain/tool/plugin-service.ts`
  - `src/cli/commands/tool/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`tool http create/run`、`tool plugin install-pkg`（含 `dry-run` 仅预检不提交）、`tool plugin delete` 破坏性拦截。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
