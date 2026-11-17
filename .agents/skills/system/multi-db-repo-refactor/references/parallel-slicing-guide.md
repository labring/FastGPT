# 切片粒度、WIP=1 合龙锁与多 Agent 并行推进指南

## 1. 表规模分级与切片策略

全仓 82 个 `Mongo*` 模型按受影响调用文件数分为两类：

| 分级 | 判定条件 | 占比 | 切片策略 |
| --- | --- | --- | --- |
| **常规切片（1-Slice）** | 非测试/非迁移调用文件 `<= 20` 个 | ~90%（74 张表） | **单切片直接清零**：1 个 PR/Commit 内写完双库实现 + 双库契约单测 + 迁完主仓与 `pro` 全部调用方 + **物理删除旧 `schema.ts`**。 |
| **超级大表（Micro-Slices）** | 非测试/非迁移调用文件 `> 20` 个（如 `MongoApp` 63、`MongoUser` 58、`MongoTeamMember` 57、`MongoTeam` 44、`MongoDataset` 42 等 8 张表） | ~10%（8 张表） | 拆为连续 **2~4 个微切片** 便于深度 Review，同时受 **WIP=1 合龙锁** 约束。 |

### 超级大表微切片拆分模版

- **Slice 1（灵魂设计切片，单独深度 Review）**：
  - 交付：`repo.type.ts` + `mongo/schema.ts & repo.ts` + `sql/table.ts & repo.ts` + `repo.ts`（Token）+ `service.ts` 骨架 + 双库契约测试（`Mongo + PGlite`）；
  - 过渡方式：暂留原旧 `schema.ts`，但其内部直接委托调用新 `mongo/schema.ts` 的惰性模型工厂（绝不保留两套独立 `new Schema()` 定义），**本切片不修改上层数十个业务调用方**；
  - Review 重点：聚焦方法收敛质量、`sql/table.ts` 建模、哨兵唯一索引、双库契约覆盖度。
- **Slice 2 ~ N（纯消费迁移切片，每片 10~15 个调用文件）**：
  - 按目录批次迁移：`packages/service` 调用方 -> `projects/app` API 路由 -> `pro/admin` 调用方；
  - 最后一个切片必须 **物理删除旧 `schema.ts` 与旧 `entity.ts`**，运行 `verify-domain.mjs`（不带 `--allow-wip-slice1`）、`tsc --noEmit` 与 `audit-domain.mjs --status` 清零收尾。

### WIP=1 全局合龙锁

`audit-domain.mjs --status` 会扫描全仓是否存在“同一业务域下同时存在 `mongo/schema.ts` 与旧版 `*schema.ts`”的未合龙状态。
- **规则**：只要存在 `>= 1` 张未合龙超级大表，必须先把它的 Slice 2..N 推进到旧 `schema.ts` 彻底删除，**禁止开启任何其他表的重构**。

## 2. 多 Agent / Subagent / Workflow 并行切分规范

当并行批量推进多张 **彼此无外键或调用重叠的小表（调用点 `<= 5` 或 `6~15` 个文件）** 时，按以下边界防止冲突：

1. **先跑排行榜锁定独立目标**：
   运行 `audit-domain.mjs --list`，选出 N 个位于不同子域且调用文件集合互不相交的表（分别单独跑 `audit-domain.mjs --model <M>` 交叉核对文件列表交集为空）。
2. **独立分支 / Worktree 隔离编辑**：
   每个 Worker（`invoke_subagent` 或 `swarm`）使用独立隔离工作区（`workspace: 'share'` / `'branch'`），在各自的切片内运行 `verify-domain.mjs` 与局部单测。
3. **共享清单文件独占原则（防 Merge 冲突）**：
   - Worker **严禁**直接修改 `.agents/design/common/dal/multi-db-repository-architecture.md` 等全局共享文档；
   - 由协调者（Coordinator）在合并所有 Worker 的代码切片后，统一执行 `node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status` 核对进度并统一更新设计文档 TODO。
