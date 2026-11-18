# T06：工作流构建、对比与调试

- **所属需求包**：`PKG-05` 工作流 GitOps（Workflow）（Record: `reczz28YGuG6QeIn`）
- **细粒度 PRD（可按子 PRD 隔离文件并行认领）**：
  - `PRD-05.1`（`T06a`）工作流云端 GitOps 同步与调试（Record: `reczz28YDq8uXqGq` · `FR-501`~`FR-502`）
  - `PRD-05.2`（`T06b`）工作流本地 DSL 编排与 `workflow-cli` 桥接（Record: `reczz28Yb9VZyRfd` · `FR-503`）
- **阶段 / 优先级**：Phase 2 · P2
- **状态**：待前置 T00（[飞书任务看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)）
- **前置依赖**：T00（并建议参考 T04 `app` 应用详情/发布结构）
- **开发红线**：必读 [engineering-standards.md](../engineering-standards.md) · 总览 [design.md](../design.md) · 索引 [index.md](../index.md)
- **可并行性**：T00 合入后与 T07 ~ T10 并行

---

## 1. 目标

用 `workflow-build` 承载本地构建，用 `workflow` 承载对比与调试，打通“**应用拉取 → 本地 DSL 增量编辑与校验 → 工作流对比与调试 → 应用草稿保存与发布**”的完整工作流 GitOps 闭环，同时复用 `@fastgpt/workflow-core` 与 `@fastgpt/workflow-cli` 既有能力，避免重复造轮子。

---

## 2. 命令设计与接口映射

### 2.1 工作流对比、校验与调试

| 命令 | 对应服务端接口 | 风险 | `authModes` | 说明 |
|---|---|---|---|---|
| `workflow diff <appId> [--dir <dir>]` | `GET /core/app/detail` + 本地工作区对比 | `read` | `['token']` | 计算本地变更与云端当前草稿/最新版本的节点、连线、变量、配置差异 |
| `workflow-build validate [--dir <dir>]` | 纯本地 `@fastgpt/workflow-core` | `read` | `['none']` | 本地校验工作流拓扑、必填输入、引用合法性，支持离线运行 |
| `workflow debug` | `POST /core/workflow/debug` | `write` | `['token']` | 服务端执行一轮调试，`--entry-nodes` 指定候选入口，节点执行仍取决于入边状态 |

应用拉取、草稿保存、发布、运行和测试见 [T04 应用命令](./T04-domain-app.md#2-命令设计与接口映射)。`code-sandbox packages` 使用 `GET /core/workflow/getSandboxPackages` 和 Session Token 查询当前实例的代码沙盒依赖及内置全局对象。

### 2.2 本地构建命令

以下命令均通过 `fastgpt workflow-build` 执行。
- 工作流文件操作包括 `init`、`build`、`import`、`inspect` 和 `validate`。
- `init` 默认通过 `GET /core/workflow/getTemplateBundle` 拉取当前成员的完整模板包，用该模板包生成 `workflow.json`，并在同一目录保存 `template-bundle.json`。`--offline` 使用本地模板，跳过鉴权和网络请求。
- `template load` 通过同一接口更新工作区模板。模板读取依次尝试宿主显式指定的文件、工作区 `template-bundle.json` 和内置模板。`app list` 与 `plugin tool list` 独立查询。
- 编辑命令组包括 `meta`、`config`、`variable`、`template`、`node`、`edge`、`input`、`output`、`tool`、`container` 和 `changeset`。

---

## 3. 核心实现要点与架构注意（必看）

### 3.1 避免 `@fastgpt/web` 重型依赖拖垮 CLI 包体
- 先检查 `packages/workflow-cli/src/template/provider.ts`：目前 `@fastgpt/workflow-cli` 依赖 `@fastgpt/web` 读取节点模板元信息。
- **硬约束**：`cli/` 的 `dist/cli.mjs` 不能因为引入 `@fastgpt/workflow-cli` 而把 React / ChakraUI / Next 客户端代码打进包体！
  - 实现前必须检查打包结果体积与 `bun ./scripts/build.bun.ts` 编译产物，只保留纯数据模板元信息，必要时在 `T06` 中通过 `tsdown` tree-shaking / 拆分纯 JSON/TS 模板导出或动态调用 `workflow-cli` 子进程来隔离。

### 3.2 退出码统一映射
- 注意 `@fastgpt/workflow-cli/src/run.ts` 的退出码与 `@fastgpt/cli` 略有差异（例如校验错误在 `workflow-cli` 为 4，命令错误为 3）。
- 迁入 `fastgpt workflow-build ...` 时，必须把 `workflow-cli` 的异常与结果统一转译为 `@fastgpt/cli` 的 `CliArgumentError`（2）/ `CliApiError`（4）和 `fastgpt-cli-result/v1` 信封格式。

### 3.3 并发保护
- `app pull` 在工作区根目录记录远端内容的 checksum。`app save` 和 `app publish` 比对远端内容基线，检测到冲突时提示先用 `workflow diff` 检查，并通过 `app pull` 同步。
- `app save` 和 `app publish` 使用 `returnWorkflow` 返回的本次保存快照更新远端内容基线，禁止回读最新草稿并将其当作本次保存回执，以免吸收其他成员的并发保存。
- 旧服务端不支持保存回执时，仅以本次提交内容的 checksum 建立保守基线，并返回兼容性警告。若服务端归一化改变了内容，后续写入会触发冲突保护，需要先用 `workflow diff` 检查，再通过 `app pull` 显式接收远端内容；客户端不自动采纳来源不确定的远端状态。

### 3.4 目录落点
- `src/domain/workflow/workflow-sync-service.ts`
- `src/domain/workflow/workflow-local-service.ts`
- `src/cli/commands/workflow-build/*.ts`
- `src/cli/commands/workflow/sync.ts`

---

## 4. 验收标准与测试清单

- [ ] 单测覆盖：`app pull` → `workflow-build validate` → `workflow diff` → `app save` → `app publish` 全流程 mock 测试（包含远端版本冲突拒绝与 `--dry-run`）。
- [ ] 单测覆盖：`workflow-build validate` 在 `authModes: ['none']` 下无需登录即可运行。
- [ ] 验证 `@fastgpt/cli` `build:tsdown` 产物体积与 `compile` 二进制构建未被 React/Chakra UI 污染。
- [ ] 全套本地门禁（`test:ci` / `lint` / `build:bun` / `compile` / `app typecheck`）通过。
