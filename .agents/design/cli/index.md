# FastGPT CLI（`@fastgpt/cli`）文档与协同索引

> 本索引文件是 FastGPT CLI 设计、研发规范、任务拆解与飞书协同看板的统一导航入口；后续任何架构演进或任务状态变更，均同步维护此处与飞书多维表格。

---

## 1. 协同与外部入口

| 资源 | 标识 / 链接 | 用途 |
|---|---|---|
| **飞书设计方案（正式基线 v1.0）** | [FastGPT CLI 设计方案](https://fael3z0zfze.feishu.cn/docx/GK3LdwUfEon2T8xTC9kcADohn6d)（Token: `GK3LdwUfEon2T8xTC9kcADohn6d`） | 对齐背景、四层架构、命令面、双轨认证、技术选型与里程碑 |
| **飞书任务多维表格（调度看板）** | [FastGPT CLI 任务分配与进度看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)（Base: `L8MsbBBOiaVIzdsfwa1cF78UnGc` / Table: `tblsOxwpSdMPxncf` / 看板: `vewf9gYsOF`） | 任务认领、负责人指派、状态流转（表格视图 + 状态看板视图）与 PR 关联 |
| **前置与底座 Draft PR** | [labring/FastGPT#8334](https://github.com/labring/FastGPT/pull/8334) | 服务端 `whoami` 接口 + `@fastgpt/cli` 认证底座与双路构建（Phase 0） |
| **本地包目录** | [cli/](../../../cli/) | `@fastgpt/cli` 源码、单测、`tsdown` / `bun` 构建脚本 |

---

## 2. 本地文档结构

- **[design.md](./design.md)** — **正式设计基线（v1.0）**：完整设计方案、业务领域命令树（第 5 节）、三类凭据双轨认证（第 6 节）、Skills 与 `mcp serve`（第 7 节）、npm 优先/单文件预留技术选型（第 8 节）。
- **[engineering-standards.md](./engineering-standards.md)** — **研发规范与架构护栏（开工必读）**：四层单向依赖、并行防冲突边界、风格规范、禁止 `@types/bun` / `@fastgpt/service` / 原生 addon、鉴权核对、安全脱敏、`--dry-run` / `destructive` 门禁与本地 CI 验证清单。
- **[tasks/README.md](./tasks/README.md)** — **任务依赖 DAG 与认领指引**：说明 `T00` 阻塞依赖及各业务域 PR 拆分协作流程。

---

## 3. 全量任务索引表（本地任务单 ↔ 飞书多维表格映射）

| 编号 | 阶段 | 优先级 | 状态 | 前置依赖 | 飞书 Record ID | 独占代码目录 | 任务文档 |
|---|---|---|---|---|---|---|---|
| **Phase 0** | Phase 0 | P0 | **已完成** | 无 | `reczz28YDq8uTJDm` | `src/{shared,infra,domain/{auth,profile,doctor},cli}` | [design.md](./design.md#L459) |
| **T00** | Phase 0.5 | P0 | **待认领** | Phase 0 | `reczz28YDq8uUbAc` | `src/{infra/http,infra/ui,infra/fs,shared/{input,pagination}.ts,cli/pipeline.ts}` | [T00-shared-runtime-extensions.md](./tasks/T00-shared-runtime-extensions.md) |
| **T01** | Phase 1 | P0 | 待前置 T00 | T00 | `reczz28YDq8uU4ot` | `src/{domain/api,infra/cache,cli/commands/api.ts}` | [T01-api-escape-hatch.md](./tasks/T01-api-escape-hatch.md) |
| **T02** | Phase 1 | P1 | 待前置 T00 | T00 | `reczz28YDq8uS2GJ` | `src/{domain/dataset,cli/commands/dataset}` | [T02-domain-dataset.md](./tasks/T02-domain-dataset.md) |
| **T03** | Phase 1 | P1 | 待前置 T00 | T00 | `reczz28YDq8uVFMC` | `src/{domain/chat,cli/commands/chat}` | [T03-domain-chat.md](./tasks/T03-domain-chat.md) |
| **T04** | Phase 1 | P1 | 待前置 T00 | T00 | `reczz28YDq8uSoiE` | `src/{domain/app,cli/commands/app}` | [T04-domain-app.md](./tasks/T04-domain-app.md) |
| **T05** | Phase 1 | P1 | 待前置 T00 | T00 | `reczz28YDq8uVwHs` | `src/{domain/model,cli/commands/model.ts}` | [T05-domain-model.md](./tasks/T05-domain-model.md) |
| **T06** | Phase 2 | P2 | 待前置 T00 | T00（参考 T04） | `reczz28YDq8uXqGq` | `src/{domain/workflow,cli/commands/workflow}` | [T06-domain-workflow.md](./tasks/T06-domain-workflow.md) |
| **T07** | Phase 2 | P2 | 待前置 T00 | T00 | `reczz28YDq8uYkYY` | `src/{domain/tool,cli/commands/tool}` | [T07-domain-tool.md](./tasks/T07-domain-tool.md) |
| **T08** | Phase 2 | P2 | 待前置 T00 | T00 | `reczz28YDq8uZs9H` | `src/{domain/mcp,cli/commands/mcp}` | [T08-domain-mcp.md](./tasks/T08-domain-mcp.md) |
| **T09** | Phase 2 | P2 | 待前置 T00 | T00 | `reczz28YDq8ua7KK` | `src/{domain/skill,cli/commands/skill}` | [T09-domain-skill.md](./tasks/T09-domain-skill.md) |
| **T10** | Phase 3 | P3 | 待前置 T00 | T00 | `reczz28YDq8uXEJb` | `src/{domain/{team,admin},cli/commands/{team,admin}}` | [T10-domain-team-and-admin.md](./tasks/T10-domain-team-and-admin.md) |
| **T11** | Phase 3 | P3 | 待前置 T00 | T00, T01~T05 | `reczz28YDq8uWbOm` | `cli/skills`, `cli/src/{domain/skills,infra/fs/skill-installer.ts,cli/commands/skills.ts}`, `cli/scripts/check-command-drift.ts` | [T11-agent-skills-and-ci-drift.md](./tasks/T11-agent-skills-and-ci-drift.md) |

---

## 4. 状态同步约定

1. 认领某个任务时，先在飞书多维表格 [CLI 开发任务](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc) 填写`负责人`并将`状态`改为`开发中`，同时在本仓库对应 `tasks/Txx-*.md` 头部与本索引表同步状态。
2. 当 `T00` 合入后，将 `T01`~`T11` 在飞书表格与本地任务单的状态统一由 `待前置 T00` 切换为 `待认领`。
3. PR 创建或合入时，同步回填飞书多维表格的`PR 链接`并切换为`PR评审中` / `已完成`。
