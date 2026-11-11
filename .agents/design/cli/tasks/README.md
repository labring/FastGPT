# FastGPT CLI 任务拆解看板（Tasks）

> 总索引：[../index.md](../index.md) · 正式设计基线：[../design.md](../design.md) · 研发红线（必读）：[../engineering-standards.md](../engineering-standards.md)
> 飞书同步看板：[FastGPT CLI 任务分配与进度看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)（Base: `L8MsbBBOiaVIzdsfwa1cF78UnGc` / Table: `tblsOxwpSdMPxncf` / 看板视图: `vewf9gYsOF`）
>
> 本文档面向多人 / 多 Agent 并行认领：**先合入 `T00` 公共运行时扩展，之后 `T01` ~ `T11` 按业务域严格隔离目录，可独立分支并行开发与提交 PR。**

---

## 1. 依赖拓扑（DAG）

```text
Phase 0（已完成：labring/FastGPT#8334）
  whoami 服务端接口 + cli/ 认证底座
         │
         ▼
  [T00] 公共运行时扩展（HTTP SSE/Multipart/下载 + dry-run + 破坏性确认 + 文件入参 + 表格/列表渲染）
         │
         ├──────────────────────────────────────────────────────────┐
         ▼                                                          ▼
Phase 1（P0 收尾 & P1 高频域，全员可并行）                      Phase 2/3（可并行，依赖 T00）
  ├── [T01] api 通用逃生口（api <method> <path> + schema）       ├── [T06] workflow 域（复用 workflow-cli + 云端同步）
  ├── [T02] dataset 知识库全链路                                ├── [T07] tool 域（工具集 / HTTP 工具 / 插件）
  ├── [T03] chat 对话（含 SSE 流式）与历史管理                    ├── [T08] mcp 域（外部 MCP / MCP Server / mcp serve）
  ├── [T04] app 应用、版本、发布渠道、日志与评测                    ├── [T09] skill 域（平台 AI Skill 与沙盒调试）
  └── [T05] model 模型查询与连通性测试                           ├── [T10] team & admin 域
                                                                └── [T11] skills 技能包分发 + OpenAPI 漂移 CI 门禁
```

> 注：`T08` 中的 `fastgpt mcp serve` 依赖全量命令 `registry` 的最终稳定性，建议先实现 `mcp tool` / `mcp server` 与基于 `CliCommandSpec` 的通用 `mcp serve` 框架，后续新域注册后自动暴露。`T11` 的 `fastgpt skills` 内容随各域逐步定稿同步补全。

---

## 2. 任务总览表

| 编号 | 模块 / 领域 | 优先级 | 状态 | 前置依赖 | 飞书 Record ID | 独占代码目录（防冲突） | 详细文档 |
|---|---|---|---|---|---|---|---|
| **T00** | 公共运行时扩展 | **P0（阻塞）** | 待认领 | Phase 0 | `reczz28YDq8uUbAc` | `infra/http/`, `infra/ui/`, `infra/fs/`, `cli/pipeline.ts`, `shared/{input,pagination}.ts` | [T00-shared-runtime-extensions.md](./T00-shared-runtime-extensions.md) |
| **T01** | `api` 通用逃生口 | **P0** | 待前置 T00 | T00 | `reczz28YDq8uU4ot` | `domain/api/`, `infra/cache/`, `cli/commands/api.ts` | [T01-api-escape-hatch.md](./T01-api-escape-hatch.md) |
| **T02** | `dataset` 知识库域 | **P1** | 待前置 T00 | T00 | `reczz28YDq8uS2GJ` | `domain/dataset/`, `cli/commands/dataset/` | [T02-domain-dataset.md](./T02-domain-dataset.md) |
| **T03** | `chat` 对话与历史域 | **P1** | 待前置 T00 | T00 | `reczz28YDq8uVFMC` | `domain/chat/`, `cli/commands/chat/` | [T03-domain-chat.md](./T03-domain-chat.md) |
| **T04** | `app` 应用与发布域 | **P1** | 待前置 T00 | T00 | `reczz28YDq8uSoiE` | `domain/app/`, `cli/commands/app/` | [T04-domain-app.md](./T04-domain-app.md) |
| **T05** | `model` 模型域 | **P1** | 待前置 T00 | T00 | `reczz28YDq8uVwHs` | `domain/model/`, `cli/commands/model.ts` | [T05-domain-model.md](./T05-domain-model.md) |
| **T06** | `workflow` 工作流域 | **P2** | 待前置 T00 | T00(参考 T04) | `reczz28YDq8uXqGq` | `domain/workflow/`, `cli/commands/workflow/` | [T06-domain-workflow.md](./T06-domain-workflow.md) |
| **T07** | `tool` 工具与插件域 | **P2** | 待前置 T00 | T00 | `reczz28YDq8uYkYY` | `domain/tool/`, `cli/commands/tool/` | [T07-domain-tool.md](./T07-domain-tool.md) |
| **T08** | `mcp` 域（含 `mcp serve`） | **P2** | 待前置 T00 | T00 | `reczz28YDq8uZs9H` | `domain/mcp/`, `cli/commands/mcp/` | [T08-domain-mcp.md](./T08-domain-mcp.md) |
| **T09** | `skill` 平台 AI Skill 域 | **P2** | 待前置 T00 | T00 | `reczz28YDq8ua7KK` | `domain/skill/`, `cli/commands/skill/` | [T09-domain-skill.md](./T09-domain-skill.md) |
| **T10** | `team` & `admin` 域 | **P3** | 待前置 T00 | T00 | `reczz28YDq8uXEJb` | `domain/team/`, `domain/admin/`, `cli/commands/team/`, `cli/commands/admin/` | [T10-domain-team-and-admin.md](./T10-domain-team-and-admin.md) |
| **T11** | `skills` Agent 包 & 漂移门禁 | **P3** | 待前置 T00 | T00, T01~T05 | `reczz28YDq8uWbOm` | `skills/`, `domain/skills/`, `cli/commands/skills.ts`, `scripts/` | [T11-agent-skills-and-ci-drift.md](./T11-agent-skills-and-ci-drift.md) |

---

## 3. 认领与协作流程（给所有协作者）

1. **开始前必读**：先阅读 [../engineering-standards.md](../engineering-standards.md)，确认架构分层、代码风格、鉴权核查方法与编译约束。
2. **每 Task 一个独立 PR**：从最新 `main`（或合入 `T00` 后的集成分支）切出分支 `feat/cli-<task-slug>`；不要在一个 PR 里混改多个未认领域。
3. **核对服务端真实接口**：各 Task 文档中已给出核心 OpenAPI 路径对照，但在写 `authModes` 和入参 Schema 前，务必对照 `projects/app/src/pages/api/**` 与 `packages/global/openapi/**` 复核最新字段。
4. **避免共享文件合并冲突**：
   - `container.ts` / `registry.ts` / `program.ts` 只按字母序追加自己负责域的 1~3 行注册代码。
   - 不要顺手修改 `auth` / `config` / `doctor` 等已完成域，除非 `T00` 明确范围。
5. **PR 合入标准**：必须带单测（覆盖鉴权拦截、`--dry-run`、非 TTY `--yes` 校验、text/json 输出），并通过 `engineering-standards.md` 第 5 节全套本地校验。
