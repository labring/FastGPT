---
name: multi-db-repo-refactor
description: >-
  Guides end-to-end refactoring of FastGPT MongoDB models and raw Mongoose queries into dual-family
  Domain Repositories (mongo + portable Kysely sql for PostgreSQL/OceanBase/MySQL) with Zod read
  normalization, DI tokens, constructor-injected Services, and dual-dialect PGlite/Mongo contract
  tests. Use when refactoring a collection/table, designing repo.type.ts or sql/table.ts, auditing
  callers, checking multi-DB refactor progress, or planning parallel slices.
---

# FastGPT 多数据库领域仓储重构 SOP

本技能将“把裸 `Mongo*` 调用收口为 `mongo/ + sql/` 双族领域仓储（通吃 MongoDB、PostgreSQL、OceanBase、MySQL 8+）”标准化为可验证的 6 步流水线。

## 上下文按需加载（禁止开局全量硬塞大文档）

- **必读规范**：动手改代码前先读 [FastGPT 代码规范](../../../code/syntax.md)；
- **Step 2 建模按需读**：[深水区建模食谱](references/deep-water-recipes.md)（四信号拆表、SQL 禁用表、`FOR UPDATE SKIP LOCKED`、6 项契约矩阵）；
- **大表 / 多 Agent 并行按需读**：[并行切片指南](references/parallel-slicing-guide.md)；
- **架构总纲仅兜底/收尾读**：[设计总纲](../../../design/common/dal/multi-db-repository-architecture.md)（共 900+ 行，**禁止开局全文通读**；仅在遇到罕见 DAL 运行时疑问或全部合龙后勾选最终 TODO 时局部查阅，并行 Worker 严禁修改该文件）。

## 硬性前提（WIP=1 锁 & 全仓一刀切）

1. **WIP=1 大表合龙锁**：先跑进度脚本。**只要存在任何尚未合龙删除旧 Schema/Model 文件的在途域，严禁开启任何新表重构！**
2. **同表跨 `pro` 一刀切**：同一张表的重构周期内必须同步改完 `packages/`、`projects/` 与 `pro/admin/` 全部调用方并删除旧 Schema 文件，不留过渡残余。
3. **垂直端到端一步到位**：当场写完 `repo.type.ts` + `mongo/` + `sql/`（独立 `log` 表附加 `noop/`）+ **Mongo & PGlite 双库契约单测**，严禁只写单方言半成品。

## 标准 6 步工作流

### Step 0：检查全局进度与 WIP=1 锁

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status
```

需要挑选影响面最小的切入表时，按调用方升序筛选小表：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --list --asc --max-callers 5
```

### Step 1：一次性全仓调用面 X 光侦察

使用 `--usages` 一次拉出全部调用文件、行号与链式查询片段，避免逐个文件盲翻浪费上下文：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --model <MongoModelName> --usages
# 或按 schema/model 文件路径扫描（兼容 schemaV2.ts、ttl.ts 等非标准命名）：
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --schema <path/to/file.ts> --usages
```

重点核查脚本输出的 6 项情报：
- `datasource`：`main`（`getMongoModel`）或 `log`（`getMongoLogModel`，必须补 `noop/repo.ts` 与 `defineLogRepoToken`）；
- `Sibling(s)`：同目录是否存在伙伴 Schema（如 `evalSchema + evalItemSchema`、`usage/schema + usageItemSchema`）——动手前先定好「按子目录 1:1 拆独立 Repo」还是「合并进同一 `mongo/schema.ts`」；
- `Indexes`：全部 `defineIndex`（含 `deprecated: true` 历史索引、显式 `name`、`unique`、`partialFilterExpression`、数值或 `'15d'` 字符串 `expires` TTL），迁移后一条、一项关键 option 都不能丢；
- 是否含 `deleteTime` 软删除、TTL 或 `.watch()` Change Stream；
- 主仓与 `pro/admin` 全部调用片段与高危算子（`aggregate`、`bulkWrite`、`findOneAndUpdate`、`sort`、`$elemMatch`、`mongoSessionRun`）；
- **切片策略**：调用文件 `<= 20` 个 -> **单切片直接清零**；`> 20` 个 -> **超级大表微切片**（读 [并行切片指南](references/parallel-slicing-guide.md)）。

### Step 2：深度建模审视（写代码前先输出《Repo Design Brief》）

禁止把业务里的 `.find()` 机械翻译成贫血 Repo。结合 [深水区建模食谱](references/deep-water-recipes.md) 先给出简短审视结论：

1. **方法收敛（反贫血）**：识别共用窄投影（`.pick()` 窄 DTO）与循环 N+1 查询，按业务意图收敛为正交语义方法；
2. **四信号拆表法则**：禁止按 JSON 嵌套层数一刀切；仅命中「进 WHERE/ORDER BY/反查」「高频并发局部更新/CAS」「数组无上限增长」「跨行聚合/`$inc`」之一才拆列或子表；
3. **纯可移植 B-Tree SQL**：禁用 `ARRAY[]`、GIN/GIST、部分唯一索引、`ILIKE`、`RETURNING` 与 JSON 路径查询；层级用 `ancestor_path`，模糊匹配用 `this.caseInsensitiveLike`，纯读查询统一走 `this.readDb(tx)`（读写分离 + 事务内自动粘主）；
4. **确定性哨兵值**：进唯一索引的可空列与软删除列在 SQL 层存确定性哨兵值（`''` / `0`），防止 `NULL != NULL` 漏放重复记录；
5. **24 位 Hex ID 大小写与非法 ID 双库同构**：
   - 新领域 DTO 统一使用 `EntityIdSchema` / `EntityIdStringSchema`（自动归一化小写 hex；**勿用**保留大小写的旧兼容 `ObjectIdSchema`）；
   - Mongo 与 SQL 的读/改/删入口统一先判 `isValidEntityId(...)`（非法 ID 统一返回 `null` / `[]` / `0`，严禁让 Mongo 抛 `BSONError`），SQL `WHERE` 条件统一用 `this.normalizeId(...)`；
6. **原子性与严进宽出归一化**：消灭 `findOne + save` 与 `insert + catch(11000)`（改 `upsertRow` / CAS），缓存失效与 MQ 投递挂入 `tx.afterCommit(...)`；读出口单行 `parseRow`（Fail-Fast）、列表 `parseList`（Warn & Skip）。

> **交互确认门禁**：若涉及拆子表、同目录多 Schema 合并、新增/变更索引或调用文件 `> 10` 个，先向用户展示上述 Brief + `repo.type.ts` + `sql/table.ts` 草案确认后再推进；极简无拆表小表可直接推进并在交付中附上 Brief。

### Step 3：生成标准骨架

运行 [scaffold-repo.mjs](scripts/scaffold-repo.mjs) 生成样板（若目录已有 `service.ts` 会自动跳过覆盖以便原位改造构造函数 DI；纯子表无需独立 Service 时传 `--no-service`）：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/scaffold-repo.mjs \
  --dir <packages/service/...> \
  --entity <PascalEntityName> \
  --table <snake_case_table> \
  --datasource <main|log> \
  [--soft-delete] [--no-service]
```

### Step 4：完成双库实现与契约单测

1. 补全 `repo.type.ts`、`mongo/schema.ts`（惰性 `getXxxMongoModel()`，严禁模块顶层立即注册 Model 或使用 `.index()` / 字段内联 `unique: true`）、`mongo/repo.ts`、`sql/table.ts`、`sql/repo.ts`（`log` 表补 `noop/repo.ts`）与 `repo.ts`；
2. 在 `repo.contract.test.ts` 中使用 `registerDualDialectContractSuite` + `createPGliteSqlTestHarness` 跑通 **真实 Mongo 副本集事务 + PGlite** 6 项同构契约断言（严禁把 `transactionRunner` 桩成 `execute(undefined)`；`setup` 先 `createCollection()` 并在 `cleanupEach` 用 `deleteMany({})`）；
3. 将 `service.ts` 改造为 `XxxService` 类 + 构造函数依赖注入（`deps.xxxRepo ?? injectRepo(Token)`）。

### Step 5：迁移调用方并合龙删除旧 Schema

- **事务迁移双轨准则（严禁越界扩张重构范围）**：
  - 若事务内涉及的表已全部迁入 DAL：外层直接切换为 `runInTransaction(async (tx) => ...)`（`@fastgpt/dal/db/transaction`）；
  - **若外层 `mongoSessionRun(async (session) => ...)` 同时操作了其他尚未迁移的裸 `Mongo*` 表**：保留外层 `mongoSessionRun`，用 `bridgeClientSessionToDbSession(session)`（`@fastgpt/service/common/mongo/sessionRun`，已打通 `tx.afterCommit` 与回滚隔离）转为 `tx` 传入本域 Service/Repo——**绝不顺手重构无关表，也绝不裸丢 `session` 破坏原子性**！
- **API 与 OpenAPI 契约保护**：修改 `pages/api/**` 调用方时，保持既有对外 HTTP 入参/响应语义不变；路由入参必须走 `parseApiInput`，新增或抽离的接口契约 Schema 必须定义在 `packages/global/openapi/**`。
- 迁完主仓与 `pro/admin` 全部调用方后，**立即物理删除旧 `schema.ts`（及 `schemaV2.ts` / `ttl.ts` / 旧 `entity.ts`）**。

### Step 6：自动化边界、索引、残留引用与单测全检

[verify-domain.mjs](scripts/verify-domain.mjs) 会自动执行：目录完整性、分层隔离与 SQL 可移植性静态扫描、`defineIndex`（含名称/关键 options/TTL 及多旧文件合并）零丢失比对、同目录旧文件收口、全仓旧 `Mongo*` 生产零残留引用检查与目标单测。

使用 `merge-base:<旧schema相对路径>` 可在 `git commit` 前后稳定对比分支基线（多旧文件合并时传多个路径；若集合重命名显式传 `--collection-map old=new`）：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/verify-domain.mjs \
  --dir <packages/service/...> \
  --git-legacy merge-base:<旧schema相对路径...> \
  [--collection-map <old=new...>] \
  --test <契约单测与受影响业务测试路径...>

node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status
```

确认上述命令与受影响 workspace 的 `tsc --noEmit` 全部通过后（Coordinator 模式下）同步勾选 [设计总纲](../../../design/common/dal/multi-db-repository-architecture.md) 对应 TODO。
