# FastGPT CLI 任务拆解看板（Tasks）

> 总索引：[../index.md](../index.md) · 正式设计基线：[../design.md](../design.md) · 研发红线（必读）：[../engineering-standards.md](../engineering-standards.md)
> 飞书同步看板：[FastGPT CLI 任务分配与进度看板](https://fael3z0zfze.feishu.cn/base/L8MsbBBOiaVIzdsfwa1cF78UnGc)（三表关联：9 `需求包` `tbltZMVyb9WKXFw5` ↔ 44 `FR 功能需求` `tblNyRRtu9OoC9c4` ↔ 24 `PRD 交付清单` `tblsOxwpSdMPxncf`，全部默认按需求包可折叠分组）
>
> 本文档面向多人 / 多 Agent 并行认领：**`PRD-00.1`（`#8334`）与 `T00` 公共运行时基础（`#8219`、`#8358`）及 `workflow-cli` 合并（`#8391`）均已合入 `main`，各待认领 PRD 可直接基于最新 `origin/main` 隔离目录并行开发与提交 PR。**

---

## 1. 依赖拓扑（DAG）

```text
Phase 0（已完成：#8334）
  whoami 服务端接口 + cli/ 认证底座
         │
         ▼
  [T00] 公共运行时扩展（已完成：#8219 / #8358，含 requestRaw/uploadMultipart/streamSse、dry-run、破坏性门禁、--file/--stdin、分页与 --compact）
         │
         ├──────────────────────────────────────────────────────────┐
         ▼                                                          ▼
Phase 1（P0 收尾 & P1 高频域，大部分已合入或本批次收口）        Phase 2/3（按域并行）
  ├── [T01] api 通用逃生口（本批次开发中）                       ├── [T06] workflow & workflow-build（已完成：#8391）
  ├── [T02] dataset 知识库（21 命令已完成：#8219/#8358）         ├── [T07] tool（plugin tool list 已完成：#8391）
  ├── [T03] chat 对话与反馈（run/history/record 已合入；feedback 本批次） ├── [T08] mcp 域（待认领）
  ├── [T04] app（list/pull/save/publish/test 已合入；logs 本批次） ├── [T09] skill（code-sandbox 已合入；平台 skill 待认领）
  └── [T05] model（model list 已合入：#8358）                    ├── [T10] team & admin 域（待认领）
                                                                 └── [T11] skills 5 套官方包 & 漂移门禁（本批次已完成）
```

> 注：`T08` 中的 `fastgpt mcp serve` 复用 `CliCommandSpec` registry 暴露只读工具；`T11` 已建立 `cli/scripts/check-command-drift.ts` 门禁，任何后续 PR 增删命令或调整架构分层时须保持 `check:drift` 通过。

---

## 2. 任务总览表

| 编号 | 所属需求包 | 细粒度 PRD 拆分（Record ID） | 覆盖 FR | 模块 / 领域 | 优先级 | 状态 | 前置依赖 | 详细文档 |
|---|---|---|---|---|---|---|---|---|
| **T00** | `PKG-00` | `PRD-00.2` 公共运行时扩展 (`reczz28YDq8uUbAc`) | `FR-004`~`FR-006` | 运行时底座 | **P0** | **已完成 (`#8219`/`#8358`)** | Phase 0 | [T00-shared-runtime-extensions.md](./T00-shared-runtime-extensions.md) |
| **T01** | `PKG-01` | `PRD-01.1` (`reczz28YDq8uU4ot`)、`PRD-01.2` (`reczz28Yb9VZy6Gh`) | `FR-101`~`FR-104` | `api` 通用逃生口 | **P0** | **开发中（本批次）** | T00 | [T01-api-escape-hatch.md](./T01-api-escape-hatch.md) |
| **T02** | `PKG-02` | `PRD-02.1` (`reczz28YDq8uS2GJ`)、`PRD-02.2` (`reczz28Yb9VZxWTm`)、`PRD-02.3` (`reczz28Yb9VZyQJb`) | `FR-201`~`FR-207` | `dataset` 知识库域 | **P1** | **部分完成**（`PRD-02.1`/`02.2`/`data` 已合入 `#8219`/`#8358`；`train`/`tag`/`synonym` 待认领） | T00 | [T02-domain-dataset.md](./T02-domain-dataset.md) |
| **T03** | `PKG-04` | `PRD-04.1` (`reczz28YDq8uVFMC`)、`PRD-04.2` (`reczz28Yb9VZvjGm`) | `FR-401`~`FR-404` | `chat` 对话、历史与反馈 | **P1** | **已完成/收口**（`#8219` 合入对话/历史/记录；`feedback update` 本批次补齐） | T00 | [T03-domain-chat.md](./T03-domain-chat.md) |
| **T04** | `PKG-03` | `PRD-03.1` (`reczz28YDq8uSoiE`)、`PRD-03.2` (`reczz28Yb9VZvO3d`)、`PRD-03.3` (`reczz28Yb9VZvwlh`) | `FR-301`~`FR-306` | `app` 应用、发布与日志 | **P1** | **部分完成**（`list`/`pull`/`save`/`publish`/`test`/`run` 已合入 `#8391`；`logs` 本批次；`eval`/`version`/`channel` 待认领） | T00 | [T04-domain-app.md](./T04-domain-app.md) |
| **T05** | `PKG-04` | `PRD-04.3` (`reczz28YDq8uVwHs`) | `FR-405`~`FR-406` | `model` 模型域 | **P1** | **部分完成**（`model list` 已合入 `#8358`；连通性探测待认领） | T00 | [T05-domain-model.md](./T05-domain-model.md) |
| **T06** | `PKG-05` | `PRD-05.1` (`reczz28YDq8uXqGq`)、`PRD-05.2` (`reczz28Yb9VZyRfd`) | `FR-501`~`FR-503` | `workflow` & `workflow-build` | **P2** | **已完成 (`#8391`)** | T00 | [T06-domain-workflow.md](./T06-domain-workflow.md) |
| **T07** | `PKG-06` | `PRD-06.1` (`reczz28YDq8uYkYY`) | `FR-601`~`FR-602` | `tool` / `plugin` 工具域 | **P2** | **部分完成**（`plugin tool list` 已合入 `#8391`；工具集管理待认领） | T00 | [T07-domain-tool.md](./T07-domain-tool.md) |
| **T08** | `PKG-06` | `PRD-06.2` (`reczz28YDq8uZs9H`)、`PRD-06.3` (`reczz28Yb9VZwDBo`) | `FR-603`~`FR-605` | `mcp` 域（含 `mcp serve`） | **P2** | **待认领** | T00 | [T08-domain-mcp.md](./T08-domain-mcp.md) |
| **T09** | `PKG-07` | `PRD-07.1` (`reczz28YDq8ua7KK`) | `FR-701`~`FR-702` | `skill` / `code-sandbox` 域 | **P2** | **部分完成**（`code-sandbox packages` 已合入 `#8391`；平台 `skill` 命令待认领） | T00 | [T09-domain-skill.md](./T09-domain-skill.md) |
| **T10** | `PKG-08` | `PRD-08.1` (`reczz28YDq8uXEJb`)、`PRD-08.2` (`reczz28Yb9VZxMy3`)、`PRD-08.3` (`reczz28Yb9VZy9ZQ`) | `FR-801`~`FR-803` | `team` & `admin` 域 | **P3** | **待认领** | T00 | [T10-domain-team-and-admin.md](./T10-domain-team-and-admin.md) |
| **T11** | `PKG-07` | `PRD-07.2` (`reczz28YDq8uWbOm`)、`PRD-07.3` (`reczz28Yb9VZyUjj`) | `FR-703`~`FR-704` | `skills` Agent 包 & 漂移门禁 | **P3** | **已完成（本批次）** | T00, Phase 1 | [T11-agent-skills-and-ci-drift.md](./T11-agent-skills-and-ci-drift.md) |

---

## 3. 认领与协作流程（给所有协作者）

1. **开始前必读**：先阅读 [../engineering-standards.md](../engineering-standards.md)，确认架构分层、代码风格、鉴权核查方法与编译约束。
2. **每 Task 一个独立 PR**：从最新 `origin/main` 切出分支 `feat/cli-<task-slug>`；不要在一个 PR 里混改多个未认领域。
3. **核对服务端真实接口**：各 Task 文档中已给出核心 OpenAPI 路径对照，但在写 `authModes` 和入参 Schema 前，务必对照 `projects/app/src/pages/api/**` 与 `packages/global/openapi/**` 复核最新字段。
4. **避免共享文件合并冲突**：
   - `container.ts` / `registry.ts` / `program.ts` 只按字母序追加自己负责域的 1~3 行注册代码。
   - 不要顺手修改 `auth` / `config` / `doctor` 等已完成域，除非 `T00` 明确范围。
5. **PR 合入标准**：必须带单测（覆盖鉴权拦截、`--dry-run`、非 TTY `--yes` 校验、text/json 输出），并通过 `engineering-standards.md` 第 5 节全套本地校验与 `pnpm --filter @fastgpt/cli check:drift`。
