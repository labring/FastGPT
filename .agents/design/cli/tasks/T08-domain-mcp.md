# T08：`mcp` 独立一级域（外部 MCP 接入 / MCP Server 发布 / 本地 `mcp serve`）

- **所属需求包**：`PKG-06` 工具与 MCP（Tool & MCP）（Record: `reczz28YGuG6RmrU`）
- **细粒度 PRD（可按子 PRD 隔离文件并行认领）**：
  - `PRD-06.2`（`T08a`）外部 MCP 工具与平台 MCP Server 发布（Record: `reczz28YDq8uZs9H` · `FR-603`~`FR-604`）
  - `PRD-06.3`（`T08b`）CLI 本地 stdio MCP Server 代理（Record: `reczz28Yb9VZwDBo` · `FR-605`）
- **阶段 / 优先级**：Phase 2 · P2
- **状态**：待前置 T00（[飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（以及 `registry.ts` `CliCommandSpec` 元数据机制）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T06、T07、T09、T10 并行

---

## 1. 目标

建立完整的 `fastgpt mcp` 独立能力域，覆盖三个方向的 MCP 场景：
1. **`mcp tool`**：管理 FastGPT 作为客户端消费的外部 MCP 工具集；
2. **`mcp server`**：管理 FastGPT 自身向外暴露应用的 MCP Server 发布；
3. **`mcp serve`**：CLI 本地启动 **stdio MCP Server**，将 `@fastgpt/cli` 自身注册的命令暴露给 Claude Code / Cursor / Codex 等本地 Agent（复用同一份 `CliCommandSpec` 注册表，默认只读）。

---

## 2. 命令设计与接口映射

### 2.1 `mcp tool`（平台消费外部 MCP）

| 命令 | 对应服务端接口 | 风险 | 说明 |
|---|---|---|---|
| `mcp tool parse <url>` | `/core/app/mcpTools/getTools` | `read` | 解析外部 MCP Server 暴露的工具清单 |
| `mcp tool create` | `/core/app/mcpTools/create` | `write` | 创建 MCP 工具集应用（支持 `--file`） |
| `mcp tool update <appId>` | `/core/app/mcpTools/update` | `write` | 更新外部 MCP Server 配置与工具列表 |
| `mcp tool list <appId>` | `/core/app/mcpTools/getChildren` | `read` | 列出该工具集下的 MCP 工具 |
| `mcp tool run` | `/core/app/mcpTools/runTool` | `write` | 在线测试调用某一个 MCP 工具 |

### 2.2 `mcp server`（平台对外发布 MCP Server）

| 命令 | 对应服务端接口 | 风险 | 典型 `authModes` |
|---|---|---|---|
| `mcp server list` | `/support/mcp/list` | `read` | `['token', 'personalKey']`（核对路由） |
| `mcp server create` | `/support/mcp/create` | `write` | `['token']`（核对路由） |
| `mcp server update <mcpId>` | `/support/mcp/update` | `write` | `['token']` |
| `mcp server delete <mcpId>` | `/support/mcp/delete` | `destructive` | `['token']` |
| `mcp server tools` | `/support/mcp/server/toolList` | `read` | 核对路由（支持 `--key`） |
| `mcp server call` | `/support/mcp/server/toolCall` | `write` | 核对路由（支持 `--key`、`--tool`、`--args`） |

### 2.3 `mcp serve`（CLI 本地 stdio MCP Server）

- 命令：`fastgpt mcp serve [--read-only] [--allow <prefixes...>] [--deny <prefixes...>]`
- `authModes`: `['none']`（启动本地 MCP 进程本身不要求先校验登录，具体每次 tool call 走与 CLI 相同的 `resolveEffectiveAuth` + `assertAuthAllowed` 门禁！）

---

## 3. `mcp serve` 核心安全与实现约束

1. **禁止依赖未授权/冲突重包**：使用仓库 catalog 已有的 `@modelcontextprotocol/sdk`（stdio transport）实现或标准 JSON-RPC 2.0 MCP stdio framing（若引入 `@modelcontextprotocol/sdk` 需先验证 `tsdown` 与 `bun build --compile` 打包体积和兼容性，确保无原生依赖）。
2. **默认最小权限（安全红线）**：
   - 默认模式等价 `--read-only`：仅暴露 `risk === 'read'` 的命令；
   - **`admin` 域永远默认排除**（除非显式 `--allow admin` 且伴随风险告警）；
   - **`destructive` 域（含 `delete`、`clear`）默认排除**，即使用户传入 `--allow-write` 也不自动开放破坏性删除；
   - **`mcp serve` 自身不能递归注册为 MCP tool**（防自指循环）。
3. **stdout 零污染**：stdio MCP 使用 `stdout` 传输 JSON-RPC 协议帧，CLI 内部任何日志/告警/debug 必须严格写往 `stderr`！
4. **复用 `executeCommandWithPipeline`**：Tool Call 执行必须复用 `pipeline.ts` 中的鉴权预检与 `redactValue` 脱敏，不能自创一套绕过门禁的执行链路。
5. **目录落点**：
   - `src/domain/mcp/mcp-tool-service.ts`
   - `src/domain/mcp/mcp-server-service.ts`
   - `src/domain/mcp/mcp-stdio-bridge.ts`
   - `src/cli/commands/mcp/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`mcp tool parse/create/run` 与 `mcp server list/create/delete`（含 `destructive` 非 TTY 门禁）。
- [ ] 单测覆盖：`mcp serve` 工具发现过滤规则（默认只暴露 `read`、排除 `admin`、`destructive` 与 `mcp serve` 自身）、stdin/stdout JSON-RPC tool list & tool call 端到端闭环（不碰 stderr/stdout 串流）。
- [ ] 验证引入 MCP 相关实现后 `build:tsdown` 与 `bun build --compile` 仍正常运行。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
