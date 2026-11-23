# FastGPT CLI（`@fastgpt/cli`）文档与协同索引

> 本索引文件是 FastGPT CLI 设计、研发规范、任务拆解与飞书三表关联多维表格的统一导航入口；后续任何需求包调整、PRD 认领或状态变更，均同步维护此处与飞书多维表格。

---

## 1. 协同与外部入口

| 资源 | 标识 / 链接 | 用途 |
|---|---|---|
| **飞书设计方案（正式基线 v1.2）** | [FastGPT CLI 设计方案](https://fael3z0zfze.feishu.cn/docx/GK3LdwUfEon2T8xTC9kcADohn6d)（Token: `GK3LdwUfEon2T8xTC9kcADohn6d`） | 对齐背景、四层架构、命令面、双轨认证、技术选型与里程碑 |
| **飞书任务多维表格（9 包 × 44 FR × 24 PRD）** | [FastGPT CLI 任务分配与进度看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)（Base: `L8MsbBBOiaVIzdsfwa1cF78UnGc`） | `需求包`（`tbltZMVyb9WKXFw5`）↔ `FR 功能需求`（`tblNyRRtu9OoC9c4`）↔ `PRD 交付清单`（`tblsOxwpSdMPxncf`） |
| **已合入基础 PR** | [labring/FastGPT#8334](https://github.com/labring/FastGPT/pull/8334) | 服务端 `whoami` 接口 + `@fastgpt/cli` 认证底座与双路构建（`PRD-00.1`） |
| **已合入增强 PR** | `#8219` / `#8358` / `#8391` | `#8219` 统一检索与 `chat`；`#8358` `dataset` 21 条命令、`model list` 与 `commands --compact`；`#8391` 合并 `workflow-cli`（`app` / `workflow` / `workflow-build` / `plugin` / `code-sandbox`） |
| **本地包目录** | [cli/](../../../cli/) | `@fastgpt/cli` 源码、单测、`tsdown` / `bun` 构建脚本 |

### 飞书多维表格三表与默认可折叠视图导航

| 顺序 / 数据表 | Table ID | 默认首视图（彩色需求包可折叠分组） | 其余视图 |
|---|---|---|---|
| **1. 需求包**（9 包） | `tbltZMVyb9WKXFw5` | **按阶段分组**（`vewP6gtHYd`） | 阶段看板（`vewwBBg01V`） |
| **2. FR 功能需求**（44 条） | `tblNyRRtu9OoC9c4` | **按需求包分组**（`vewY4pp5TG`） | 状态看板（`vewHqvXkU1`）、按PRD分组（`vewExsQ2GJ`） |
| **3. PRD 交付清单**（24 份） | `tblsOxwpSdMPxncf` | **按需求包分组**（`vew4tpO8fm`） | 状态看板（`vewf9gYsOF`） |

---

## 2. 本地文档结构

- **[design.md](./design.md)** — **正式设计基线（v1.3）**：完整设计方案、业务领域命令树（第 5 节）、三类凭据双轨认证（第 6 节）、Skills 与 `mcp serve`（第 7 节）、npm 优先/单文件预留技术选型（第 8 节）。
- **[engineering-standards.md](./engineering-standards.md)** — **研发规范与架构护栏（开工必读）**：四层单向依赖、并行防冲突边界、风格规范、禁止 `@types/bun` / `@fastgpt/service` / 原生 addon、鉴权核对、安全脱敏、`--dry-run` / `destructive` 门禁与本地 CI 验证清单。
- **[tasks/README.md](./tasks/README.md)** — **任务依赖 DAG 与认领指引**：说明 `T00` 基座落地情况及各需求包 / 细粒度 PRD 当前进度。

---

## 3. 9 需求包 → 44 FR → 24 细粒度 PRD 全量索引表

| 需求包（Record ID） | PRD 编号 & 标题 | 阶段 | 优先级 | 状态 | 覆盖 FR | PRD Record ID | 独占代码目录 | 规格文档 |
|---|---|---|---|---|---|---|---|---|
| **PKG-00** 认证与公共运行时底座 (`reczz28YGuG6P2j0`) | `PRD-00.1` 认证底座与 whoami 接口 | Phase 0 | P0 | **已完成 (`#8334`)** | `FR-001`~`FR-003` | `reczz28YDq8uTJDm` | `cli/src/{shared,infra,domain/{auth,profile,doctor},cli}` | [design.md](./design.md#L459) |
| **PKG-00** 认证与公共运行时底座 (`reczz28YGuG6P2j0`) | `PRD-00.2` 公共运行时扩展与安全门禁 (`T00`) | Phase 0.5 | P0 | **已完成 (`#8219`/`#8358`)** | `FR-004`~`FR-006` | `reczz28YDq8uUbAc` | `cli/src/{infra/http,infra/ui,infra/fs,shared/input.ts,cli/pipeline.ts}` | [T00](./tasks/T00-shared-runtime-extensions.md) |
| **PKG-01** 通用 API 逃生口 (`reczz28YGuG6RNyE`) | `PRD-01.1` OpenAPI 缓存与 `api schema` (`T01a`) | Phase 1 | P0 | **开发中（本批次）** | `FR-101`~`FR-102` | `reczz28YDq8uU4ot` | `cli/src/infra/cache/`, `cli/src/domain/api/openapi-cache-service.ts`, `cli/src/cli/commands/api.ts` | [T01](./tasks/T01-api-escape-hatch.md) |
| **PKG-01** 通用 API 逃生口 (`reczz28YGuG6RNyE`) | `PRD-01.2` `fastgpt api` 通用请求与护栏 (`T01b`) | Phase 1 | P0 | **开发中（本批次）** | `FR-103`~`FR-104` | `reczz28Yb9VZy6Gh` | `cli/src/domain/api/api-caller-service.ts`, `cli/src/cli/commands/api.ts` | [T01](./tasks/T01-api-escape-hatch.md) |
| **PKG-02** 知识库（Dataset） (`reczz28YGuG6QfA7`) | `PRD-02.1` 知识库基础管理与召回检索 (`T02a`) | Phase 1 | P1 | **已完成 (`#8219`/`#8358`)** | `FR-201`~`FR-202` | `reczz28YDq8uS2GJ` | `cli/src/domain/dataset/dataset-service.ts`, `cli/src/cli/commands/dataset/dataset.ts` | [T02](./tasks/T02-domain-dataset.md) |
| **PKG-02** 知识库（Dataset） (`reczz28YGuG6QfA7`) | `PRD-02.2` 集合导入与本地文件上传 (`T02b`) | Phase 1 | P1 | **已完成 (`#8358`)** | `FR-203`~`FR-204` | `reczz28Yb9VZxWTm` | `cli/src/domain/dataset/collection-service.ts`, `cli/src/cli/commands/dataset/collection.ts` | [T02](./tasks/T02-domain-dataset.md) |
| **PKG-02** 知识库（Dataset） (`reczz28YGuG6QfA7`) | `PRD-02.3` 分块数据、训练监控与标签同义词 (`T02c`) | Phase 1 | P1 | **部分完成**（`data` 5 命令已在 `#8358` 完成；`train`/`tag`/`synonym` 待认领） | `FR-205`~`FR-207` | `reczz28Yb9VZyQJb` | `cli/src/domain/dataset/data-service.ts`, `cli/src/cli/commands/dataset/data.ts` | [T02](./tasks/T02-domain-dataset.md) |
| **PKG-03** 应用管理（App） (`reczz28YGuG6R28N`) | `PRD-03.1` 应用生命周期与导入导出 (`T03a`) | Phase 1 | P1 | **部分完成**（`app list` 已在 `#8391` 完成；CRUD 与导入导出待认领） | `FR-301`~`FR-302` | `reczz28YDq8uSoiE` | `cli/src/domain/app/app-service.ts`, `cli/src/cli/commands/app/list.ts` | [T04](./tasks/T04-domain-app.md) |
| **PKG-03** 应用管理（App） (`reczz28YGuG6R28N`) | `PRD-03.2` 应用版本发布与分享渠道 (`T03b`) | Phase 1 | P1 | **部分完成**（`app pull/save/publish/test` 已在 `#8391` 完成；版本历史与分享渠道待认领） | `FR-303`~`FR-304` | `reczz28Yb9VZvO3d` | `cli/src/domain/workflow/workflow-sync-service.ts`, `cli/src/cli/commands/app.ts` | [T04](./tasks/T04-domain-app.md) |
| **PKG-03** 应用管理（App） (`reczz28YGuG6R28N`) | `PRD-03.3` 应用运行日志与评测管理 (`T03c`) | Phase 1 | P1 | **部分完成（本批次）**（`app logs` 6 命令本批次开发中；`app eval` 待认领） | `FR-305`~`FR-306` | `reczz28Yb9VZvwlh` | `cli/src/domain/app/app-logs-service.ts`, `cli/src/cli/commands/app/logs.ts` | [T04](./tasks/T04-domain-app.md) |
| **PKG-04** 对话与模型（Chat & Model） (`reczz28YGuG6RMRm`) | `PRD-04.1` 对话执行与草稿调试 (`T04a`) | Phase 1 | P1 | **已完成 (`#8219`)** | `FR-401`~`FR-402` | `reczz28YDq8uVFMC` | `cli/src/domain/chat/chat-service.ts`, `cli/src/cli/commands/chat.ts` | [T03](./tasks/T03-domain-chat.md) |
| **PKG-04** 对话与模型（Chat & Model） (`reczz28YGuG6RMRm`) | `PRD-04.2` 会话历史、消息记录与反馈 (`T04b`) | Phase 1 | P1 | **已完成/收口（本批次）**（`history`/`record` 已在 `#8219` 完成；`feedback update` 本批次补齐） | `FR-403`~`FR-404` | `reczz28Yb9VZvjGm` | `cli/src/domain/chat/{chat-service,chat-feedback-service}.ts`, `cli/src/cli/commands/{chat.ts,chat/feedback.ts}` | [T03](./tasks/T03-domain-chat.md) |
| **PKG-04** 对话与模型（Chat & Model） (`reczz28YGuG6RMRm`) | `PRD-04.3` 模型目录查询与连通性探测 (`T05`) | Phase 1 | P1 | **部分完成**（`model list` 已在 `#8358` 完成；连通性探测待认领） | `FR-405`~`FR-406` | `reczz28YDq8uVwHs` | `cli/src/domain/model/model-service.ts`, `cli/src/cli/commands/model.ts` | [T05](./tasks/T05-domain-model.md) |
| **PKG-05** 工作流 GitOps (`reczz28YGuG6QeIn`) | `PRD-05.1` 工作流云端 GitOps 同步与调试 (`T06a`) | Phase 2 | P2 | **已完成 (`#8391`)** | `FR-501`~`FR-502` | `reczz28YDq8uXqGq` | `cli/src/domain/workflow/workflow-sync-service.ts`, `cli/src/cli/commands/workflow/sync.ts` | [T06](./tasks/T06-domain-workflow.md) |
| **PKG-05** 工作流 GitOps (`reczz28YGuG6QeIn`) | `PRD-05.2` 工作流本地 DSL 与 `workflow-build` (`T06b`) | Phase 2 | P2 | **已完成 (`#8391`)** | `FR-503` | `reczz28Yb9VZyRfd` | `cli/src/domain/workflow/workflow-local-service.ts`, `cli/src/cli/commands/workflow-build/` | [T06](./tasks/T06-domain-workflow.md) |
| **PKG-06** 工具与 MCP（Tool & MCP） (`reczz28YGuG6RmrU`) | `PRD-06.1` 系统工具、HTTP 工具集与团队插件 (`T07`) | Phase 2 | P2 | **部分完成**（`plugin tool list` 已在 `#8391` 完成；自定义工具管理待认领） | `FR-601`~`FR-602` | `reczz28YDq8uYkYY` | `cli/src/domain/plugin/plugin-tool-service.ts`, `cli/src/cli/commands/plugin.ts` | [T07](./tasks/T07-domain-tool.md) |
| **PKG-06** 工具与 MCP（Tool & MCP） (`reczz28YGuG6RmrU`) | `PRD-06.2` 外部 MCP 工具与平台 MCP Server (`T08a`) | Phase 2 | P2 | **待认领** | `FR-603`~`FR-604` | `reczz28YDq8uZs9H` | `cli/src/domain/mcp/{mcp-tool,mcp-server}-service.ts`, `cli/src/cli/commands/mcp/{tool,server}.ts` | [T08](./tasks/T08-domain-mcp.md) |
| **PKG-06** 工具与 MCP（Tool & MCP） (`reczz28YGuG6RmrU`) | `PRD-06.3` CLI 本地 stdio MCP Server 代理 (`T08b`) | Phase 2 | P2 | **待认领** | `FR-605` | `reczz28Yb9VZwDBo` | `cli/src/domain/mcp/mcp-stdio-bridge.ts`, `cli/src/cli/commands/mcp/serve.ts` | [T08](./tasks/T08-domain-mcp.md) |
| **PKG-07** AI Skill 与 Agent 技能 (`reczz28Yb8uAQaGY`) | `PRD-07.1` 平台 AI Skill、沙盒与版本调试 (`T09`) | Phase 2 | P2 | **部分完成**（`code-sandbox packages` 已在 `#8391` 完成；平台 `skill` 命令待认领） | `FR-701`~`FR-702` | `reczz28YDq8ua7KK` | `cli/src/domain/code-sandbox/code-sandbox-service.ts`, `cli/src/cli/commands/code-sandbox.ts` | [T09](./tasks/T09-domain-skill.md) |
| **PKG-07** AI Skill 与 Agent 技能 (`reczz28Yb8uAQaGY`) | `PRD-07.2` `fastgpt skills` 5 套技能静态分发 (`T11a`) | Phase 3 | P3 | **已完成（本批次）** | `FR-703` | `reczz28YDq8uWbOm` | `cli/skills/fastgpt-*`, `cli/src/infra/skills/cli-skill-catalog.ts`, `cli/src/infra/fs/skill-installer.ts`, `cli/src/domain/skills/skills-service.ts`, `cli/src/cli/commands/skills.ts` | [T11](./tasks/T11-agent-skills-and-ci-drift.md) |
| **PKG-07** AI Skill 与 Agent 技能 (`reczz28Yb8uAQaGY`) | `PRD-07.3` Registry、Skill 与架构漂移门禁 (`T11b`) | Phase 3 | P3 | **已完成（本批次）** | `FR-704` | `reczz28Yb9VZyUjj` | `cli/scripts/{command-drift-core,check-command-drift}.ts`, `cli/test/cli/command-drift.test.ts` | [T11](./tasks/T11-agent-skills-and-ci-drift.md) |
| **PKG-08** 团队与后台治理 (`reczz28Yb8uAOz6D`) | `PRD-08.1` 团队治理、成员组织与用量账单 (`T10a`) | Phase 3 | P3 | **待认领** | `FR-801` | `reczz28YDq8uXEJb` | `cli/src/domain/team/team-service.ts`, `cli/src/cli/commands/team/team.ts` | [T10](./tasks/T10-domain-team-and-admin.md) |
| **PKG-08** 团队与后台治理 (`reczz28Yb8uAOz6D`) | `PRD-08.2` 团队 API Key 自助管理与脱敏 (`T10b`) | Phase 3 | P3 | **待认领** | `FR-802` | `reczz28Yb9VZxMy3` | `cli/src/domain/team/apikey-service.ts`, `cli/src/cli/commands/team/apikey.ts` | [T10](./tasks/T10-domain-team-and-admin.md) |
| **PKG-08** 团队与后台治理 (`reczz28Yb8uAOz6D`) | `PRD-08.3` 系统管理员高危隔离域 `admin` (`T10c`) | Phase 3 | P3 | **待认领** | `FR-803` | `reczz28Yb9VZy9ZQ` | `cli/src/domain/admin/*.ts`, `cli/src/cli/commands/admin/*.ts` | [T10](./tasks/T10-domain-team-and-admin.md) |

---

## 4. 状态同步约定

1. 认领需求包或具体 PRD 时，在飞书多维表格 [需求包](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc?table=tbltZMVyb9WKXFw5) / [PRD 交付清单](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc?table=tblsOxwpSdMPxncf) 填写`负责人`并同步更新`FR 功能需求`对应记录的`状态`，同时在本仓库对应 `tasks/Txx-*.md` 与本索引表同步状态。
2. 已有基础底座 `PRD-00.1`（`#8334`）与运行时能力 `PRD-00.2`（`#8219`/`#8358`）均已合入 `main`；各域新增命令须通过 `pnpm --filter @fastgpt/cli check:drift` 与 `test:ci` 门禁。
3. PR 创建或合入时，同步回填飞书 `PRD 交付清单` 的`PR 链接`并切换为`PR评审中` / `已完成`。
