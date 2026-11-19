# 切片粒度、WIP=1 合龙锁与多 Agent 并行推进指南

## 1. 表规模分级与切片策略

始终以 `node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --list --asc` 的实时扫描结果为准（覆盖 `packages/service` 与 `pro/admin` 全部 ~77 个 Mongo Schema/Model 文件，含 `schemaV2.ts`、`ttl.ts` 等非标准命名；**已自动排除范围外的 `dataset/image/schema.ts` GridFS 历史遗留与 `projects/marketplace`**）：

| 分级 | 判定条件 | 规模分布 | 切片策略 |
| --- | --- | --- | --- |
| **常规切片（1-Slice）** | 非测试/非迁移调用文件 `<= 20` 个 | ~80%（约 59 个待迁 Schema） | **单切片直接清零**：1 个 PR/Commit 内写完双库实现 + 全套测试（契约 + L0 Service 单测 + 特征专项）+ 迁完主仓、`pro` 与测试夹具全部调用方 + **物理删除旧 Schema 文件**。 |
| **超级大表（Micro-Slices）** | 非测试/非迁移调用文件 `> 20` 个（如 `MongoAIModel`、`MongoApp`、`MongoDatasetData`、`MongoUser`、`MongoTeamMember`、`MongoDataset`、`MongoTeam`、`MongoDatasetCollection`、`MongoResourcePermission` 等约 16 个 Schema） | ~20%（约 16 个 Schema） | 先过该核心域 **ER 拆表评审**，再拆为连续 **2~5 个微切片** 便于深度 Review，同时严格受 **WIP=1 合龙锁** 约束。 |

### 超级大表微切片拆分模版

- **Slice 0（仅核心大域需拆子表时）**：在开始编码前先集中确认该域命中四信号法则的 ER 拆表方案（例如 `dataset_data_indexes`、`dataset_collection_tags`、`app_published_resources`），避免各子切片各拆各的。
- **Slice 1（灵魂设计切片，单独深度 Review）**：
  - 交付：`repo.type.ts` + `mongo/schema.ts & repo.ts` + `sql/table.ts & repo.ts` + `repo.ts`（Token）+ `service.ts` 骨架 + **多方言契约测试 + L0 Service 单测 + 按特征必补的专项测试**（Phase 0.5 版本化迁移器落地后同步附带版本化 Migration）；
  - 过渡方式：暂留原旧 `schema.ts`，但其内部直接委托调用新 `mongo/schema.ts` 的惰性模型工厂（绝不保留两套独立 `new Schema()` 定义），**本切片不修改上层数十个业务调用方**，验证时传 `--allow-wip-slice1`；
  - Review 重点：聚焦方法收敛质量、`sql/table.ts` OB/MySQL 优先建模、哨兵唯一索引、多层级测试覆盖度。
- **Slice 2 ~ N（纯消费迁移切片，每片 10~15 个调用文件）**：
  - 按目录批次迁移：`packages/service` 调用方 -> `projects/app` API 路由 -> `pro/admin` 调用方 -> `test/datas/` 及相关测试夹具脱 Mongo（跨未迁移表混合事务遵循自底向上顺序，使用 `bridgeClientSessionToDbSession` 桥接）；
  - 最后一个切片必须 **物理删除旧 `schema.ts`（含伙伴 Schema 与旧 `entity.ts`）**，运行不带 `--allow-wip-slice1` 的 `verify-domain.mjs --git-legacy merge-base:<旧路径...>`、`tsc --noEmit` 与 `audit-domain.mjs --status` 清零收尾（确保生产代码与非 `migration/` 测试文件均零残留旧 Model）。

### WIP=1 全局合龙锁

`audit-domain.mjs --status` 会扫描全仓是否存在“同一业务域下同时存在 `mongo/schema.ts` 与同目录旧版 Mongo Schema/Model 文件”的未合龙状态。
- **规则**：只要存在 `>= 1` 个未合龙域，必须先把它的 Slice 2..N 推进到旧 Schema 彻底删除且旧 `Mongo*` 生产与测试夹具引用清零，**禁止开启任何其他表的重构**。

## 2. 多 Agent / Subagent / Workflow 并行切分规范

当并行批量推进多张 **彼此无外键或调用重叠的小表（调用点 `<= 5` 或 `6~15` 个文件）** 时，按以下边界防止冲突：

1. **先跑升序排行榜锁定独立目标**：
   运行 `audit-domain.mjs --list --asc --max-callers 15`，选出 N 个位于不同子域且无同目录 `Sibling(s)` 缠绕的表；分别运行 `audit-domain.mjs --model <M> --include-tests` 交叉核对 `Caller Files`（含测试夹具如 `test/datas/users.ts`）集合交集为空，特别检查共享删除级联入口或共享权限文件是否撞车。
2. **独立分支 / Worktree 隔离编辑**：
   每个 Worker（`invoke_subagent` 或 `swarm`）使用独立隔离工作区（`workspace: 'share'` / `'branch'`），在各自切片内运行 `verify-domain.mjs --git-legacy merge-base:<path> --test <契约+Service+受影响业务测试>`。
3. **共享清单文件独占原则（防 Merge 冲突）**：
   - Worker **严禁**读取或修改 `.agents/design/common/dal/multi-db-repository-architecture.md` 等全局共享文档（以及全局集中式 Schema Registry / Migration 序号索引，若存在则交由 Coordinator 合并后统一登记）；
   - 由协调者（Coordinator）在合并所有 Worker 的代码切片后，统一执行 `node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status` 核对进度并统一更新设计文档 TODO。
