# FastGPT CLI（`@fastgpt/cli`）文档与协同索引

> 本索引文件是 FastGPT CLI 设计、研发规范、任务拆解与飞书三表关联多维表格的统一导航入口；后续任何需求包调整、PRD 认领或状态变更，均同步维护此处与飞书多维表格。

---

## 1. 协同与外部入口

| 资源 | 标识 / 链接 | 用途 |
|---|---|---|
| **飞书设计方案（正式基线 v1.2）** | [FastGPT CLI 设计方案](https://fael3z0zfze.feishu.cn/docx/GK3LdwUfEon2T8xTC9kcADohn6d)（Token: `GK3LdwUfEon2T8xTC9kcADohn6d`） | 对齐背景、四层架构、命令面、双轨认证、技术选型与里程碑 |
| **飞书任务多维表格（9 包 × 44 FR × 24 PRD）** | [FastGPT CLI 任务分配与进度看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)（Base: `L8MsbBBOiaVIzdsfwa1cF78UnGc`） | `需求包`（`tbltZMVyb9WKXFw5`）↔ `FR 功能需求`（`tblNyRRtu9OoC9c4`）↔ `PRD 交付清单`（`tblsOxwpSdMPxncf`） |
| **前置与底座 Draft PR** | [labring/FastGPT#8334](https://github.com/labring/FastGPT/pull/8334) | 服务端 `whoami` 接口 + `@fastgpt/cli` 认证底座与双路构建（`PRD-00.1`） |
| **本地包目录** | [cli/](../../../cli/) | `@fastgpt/cli` 源码、单测、`tsdown` / `bun` 构建脚本 |

### 飞书多维表格三表与默认可折叠视图导航

| 顺序 / 数据表 | Table ID | 默认首视图（彩色需求包可折叠分组） | 其余视图 |
|---|---|---|---|
| **1. 需求包**（9 包） | `tbltZMVyb9WKXFw5` | **按阶段分组**（`vewP6gtHYd`） | 阶段看板（`vewwBBg01V`） |
| **2. FR 功能需求**（44 条） | `tblNyRRtu9OoC9c4` | **按需求包分组**（`vewY4pp5TG`） | 状态看板（`vewHqvXkU1`）、按PRD分组（`vewExsQ2GJ`） |
| **3. PRD 交付清单**（24 份） | `tblsOxwpSdMPxncf` | **按需求包分组**（`vew4tpO8fm`） | 状态看板（`vewf9gYsOF`） |

---

## 2. 本地文档结构

- **[design.md](./design.md)** — **正式设计基线（v1.2）**：完整设计方案、业务领域命令树（第 5 节）、三类凭据双轨认证（第 6 节）、Skills 与 `mcp serve`（第 7 节）、npm 优先/单文件预留技术选型（第 8 节）。
- **[engineering-standards.md](./engineering-standards.md)** — **研发规范与架构护栏（开工必读）**：四层单向依赖、并行防冲突边界、风格规范、禁止 `@types/bun` / `@fastgpt/service` / 原生 addon、鉴权核对、安全脱敏、`--dry-run` / `destructive` 门禁与本地 CI 验证清单。
- **[tasks/README.md](./tasks/README.md)** — **任务依赖 DAG 与认领指引**：说明 `T00` 阻塞依赖及各需求包 / 细粒度 PRD 协作流程。

---

## 3. 9 需求包 → 44 FR → 24 细粒度 PRD 全量索引表

| 需求包（Record ID） | PRD 编号 & 标题 | 阶段 | 优先级 | 状态 | 覆盖 FR | PRD Record ID | 独占代码目录 | 规格文档 |
|---|---|---|---|---|---|---|---|---|
| **PKG-00** 认证与公共运行时底座 (`reczz28YGuG6P2j0`) | `PRD-00.1` 认证底座与 whoami 接口 | Phase 0 | P0 | **已完成** | `FR-001`~`FR-003` | `reczz28YDq8uTJDm` | `cli/src/{shared,infra,domain/{auth,profile,doctor},cli}` | [design.md](./design.md#L459) |
| **PKG-00** 认证与公共运行时底座 (`reczz28YGuG6P2j0`) | `PRD-00.2` 公共运行时扩展与安全门禁 (`T00`) | Phase 0.5 | P0 | **开发中** | `FR-004`~`FR-006` | `reczz28YDq8uUbAc` | `cli/src/{infra/http,infra/ui,infra/fs,shared/{input,pagination}.ts,cli/pipeline.ts}` | [T00](./tasks/T00-shared-runtime-extensions.md) |
| **PKG-01** 通用 API 逃生口 (`reczz28YGuG6RNyE`) | `PRD-01.1` OpenAPI 缓存与 `api schema` (`T01a`) | Phase 1 | P0 | 待前置 T00 | `FR-101`~`FR-102` | `reczz28YDq8uU4ot` | `cli/src/infra/cache/`, `cli/src/domain/api/openapi-cache-service.ts`, `cli/src/cli/commands/api-schema.ts` | [T01](./tasks/T01-api-escape-hatch.md) |
| **PKG-01** 通用 API 逃生口 (`reczz28YGuG6RNyE`) | `PRD-01.2` `fastgpt api` 通用请求与护栏 (`T01b`) | Phase 1 | P0 | 待前置 T00 | `FR-103`~`FR-104` | `reczz28Yb9VZy6Gh` | `cli/src/domain/api/api-caller-service.ts`, `cli/src/cli/commands/api.ts` | [T01](./tasks/T01-api-escape-hatch.md) |
| **PKG-02** 知识库（Dataset） (`reczz28YGuG6QfA7`) | `PRD-02.1` 知识库基础管理与召回检索 (`T02a`) | Phase 1 | P1 | 待前置 T00 | `FR-201`~`FR-202` | `reczz28YDq8uS2GJ` | `cli/src/domain/dataset/dataset-service.ts`, `cli/src/cli/commands/dataset/dataset.ts` | [T02](./tasks/T02-domain-dataset.md) |
| **PKG-02** 知识库（Dataset） (`reczz28YGuG6QfA7`) | `PRD-02.2` 集合导入与本地文件上传 (`T02b`) | Phase 1 | P1 | 待前置 T00 | `FR-203`~`FR-204` | `reczz28Yb9VZxWTm` | `cli/src/domain/dataset/collection-service.ts`, `cli/src/cli/commands/dataset/collection.ts` | [T02](./tasks/T02-domain-dataset.md) |
| **PKG-02** 知识库（Dataset） (`reczz28YGuG6QfA7`) | `PRD-02.3` 分块数据、训练监控与标签同义词 (`T02c`) | Phase 1 | P1 | 待前置 T00 | `FR-205`~`FR-207` | `reczz28Yb9VZyQJb` | `cli/src/domain/dataset/{data,training,tag-synonym}-service.ts`, `cli/src/cli/commands/dataset/{data,train,tag-synonym}.ts` | [T02](./tasks/T02-domain-dataset.md) |
| **PKG-03** 应用管理（App） (`reczz28YGuG6R28N`) | `PRD-03.1` 应用生命周期与导入导出 (`T03a`) | Phase 1 | P1 | 待前置 T00 | `FR-301`~`FR-302` | `reczz28YDq8uSoiE` | `cli/src/domain/app/{app-service,app-export-mapper}.ts`, `cli/src/cli/commands/app/app.ts` | [T04](./tasks/T04-domain-app.md) |
| **PKG-03** 应用管理（App） (`reczz28YGuG6R28N`) | `PRD-03.2` 应用版本发布与分享渠道 (`T03b`) | Phase 1 | P1 | 待前置 T00 | `FR-303`~`FR-304` | `reczz28Yb9VZvO3d` | `cli/src/domain/app/{version,channel}-service.ts`, `cli/src/cli/commands/app/{version,channel}.ts` | [T04](./tasks/T04-domain-app.md) |
| **PKG-03** 应用管理（App） (`reczz28YGuG6R28N`) | `PRD-03.3` 应用运行日志与评测管理 (`T03c`) | Phase 1 | P1 | 待前置 T00 | `FR-305`~`FR-306` | `reczz28Yb9VZvwlh` | `cli/src/domain/app/logs-eval-service.ts`, `cli/src/cli/commands/app/{logs,eval}.ts` | [T04](./tasks/T04-domain-app.md) |
| **PKG-04** 对话与模型（Chat & Model） (`reczz28YGuG6RMRm`) | `PRD-04.1` 对话执行 SSE/NDJSON 与草稿调试 (`T04a`) | Phase 1 | P1 | 待前置 T00 | `FR-401`~`FR-402` | `reczz28YDq8uVFMC` | `cli/src/domain/chat/chat-service.ts`, `cli/src/cli/commands/chat/run.ts` | [T03](./tasks/T03-domain-chat.md) |
| **PKG-04** 对话与模型（Chat & Model） (`reczz28YGuG6RMRm`) | `PRD-04.2` 会话历史、消息记录与反馈 (`T04b`) | Phase 1 | P1 | 待前置 T00 | `FR-403`~`FR-404` | `reczz28Yb9VZvjGm` | `cli/src/domain/chat/history-service.ts`, `cli/src/cli/commands/chat/{history,record}.ts` | [T03](./tasks/T03-domain-chat.md) |
| **PKG-04** 对话与模型（Chat & Model） (`reczz28YGuG6RMRm`) | `PRD-04.3` 模型目录查询与连通性探测 (`T05`) | Phase 1 | P1 | 待前置 T00 | `FR-405`~`FR-406` | `reczz28YDq8uVwHs` | `cli/src/domain/model/model-service.ts`, `cli/src/cli/commands/model.ts` | [T05](./tasks/T05-domain-model.md) |
| **PKG-05** 工作流 GitOps (`reczz28YGuG6QeIn`) | `PRD-05.1` 工作流云端 GitOps 同步与调试 (`T06a`) | Phase 2 | P2 | 待前置 T00 | `FR-501`~`FR-502` | `reczz28YDq8uXqGq` | `cli/src/domain/workflow/workflow-sync-service.ts`, `cli/src/cli/commands/workflow/sync.ts` | [T06](./tasks/T06-domain-workflow.md) |
| **PKG-05** 工作流 GitOps (`reczz28YGuG6QeIn`) | `PRD-05.2` 工作流本地 DSL 与 `workflow-cli` 桥接 (`T06b`) | Phase 2 | P2 | 待前置 T00 | `FR-503` | `reczz28Yb9VZyRfd` | `cli/src/domain/workflow/workflow-local-bridge.ts`, `cli/src/cli/commands/workflow/local.ts` | [T06](./tasks/T06-domain-workflow.md) |
| **PKG-06** 工具与 MCP（Tool & MCP） (`reczz28YGuG6RmrU`) | `PRD-06.1` 系统工具、HTTP 工具集与团队插件 (`T07`) | Phase 2 | P2 | 待前置 T00 | `FR-601`~`FR-602` | `reczz28YDq8uYkYY` | `cli/src/domain/tool/*.ts`, `cli/src/cli/commands/tool/*.ts` | [T07](./tasks/T07-domain-tool.md) |
| **PKG-06** 工具与 MCP（Tool & MCP） (`reczz28YGuG6RmrU`) | `PRD-06.2` 外部 MCP 工具与平台 MCP Server (`T08a`) | Phase 2 | P2 | 待前置 T00 | `FR-603`~`FR-604` | `reczz28YDq8uZs9H` | `cli/src/domain/mcp/{mcp-tool,mcp-server}-service.ts`, `cli/src/cli/commands/mcp/{tool,server}.ts` | [T08](./tasks/T08-domain-mcp.md) |
| **PKG-06** 工具与 MCP（Tool & MCP） (`reczz28YGuG6RmrU`) | `PRD-06.3` CLI 本地 stdio MCP Server 代理 (`T08b`) | Phase 2 | P2 | 待前置 T00 | `FR-605` | `reczz28Yb9VZwDBo` | `cli/src/domain/mcp/mcp-stdio-bridge.ts`, `cli/src/cli/commands/mcp/serve.ts` | [T08](./tasks/T08-domain-mcp.md) |
| **PKG-07** AI Skill 与 Agent 技能 (`reczz28Yb8uAQaGY`) | `PRD-07.1` 平台 AI Skill、沙盒与版本调试 (`T09`) | Phase 2 | P2 | 待前置 T00 | `FR-701`~`FR-702` | `reczz28YDq8ua7KK` | `cli/src/domain/skill/platform-skill-service.ts`, `cli/src/cli/commands/skill/*.ts` | [T09](./tasks/T09-domain-skill.md) |
| **PKG-07** AI Skill 与 Agent 技能 (`reczz28Yb8uAQaGY`) | `PRD-07.2` `fastgpt skills` 5 套技能静态分发 (`T11a`) | Phase 3 | P3 | 待前置 T00 | `FR-703` | `reczz28YDq8uWbOm` | `cli/skills/`, `cli/src/domain/skills/`, `cli/src/infra/fs/skill-installer.ts`, `cli/src/cli/commands/skills.ts` | [T11](./tasks/T11-agent-skills-and-ci-drift.md) |
| **PKG-07** AI Skill 与 Agent 技能 (`reczz28Yb8uAQaGY`) | `PRD-07.3` Registry、Skill 与 OpenAPI 漂移门禁 (`T11b`) | Phase 3 | P3 | 待前置 T00 | `FR-704` | `reczz28Yb9VZyUjj` | `cli/scripts/check-command-drift.ts` | [T11](./tasks/T11-agent-skills-and-ci-drift.md) |
| **PKG-08** 团队与后台治理 (`reczz28Yb8uAOz6D`) | `PRD-08.1` 团队治理、成员组织与用量账单 (`T10a`) | Phase 3 | P3 | 待前置 T00 | `FR-801` | `reczz28YDq8uXEJb` | `cli/src/domain/team/team-service.ts`, `cli/src/cli/commands/team/team.ts` | [T10](./tasks/T10-domain-team-and-admin.md) |
| **PKG-08** 团队与后台治理 (`reczz28Yb8uAOz6D`) | `PRD-08.2` 团队 API Key 自助管理与脱敏 (`T10b`) | Phase 3 | P3 | 待前置 T00 | `FR-802` | `reczz28Yb9VZxMy3` | `cli/src/domain/team/apikey-service.ts`, `cli/src/cli/commands/team/apikey.ts` | [T10](./tasks/T10-domain-team-and-admin.md) |
| **PKG-08** 团队与后台治理 (`reczz28Yb8uAOz6D`) | `PRD-08.3` 系统管理员高危隔离域 `admin` (`T10c`) | Phase 3 | P3 | 待前置 T00 | `FR-803` | `reczz28Yb9VZy9ZQ` | `cli/src/domain/admin/*.ts`, `cli/src/cli/commands/admin/*.ts` | [T10](./tasks/T10-domain-team-and-admin.md) |

---

## 4. 状态同步约定

1. 认领需求包或具体 PRD 时，在飞书多维表格 [需求包](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc?table=tbltZMVyb9WKXFw5) / [PRD 交付清单](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc?table=tblsOxwpSdMPxncf) 填写`负责人`并同步更新`FR 功能需求`对应记录的`状态`，同时在本仓库对应 `tasks/Txx-*.md` 与本索引表同步状态。
2. 当 `PRD-00.2`（`T00`）合入后，将 `PKG-01`~`PKG-08`、`PRD-01.1`~`PRD-08.3` 及 `FR-101`~`FR-803` 的状态统一由 `待前置 T00` 切换为 `待认领`。
3. PR 创建或合入时，同步回填飞书 `PRD 交付清单` 的`PR 链接`并切换为`PR评审中` / `已完成`。
