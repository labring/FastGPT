# FastGPT CLI（`@fastgpt/cli`）文档与协同索引

> 本索引文件是 FastGPT CLI 设计、研发规范、任务拆解与飞书三表关联多维表格的统一导航入口；后续任何架构演进、需求包调整或任务状态变更，均同步维护此处与飞书多维表格。

---

## 1. 协同与外部入口

| 资源 | 标识 / 链接 | 用途 |
|---|---|---|
| **飞书设计方案（正式基线 v1.1）** | [FastGPT CLI 设计方案](https://fael3z0zfze.feishu.cn/docx/GK3LdwUfEon2T8xTC9kcADohn6d)（Token: `GK3LdwUfEon2T8xTC9kcADohn6d`） | 对齐背景、四层架构、命令面、双轨认证、技术选型与里程碑 |
| **飞书任务多维表格（三表关联架构）** | [FastGPT CLI 任务分配与进度看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)（Base: `L8MsbBBOiaVIzdsfwa1cF78UnGc`） | `需求包`（`tbltZMVyb9WKXFw5`）↔ `FR 功能需求`（`tblNyRRtu9OoC9c4`）↔ `PRD 开发任务单`（`tblsOxwpSdMPxncf`） |
| **前置与底座 Draft PR** | [labring/FastGPT#8334](https://github.com/labring/FastGPT/pull/8334) | 服务端 `whoami` 接口 + `@fastgpt/cli` 认证底座与双路构建（Phase 0） |
| **本地包目录** | [cli/](../../../cli/) | `@fastgpt/cli` 源码、单测、`tsdown` / `bun` 构建脚本 |

### 飞书多维表格三表与视图导航（已按表顺序重构，首视图均默认可折叠分组）

| 顺序 / 数据表 | Table ID | 默认首视图（可折叠分组） | 其余视图 |
|---|---|---|---|
| **1. 需求包** | `tbltZMVyb9WKXFw5` | **按阶段分组**（`vewP6gtHYd`） | 阶段看板（`vewwBBg01V`） |
| **2. FR 功能需求** | `tblNyRRtu9OoC9c4` | **按需求包与PRD分组**（`vewY4pp5TG`，二级折叠） | 状态看板（`vewHqvXkU1`）、仅按需求包分组（`vewExsQ2GJ`） |
| **3. PRD 开发任务单** | `tblsOxwpSdMPxncf` | **按需求包分组**（`vew4tpO8fm`） | 状态看板（`vewf9gYsOF`） |

---

## 2. 本地文档结构

- **[design.md](./design.md)** — **正式设计基线（v1.1）**：完整设计方案、业务领域命令树（第 5 节）、三类凭据双轨认证（第 6 节）、Skills 与 `mcp serve`（第 7 节）、npm 优先/单文件预留技术选型（第 8 节）。
- **[engineering-standards.md](./engineering-standards.md)** — **研发规范与架构护栏（开工必读）**：四层单向依赖、并行防冲突边界、风格规范、禁止 `@types/bun` / `@fastgpt/service` / 原生 addon、鉴权核对、安全脱敏、`--dry-run` / `destructive` 门禁与本地 CI 验证清单。
- **[tasks/README.md](./tasks/README.md)** — **任务依赖 DAG 与认领指引**：说明 `T00` 阻塞依赖及各需求包 / PRD 协作流程。

---

## 3. 需求包 → FR → PRD 全量索引表

| 需求包（飞书 Record） | PRD / 任务单 | 阶段 | 优先级 | 状态 | 覆盖 FR | PRD Record ID | 独占代码目录 | 任务文档 |
|---|---|---|---|---|---|---|---|---|
| **PKG-00** 认证底座与公共运行时 (`reczz28YGuG6P2j0`) | **Phase 0** | Phase 0 | P0 | **已完成** | `FR-001`~`FR-003` | `reczz28YDq8uTJDm` | `cli/src/{shared,infra,domain/{auth,profile,doctor},cli}` | [design.md](./design.md#L459) |
| **PKG-00** 认证底座与公共运行时 (`reczz28YGuG6P2j0`) | **T00** | Phase 0.5 | P0 | **待认领** | `FR-004`~`FR-006` | `reczz28YDq8uUbAc` | `cli/src/{infra/http,infra/ui,infra/fs,shared/{input,pagination}.ts,cli/pipeline.ts}` | [T00-shared-runtime-extensions.md](./tasks/T00-shared-runtime-extensions.md) |
| **PKG-01** 通用 API 逃生口与能力自发现 (`reczz28YGuG6RNyE`) | **T01** | Phase 1 | P0 | 待前置 T00 | `FR-101`~`FR-102` | `reczz28YDq8uU4ot` | `cli/src/{domain/api,infra/cache,cli/commands/api.ts}` | [T01-api-escape-hatch.md](./tasks/T01-api-escape-hatch.md) |
| **PKG-03** 知识库 RAG 全链路 (`reczz28YGuG6QfA7`) | **T02** | Phase 1 | P1 | 待前置 T00 | `FR-301`~`FR-305` | `reczz28YDq8uS2GJ` | `cli/src/{domain/dataset,cli/commands/dataset}` | [T02-domain-dataset.md](./tasks/T02-domain-dataset.md) |
| **PKG-02** 应用、对话与模型核心链路 (`reczz28YGuG6R28N`) | **T03** | Phase 1 | P1 | 待前置 T00 | `FR-201`~`FR-203` | `reczz28YDq8uVFMC` | `cli/src/{domain/chat,cli/commands/chat}` | [T03-domain-chat.md](./tasks/T03-domain-chat.md) |
| **PKG-02** 应用、对话与模型核心链路 (`reczz28YGuG6R28N`) | **T04** | Phase 1 | P1 | 待前置 T00 | `FR-204`~`FR-207` | `reczz28YDq8uSoiE` | `cli/src/{domain/app,cli/commands/app}` | [T04-domain-app.md](./tasks/T04-domain-app.md) |
| **PKG-02** 应用、对话与模型核心链路 (`reczz28YGuG6R28N`) | **T05** | Phase 1 | P1 | 待前置 T00 | `FR-208` | `reczz28YDq8uVwHs` | `cli/src/{domain/model,cli/commands/model.ts}` | [T05-domain-model.md](./tasks/T05-domain-model.md) |
| **PKG-04** 工作流 GitOps 与工具生态 (`reczz28YGuG6RMRm`) | **T06** | Phase 2 | P2 | 待前置 T00 | `FR-401`~`FR-402` | `reczz28YDq8uXqGq` | `cli/src/{domain/workflow,cli/commands/workflow}` | [T06-domain-workflow.md](./tasks/T06-domain-workflow.md) |
| **PKG-04** 工作流 GitOps 与工具生态 (`reczz28YGuG6RMRm`) | **T07** | Phase 2 | P2 | 待前置 T00 | `FR-403`~`FR-404` | `reczz28YDq8uYkYY` | `cli/src/{domain/tool,cli/commands/tool}` | [T07-domain-tool.md](./tasks/T07-domain-tool.md) |
| **PKG-05** MCP 全向集成与平台 AI Skill (`reczz28YGuG6QeIn`) | **T08** | Phase 2 | P2 | 待前置 T00 | `FR-501`~`FR-503` | `reczz28YDq8uZs9H` | `cli/src/{domain/mcp,cli/commands/mcp}` | [T08-domain-mcp.md](./tasks/T08-domain-mcp.md) |
| **PKG-05** MCP 全向集成与平台 AI Skill (`reczz28YGuG6QeIn`) | **T09** | Phase 2 | P2 | 待前置 T00 | `FR-504` | `reczz28YDq8ua7KK` | `cli/src/{domain/skill,cli/commands/skill}` | [T09-domain-skill.md](./tasks/T09-domain-skill.md) |
| **PKG-06** 团队治理、管理后台与 Agent 赋能 (`reczz28YGuG6RmrU`) | **T10** | Phase 3 | P3 | 待前置 T00 | `FR-601`~`FR-603` | `reczz28YDq8uXEJb` | `cli/src/{domain/{team,admin},cli/commands/{team,admin}}` | [T10-domain-team-and-admin.md](./tasks/T10-domain-team-and-admin.md) |
| **PKG-06** 团队治理、管理后台与 Agent 赋能 (`reczz28YGuG6RmrU`) | **T11** | Phase 3 | P3 | 待前置 T00 | `FR-604`~`FR-605` | `reczz28YDq8uWbOm` | `cli/skills`, `cli/src/{domain/skills,infra/fs/skill-installer.ts,cli/commands/skills.ts}`, `cli/scripts/check-command-drift.ts` | [T11-agent-skills-and-ci-drift.md](./tasks/T11-agent-skills-and-ci-drift.md) |

---

## 4. 状态同步约定

1. 认领需求包或具体 PRD 时，在飞书多维表格 [需求包](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc?table=tbltZMVyb9WKXFw5) / [PRD 开发任务单](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc?table=tblsOxwpSdMPxncf) 填写`负责人`并同步更新`FR 功能需求`对应记录的`状态`，同时在本仓库对应 `tasks/Txx-*.md` 与本索引表同步状态。
2. 当 `T00` 合入后，将 `T01`~`T11`、`PKG-01`~`PKG-06` 及对应 `FR-101`~`FR-605` 的状态统一由 `待前置 T00` 切换为 `待认领`。
3. PR 创建或合入时，同步回填飞书 `PRD 开发任务单` 的`PR 链接`并切换为`PR评审中` / `已完成`。
