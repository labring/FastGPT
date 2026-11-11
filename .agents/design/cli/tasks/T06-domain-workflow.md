# T06：`workflow` 独立一级工作流域（GitOps + 复用 `workflow-cli`）

- **阶段 / 优先级**：Phase 2 · P2
- **状态**：待前置 T00（飞书多维表格 Record: `reczz28YDq8uXqGq` · [任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（并建议参考 T04 `app` 应用详情/发布结构）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T07 ~ T10 并行

---

## 1. 目标

把 `workflow` 建设为 `fastgpt` 下独立一级域，打通“**云端拉取 → 本地 DSL 增量编辑/校验 → Diff 对比 → 推送调试与发布**”的完整工作流 GitOps 闭环，同时复用 `@fastgpt/workflow-core` 与 `@fastgpt/workflow-cli` 既有能力，避免重复造轮子。

---

## 2. 命令设计与接口映射

### 2.1 云端同步与调试命令（Native HTTP + `@fastgpt/workflow-core`）

| 命令 | 对应服务端接口 | 风险 | `authModes` | 说明 |
|---|---|---|---|---|
| `workflow pull <appId> [--dir <dir>]` | `GET /core/app/detail`（或 `/core/app/version/detail`） | `write`（写本地目录） | `['token']` | 将云端工作流 `modules` / `edges` / `chatConfig` 经 `@fastgpt/workflow-core` `decompile` 为本地工作区目录结构 |
| `workflow diff <appId> [--dir <dir>]` | `GET /core/app/detail` + 本地工作区对比 | `read` | `['token']` | 计算本地变更与云端当前草稿/最新版本的节点、连线、变量、配置差异 |
| `workflow validate [--dir <dir>]` | 纯本地 `@fastgpt/workflow-core` | `read` | `['none']` | 本地校验工作流拓扑、必填输入、引用合法性，支持离线运行 |
| `workflow push <appId> [--dir <dir>]` | `POST /core/app/update` | `write` | `['token']` | 校验通过后 `compile` 为 FastGPT 结构并更新应用草稿（支持 `--dry-run`、冲突校验 `--expected-update-time`） |
| `workflow publish <appId>` | `POST /core/app/version/publish` | `write` | `['token']` | 推送或基于当前草稿发布正式版本（支持 `--version-name`） |
| `workflow debug` | `POST /core/workflow/debug` | `write` | `['token']` | 单节点 / 局部工作流服务端调试（支持 `--file` / `--stdin`） |
| `workflow sandbox-packages` | `GET /core/workflow/getSandboxPackages` | `read` | `['token']`（核对） | 查询代码节点沙盒可用依赖包清单 |
| `workflow optimize-code` | `POST /core/workflow/optimizeCode` | `read` | `['token']`（核对） | 调用服务端 AI 优化代码节点代码 |

### 2.2 本地 DSL 编辑命令（桥接 `@fastgpt/workflow-cli`）

复用 `packages/workflow-cli/src/registry.ts` 已有的 13 组本地工作区操作：
- `workflow document ...` / `meta ...` / `config ...` / `variable ...` / `template ...`
- `workflow node ...` / `edge ...` / `input ...` / `output ...` / `tool ...` / `container ...`
- `workflow changeSet ...`

---

## 3. 核心实现要点与架构注意（必看）

### 3.1 避免 `@fastgpt/web` 重型依赖拖垮 CLI 包体
- 先检查 `packages/workflow-cli/src/template/provider.ts`：目前 `@fastgpt/workflow-cli` 依赖 `@fastgpt/web` 读取节点模板元信息。
- **硬约束**：`cli/` 的 `dist/cli.mjs` 不能因为引入 `@fastgpt/workflow-cli` 而把 React / ChakraUI / Next 客户端代码打进包体！
  - 实现前必须检查打包结果体积与 `bun ./scripts/build.bun.ts` 编译产物，只保留纯数据模板元信息，必要时在 `T06` 中通过 `tsdown` tree-shaking / 拆分纯 JSON/TS 模板导出或动态调用 `workflow-cli` 子进程来隔离。

### 3.2 退出码统一映射
- 注意 `@fastgpt/workflow-cli/src/run.ts` 的退出码与 `@fastgpt/cli` 略有差异（例如校验错误在 `workflow-cli` 为 4，命令错误为 3）。
- 桥接进 `fastgpt workflow ...` 时，必须把 `workflow-cli` 的异常与结果统一转译为 `@fastgpt/cli` 的 `CliArgumentError`（2）/ `CliApiError`（4）和 `fastgpt-cli-result/v1` 信封格式。

### 3.3 并发保护
- `workflow pull` 在工作区根目录记录远端快照信息（如 `appId`、`pulledAt`、`checksum`）；`workflow push` 前先比对远端是否有其他人更新（`updateTime` 或远端节点 checksum），若远端已变更且未传 `--force` / `--yes`，阻断覆盖并提示先 `diff` / `pull`。

### 3.4 目录落点
- `src/domain/workflow/workflow-sync-service.ts`
- `src/domain/workflow/workflow-local-bridge.ts`
- `src/cli/commands/workflow/*.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`pull -> validate -> diff -> push -> publish` 全流程 mock 测试（包含远端版本冲突拒绝与 `--dry-run`）。
- [ ] 单测覆盖：`workflow validate` 在 `authModes: ['none']` 下无需登录即可运行。
- [ ] 验证 `@fastgpt/cli` `build:tsdown` 产物体积与 `compile` 二进制构建未被 React/Chakra UI 污染。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
