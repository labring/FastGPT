---
name: multi-db-repo-refactor
description: >-
  Guides end-to-end refactoring of FastGPT MongoDB models and raw Mongoose queries into dual-family
  Domain Repositories (mongo + portable Kysely sql prioritizing OceanBase 4.3+/SeekDB & MySQL 8+,
  with PostgreSQL 14+ compatibility), Zod read normalization, DI tokens, constructor-injected
  Services, and multi-layer tests (contract, L0 service unit, concurrency/log-mode/TTL/migration,
  and legacy test fixture migration). Use when refactoring a collection/table, designing
  repo.type.ts or sql/table.ts, auditing callers, checking multi-DB refactor progress, or planning
  parallel slices.
---

# FastGPT 多数据库领域仓储重构 SOP

本技能将“把裸 `Mongo*` 调用收口为 `mongo/ + sql/` 双族领域仓储（**P0 优先兼容 OceanBase 4.3+/SeekDB & MySQL 8.0+，P1 兼容 PostgreSQL ≥ 14**，同时保持 MongoDB 兼容）”标准化为可验证的 6 步流水线。

## 上下文按需加载（禁止开局全量硬塞大文档）

- **必读规范**：动手改代码前先读 [FastGPT 代码规范](../../../code/syntax.md)；
- **Step 2 & Step 4 必按需读**：[深水区建模食谱](references/deep-water-recipes.md)（四信号拆表、OB/MySQL 优先 SQL 禁用表、`FOR UPDATE SKIP LOCKED`、多层级测试矩阵）；
- **大表 / 多 Agent 并行按需读**：[并行切片指南](references/parallel-slicing-guide.md)；
- **架构总纲仅兜底/收尾读**：[设计总纲](../../../design/common/dal/multi-db-repository-architecture.md)（共 900+ 行，**禁止开局全文通读**；仅在遇到罕见 DAL 运行时疑问或全部合龙后勾选最终 TODO 时局部查阅，并行 Worker 严禁修改该文件）。

## 硬性前提（WIP=1 锁、包物理隔离、范围边界 & 全仓一刀切）

1. **WIP=1 大表合龙锁**：先跑进度脚本。**只要存在任何尚未合龙删除旧 Schema/Model 文件的在途域，严禁开启任何新表重构！**
2. **包边界与目录归属（物理防依赖污染）**：
   - **`@fastgpt/global`**：仅放前后端共享的 `EntityId`、业务枚举、OpenAPI/接口 DTO；**禁止新增数据库物理集合名 / 表名常量到 `@fastgpt/global`**。
   - **目标态（TODO `0.5.2` 落地后生效）**：开源表的物理集合名/表名常量、`repo.type.ts`、`repo.ts`（Token）、私有 `mongo/{schema,repo}.ts`（原生 `new Schema` + `defineMongoCollection`，`MongoRepositoryBase` 在 `constructor` 自动构 `readonly model`）、私有 `sql/{table,repo}.ts` 与 `noop/repo.ts` 全部收口进 **`packages/dal/db/repos/<domain>/`**（`packages/dal/package.json` 绝不导出 `mongo/` 与 `sql/`），契约测试放 **`packages/dal/test/db/repos/<domain>/repo.contract.test.ts`**；Pro 10 张商业表放 **`pro/admin/src/dal/db/repos/<domain>/`**；`packages/service/<domain>/service.ts` 只 `import` DAL Token 与 `repo.type`，`packages/service/test/<domain>/service.test.ts` 保持 L0 零 DB 纯内存单测。
   - **当前 Phase 0 过渡态**：在 TODO `0.5.2` 完成 `MongoRuntime` 下沉与脚手架升级前，当前脚本（`scaffold-repo.mjs` / `verify-domain.mjs`）暂按 Phase 0 Pilot 路径（`packages/service/<domain>/` + 惰性 `getXxxMongoModel`）运行；开启大规模 Phase 1 迁表前须先完成 `0.5.1`–`0.5.5`。
3. **同表跨 `pro` 与测试夹具一刀切**：同一张表的重构周期内必须同步改完 `packages/`、`projects/`、`pro/admin/` 全部生产调用方**及关联测试文件/`test/datas/` 中的裸 `Mongo*` 造数与断言**，并物理删除旧 Schema 文件（不留过渡残余，确保 1,479 个存量测试平滑脱 Mongo）。
4. **垂直端到端一步到位**：当场写完 `repo.type.ts` + `mongo/` + `sql/`（`log` 表附加 `noop/`）+ **全套必做与按特征必补测试**，严禁只写单方言半成品或只写最小 CRUD 冒烟测试。
5. **明确范围外边界**：
   - `packages/service/core/dataset/image/schema.ts`（Mongo GridFS）：纯 Mongo 历史遗留，**禁止为其建 SQL 表**（SQL 模式下走只读空降级/404）；
   - `projects/marketplace/**`：独立应用，不在本次主仓多库重构范围内。

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

使用 `--usages` 一次拉出全部生产调用文件、受影响测试文件统计、行号片段与自动推荐的额外补测清单（如需同时看测试文件详细行号加 `--include-tests`）：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --model <MongoModelName> --usages
# 或按 schema/model 文件路径扫描（兼容 schemaV2.ts、ttl.ts 等非标准命名）：
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --schema <path/to/file.ts> --usages
```

重点核查脚本输出的 7 项情报：
- `datasource`：`main`（`getMongoModel`）或 `log`（`getMongoLogModel`，必须补 `noop/repo.ts` 与 `defineLogRepoToken`，运行时支持 `shared` 默认复用主池 / `separate` 独立池 / `disabled` 路由 `Noop` 三态拓扑）；
- `Sibling(s)`：同目录是否存在伙伴 Schema（如 `evalSchema + evalItemSchema`、`usage/schema + usageItemSchema`）——动手前先定好「按子目录 1:1 拆独立 Repo」还是「合并进同一 `mongo/schema.ts`」；
- `Indexes`：全部 `defineIndex`（含 `deprecated: true` 历史索引、显式 `name`、`unique`、`partialFilterExpression`、数值或 `'15d'` 字符串 `expires` TTL），迁移后一条、一项关键 option 都不能丢；
- 是否含 `deleteTime` 软删除、TTL、`.cursor()`、跨表 `$lookup` 或高危算子（`aggregate`、`bulkWrite`、`findOneAndUpdate + sort`、`$elemMatch`、`$inc`、`$regex`、`mongoSessionRun`）；
- `Affected Test Files`：引用旧 `Mongo*` 的测试文件数量，收口时必须一并迁移脱 Mongo；
- `Recommended Extra Tests`：脚本按该表特征自动推导的必补专项测试清单；
- **切片策略**：生产调用文件 `<= 20` 个 -> **单切片直接清零**；`> 20` 个 -> **超级大表微切片**（先过 ER 拆表评审，读 [并行切片指南](references/parallel-slicing-guide.md)）。

### Step 2：深度建模审视（写代码前先输出《Repo Design Brief》）

禁止把业务里的 `.find()` 机械翻译成贫血 Repo。结合 [深水区建模食谱](references/deep-water-recipes.md) 先给出简短审视结论：

1. **方法收敛（反贫血）**：识别共用窄投影（`.pick()` 窄 DTO）与循环 N+1 查询，按业务意图收敛为正交语义方法；跨表 `$lookup` 简单补字段改 Service 批量 `IN` 组装，必须在 DB 侧关联过滤分页的拆独立只读 Query Repo；
2. **四信号拆表法则**：禁止按 JSON 嵌套层数一刀切；仅命中「进 WHERE/ORDER BY/反查」「高频并发局部更新/CAS」「数组无上限增长」「跨行聚合/`$inc`」之一才拆列或子表；超大流水表索引坚持 `team_id` 前导列；
3. **OceanBase / MySQL 优先的可移植 B-Tree SQL**：
   - 禁用 `ARRAY[]`、GIN/GIST、部分唯一索引、`ILIKE`、`RETURNING`、JSON 路径查询、`INSERT IGNORE` / `.ignore()` 与 `NULLS FIRST/LAST` 语法；
   - `sql/table.ts` 禁给 `text`/`json` 列设 `defaultValue` 或建普通索引，复合索引估算宽 `<= 3072` 字节（`utf8mb4` 按 `4B/char`），索引名 `<= 63` ASCII 字节且全部 SQL 索引与新增 Mongo 索引统一采用 **`fg_<table_short>_<purpose>[_vN]`** 命名（存量无前缀 Mongo 索引原位冻结不改名重建），OB/MySQL 建表默认 `COLLATE=utf8mb4_bin`（区分大小写）；
   - 层级用 `ancestor_path`，大小写不敏感模糊匹配用 `this.caseInsensitiveLike`，可空排序列显式 `CASE WHEN col IS NULL` 统一 `NULL` 位置，大表 `.cursor()` 改基于 `_id` 的 Keyset 分批迭代，纯读查询走 `this.readDb(tx)`；
   - **索引与迁移解耦约定（TODO `0.5.4` 就位后生效）**：SQL 侧新增表或变更 `sql/table.ts` 列/索引时同步新增轻量 SQL 版本化 Migration（`packages/dal/db/sql/migrations/`）；Mongo 侧新增索引直接在 `mongo/schema.ts` 声明 `fg_*` 由启动异步只增补建，删除旧索引与改 TTL/`unique` 走 Expand-Contract 两版制 + 一次性迁移任务（禁止新增 `deprecated: true` 墓碑）；
4. **确定性哨兵值**：进唯一索引的可空列与软删除列在 SQL 层存确定性哨兵值（`''` / `0`），防止 `NULL != NULL` 漏放重复记录；
5. **24 位 Hex ID 大小写与非法 ID 双库同构**：
   - 新领域 DTO 统一使用 `EntityIdSchema` / `EntityIdStringSchema`（自动归一化小写 hex；**勿用**保留大小写的旧兼容 `ObjectIdSchema`）；
   - Mongo 与 SQL 的读/改/删入口统一先判 `isValidEntityId(...)`（非法 ID 统一返回 `null` / `[]` / `0`，严禁让 Mongo 抛 `BSONError`），SQL `WHERE` 条件统一用 `this.normalizeId(...)`；
6. **原子性与严进宽出归一化**：消灭 `findOne + save` 与 `insert + catch(11000)`（改 `upsertRow` / CAS），缓存失效与 MQ 投递挂入 `tx.afterCommit(...)`；读出口单行 `parseRow`（Fail-Fast）、列表 `parseList`（Warn & Skip）。

> **交互确认门禁**：若涉及拆子表、同目录多 Schema 合并、新增/变更索引或调用文件 `> 10` 个，先向用户展示上述 Brief + `repo.type.ts` + `sql/table.ts` 草案确认后再推进；极简无拆表小表可直接推进并在交付中附上 Brief。

### Step 3：生成标准骨架

运行 [scaffold-repo.mjs](scripts/scaffold-repo.mjs) 生成样板（若目录已有 `service.ts` 会自动跳过覆盖并同步跳过生成模板 `service.test.ts`，避免导入不匹配，原位改造构造函数 DI 后按实际接口补写 L0 单测；新建 `service.ts` 时会自动生成配套 L0 `service.test.ts`；纯子表无需独立 Service 时传 `--no-service`）：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/scaffold-repo.mjs \
  --dir <packages/service/...> \
  --entity <PascalEntityName> \
  --table <snake_case_table> \
  --datasource <main|log> \
  [--soft-delete] [--no-service]
```

### Step 4：完成双库实现与多层级测试（严禁偷工减料）

1. 补全 `repo.type.ts`、`mongo/schema.ts`（Phase 0.5.2 后使用原生 `new Schema` + `defineMongoCollection` 并在 `MongoRepositoryBase` `constructor` 自动构 `readonly model`；当前 Phase 0 过渡态暂用惰性 `getXxxMongoModel()`；严禁模块顶层立即注册 Model 或使用 `.index()` / 字段内联 `index: true / unique: true`）、`mongo/repo.ts`、`sql/table.ts`、`sql/repo.ts`（`log` 表补 `noop/repo.ts`）与 `repo.ts`，并将 `service.ts` 改造为 `XxxService` 类 + 构造函数依赖注入（`deps.xxxRepo ?? injectRepo(Token)`）。
2. **必须按以下 4 类完整交付测试**（详见 [深水区建模食谱 §6](references/deep-water-recipes.md#6-多层级测试矩阵必做--按表特征必补)）：
   - **① 多方言仓储契约测试（`repo.contract.test.ts`，必做）**：
     - 校验 `compileSqlTableDDL` 在 **`oceanbase`（P0）与 `postgres`（P1）** 双目标编译产物（`DATETIME(3)`、内联索引、无 `CREATE INDEX IF NOT EXISTS`）；
     - 跑通真实 Mongo 副本集事务 + SQL 引擎的 **6 项基础同构契约**（空值/类型归一化、24 位 Hex ID 大小写与非法 ID、哨兵唯一键、租户/软删除隔离、单行 Fail-Fast + 列表 Warn & Skip、真实回滚与 `afterCommit`）；严禁桩成 `execute(undefined)` 假事务；
   - **② Service 纯内存单测（`service.test.ts`，L0 零 DB，非平凡编排必做）**：
     - 凡 `service.ts` 包含多 Repo 协同、状态流转、权限/配额校验、错误处理、混合事务或 `afterCommit` 编排，必须通过 `new XxxService({ xxxRepo: stubRepo })` 编写零 DB、零 `vi.mock` 模块劫持的纯单测；
   - **③ 按表特征必补的专项测试**（对照 Step 1 输出的 `Recommended Extra Tests` 逐项覆盖）：
     - `datasource: 'log'` 表 -> 必须覆盖完整三态验收（`shared` 默认复用主池可读写、`separate` 独立池隔离、`disabled` 路由 `Noop` 静默跳过写且读返回空）；
     - 含 `FOR UPDATE SKIP LOCKED` / 原子扣减 / CAS / `$inc` / 冲突重试 -> **并发抢占与冲突重试测试**（多并发不重复领取、不超扣、重试不重复执行 `afterCommit`，标注在真实 OB/MySQL/PG/Mongo 连接池下运行、单连接 PGlite 按能力分层）；
     - 含可空列排序（如 `pinnedAt` / `expireTime`）、`$regex` 模糊搜索、权限位运算、`upsertRow` 或 Keyset 游标分页 -> 显式补齐对应边界用例（含 `NULL` 行排序断言、大小写敏感等值 vs 不敏感模糊查询对照、幂等重复 Upsert）；
     - 含 TTL 过期语义 -> 显式验证已过期记录不可见、未过期记录正常返回；
     - Phase 0.5 版本化迁移器落地后 -> 同步验证对应版本化 Migration 正向升级、幂等重跑与 `sql/table.ts` 结构一致性；
   - **④ 既有受影响测试与夹具回归（必做）**：同步改造并跑通该域既有业务/API 测试。

### Step 5：迁移生产调用方与测试夹具，并合龙删除旧 Schema

- **事务迁移双轨准则（严禁越界扩张重构范围）**：
  - 若事务内涉及的表已全部迁入 DAL：外层直接切换为 `runInTransaction(async (tx) => ...)`（`@fastgpt/dal/db/transaction`）；
  - **若外层 `mongoSessionRun(async (session) => ...)` 同时操作了其他尚未迁移的裸 `Mongo*` 表**：保留外层 `mongoSessionRun`，用 `bridgeClientSessionToDbSession(session)`（`@fastgpt/service/common/mongo/sessionRun`，已打通 `tx.afterCommit` 与回滚隔离）转为 `tx` 传入本域 Service/Repo——**绝不顺手重构无关表，也绝不裸丢 `session` 破坏原子性**！
- **API 与 OpenAPI 契约保护**：修改 `pages/api/**` 调用方时，保持既有对外 HTTP 入参/响应语义不变；路由入参必须走 `parseApiInput`，新增或抽离的接口契约 Schema 必须定义在 `packages/global/openapi/**`。
- **测试夹具同步脱 Mongo**：同步清理 `test/datas/**` 及非 `migration/` 测试文件中对该表旧 `Mongo*` 的直接引用，改走新 Repo / Service（历史 `migration/` Mongo 修复脚本豁免）。
- 迁完主仓、`pro/admin` 生产调用方与测试夹具后，**立即物理删除旧 `schema.ts`（及 `schemaV2.ts` / `ttl.ts` / 旧 `entity.ts`）**。

### Step 6：自动化边界、OB/MySQL 合规、索引、残留引用与测试全检

[verify-domain.mjs](scripts/verify-domain.mjs) 会自动执行：目录完整性、分层隔离、**OB/MySQL 优先 SQL 可移植性静态扫描**（含禁 `INSERT IGNORE` / `NULLS LAST` / `text|json` 默认值与索引 / 复合索引 `> 3072B`）、**契约测试存在性与真实事务/日志 Noop 覆盖检查**、`defineIndex`（按集合隔离含名称/关键 options/TTL）零丢失比对、同目录旧文件收口、**全仓生产与非迁移测试文件旧 `Mongo*` 零残留引用检查**，以及目标测试执行。

使用 `merge-base:<旧schema相对路径>` 可在 `git commit` 前后稳定对比分支基线（多旧文件合并时传多个路径；若集合重命名显式传 `--collection-map old=new`）：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/verify-domain.mjs \
  --dir <packages/service/...> \
  --git-legacy merge-base:<旧schema相对路径...> \
  [--collection-map <old=new...>] \
  --test <契约测试、Service L0 单测与受影响业务回归测试路径...>

node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status
```

确认上述命令与受影响 workspace 的 `tsc --noEmit` 全部通过后（Coordinator 模式下）同步勾选 [设计总纲](../../../design/common/dal/multi-db-repository-architecture.md) 对应 TODO。
