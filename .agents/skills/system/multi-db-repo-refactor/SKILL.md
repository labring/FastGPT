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

开始任何表重构前，必须先读取：
- [设计总纲](../../../design/common/dal/multi-db-repository-architecture.md)
- [FastGPT 代码规范](../../../code/syntax.md)

## 硬性前提（WIP=1 锁 & 全仓一刀切）

1. **WIP=1 大表合龙锁**：先运行进度脚本检查全仓状态。**只要存在任何尚未合龙删除旧 `schema.ts` 的在途大表，严禁开启任何新表的重构！**
2. **同表跨 `pro` 一刀切**：修改开源包或共享表的模型时，必须在同一张表的重构周期内同步改完 `packages/`、`projects/app/` 与 `pro/admin/` 的全部调用方并删除旧 `schema.ts`，不留跨版本过渡残余。
3. **垂直端到端一步到位**：每重构一张表，必须当场写完 `repo.type.ts` + `mongo/` + `sql/`（独立 `log` 表附加 `noop/`）+ 双库契约单测，不做“先只写 Mongo、SQL 以后再补”的半成品。

## 标准 6 步工作流

### Step 0：检查全局进度与 WIP=1 锁

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status
```

确认无未合龙大表后，再选择或接收目标模型。查看所有待迁模型规模排行榜：

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --list
```

### Step 1：全仓调用面 X 光侦察

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --model <MongoModelName>
# 或按 schema 路径扫描：
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --schema <path/to/schema.ts>
```

重点核查脚本输出中的 5 项情报：
- `datasource` 是 `main`（`getMongoModel`）还是 `log`（`getMongoLogModel`，必须补 `noop/repo.ts` 与 `defineLogRepoToken`）；
- `defineIndex` 全量清单（含 `deprecated: true` 废弃索引，一条不能丢）；
- 是否含 `deleteTime` 软删除、`expireAfterSeconds` TTL 索引或 `.watch()` Change Stream；
- 主仓与 `pro/admin` 全部调用文件与高危算子标注（`.aggregate`、`.bulkWrite`、`findOneAndUpdate + sort`、`$elemMatch`、`mongoSessionRun`）；
- **切片策略判定**：调用文件 `<= 20` 个 -> **单切片全量清零**；`> 20` 个 -> **超级大表微切片**（见 [并行切片指南](references/parallel-slicing-guide.md)）。

### Step 2：深度建模审视（写代码前先输出《Repo Design Brief》）

禁止直接把 API 里的 `.find()` 机械翻译成碎片化 Repo 方法。写业务代码前，必须结合 [深水区建模食谱](references/deep-water-recipes.md) 输出简短审视结论：

1. **方法收敛（反贫血）**：识别高频共用投影（`.pick()` 窄 DTO）与循环 N+1 查询，按业务意图收敛为 5~10 个正交语义方法；
2. **四信号拆表法则**：严禁按 JSON 嵌套层数一刀切；仅当子结构命中「进 WHERE/ORDER BY/反查」「高频局部更新/CAS」「数组无上限增长」「跨行聚合/`$inc`」4 信号之一时才拆列或关联子表，其余多层配置保持黑盒 `json`；
3. **纯可移植 B-Tree SQL**：`sql/table.ts` 与 `sql/repo.ts` 禁用 `ARRAY[]`、GIN、部分唯一索引、`ILIKE`、`RETURNING *` 及 JSON 路径查询；层级用 `ancestor_path` 物化路径，大小写不敏感匹配用 `this.caseInsensitiveLike`；
4. **确定性哨兵值**：进唯一索引的可空列（如 `parentId`）与软删除列在 SQL 层存哨兵值（`''` / `0`），防止 PG/OceanBase 因 `NULL != NULL` 放行重复记录；
5. **原子性升级与事务边界**：消灭 `findOne + save` TOCTOU 竞态及 `insert + catch(11000)` 试探逻辑（改 `upsertRow` / CAS 条件更新），显式透传 `tx?: DbSession`，缓存失效与 MQ 投递挂入 `tx.afterCommit(...)`；
6. **严进宽出 Zod 归一化**：Write Schema 严校验；Read Schema 用 `EntityIdSchema`、`BoolSchema`、`jsonColumnSchema`、`optionalNullToUndefined` 兜底历史脏数据；单行用 `parseRow`（Fail-Fast），列表用 `parseList`（Warn & Skip）。

> **交互确认门禁**：若涉及拆子表、新增/变更索引或调用文件 `> 10` 个，先向用户展示上述 Brief + `repo.type.ts` + `sql/table.ts` 草案，确认后再推进下一步；极简且无拆表的 `<= 5` 文件小表可直接推进并在交付中附上 Brief。

### Step 3：生成标准骨架

```bash
node .agents/skills/system/multi-db-repo-refactor/scripts/scaffold-repo.mjs \
  --dir <packages/service/...> \
  --entity <PascalEntityName> \
  --table <snake_case_table> \
  --datasource <main|log> \
  [--soft-delete]
```

### Step 4：完成双库实现与契约单测

1. 补全 `repo.type.ts`、`mongo/schema.ts`、`mongo/repo.ts`、`sql/table.ts`、`sql/repo.ts`（`log` 表补 `noop/repo.ts`）与 `repo.ts`（`defineRepoToken` / `defineLogRepoToken`）；
2. 在生成的 `*.repo.contract.test.ts` 中使用 `registerDualDialectContractSuite` + `createPGliteSqlTestHarness` 跑通 **Mongo + PGlite** 同构契约断言（含 `null`/哨兵唯一冲突、软删除隔离、Warn & Skip 脏行隔离、事务回滚与 `afterCommit`）；
3. 重构对应 `service.ts` 为 `XxxService` 类 + 构造函数依赖注入（`deps.xxxRepo ?? injectRepo(Token)`）。

### Step 5：迁移调用方并合龙删除旧 `schema.ts`

- 将 `packages/`、`projects/app/` 与 `pro/admin/` 内全部裸 `Mongo*`、`mongoSessionRun` 与 `ClientSession` 改为调用 `xxxService`（或必要 Repo 接口）与 `runInTransaction` / `DbSession`；
- 迁移完成后**立即删除旧 `schema.ts`（及旧 `entity.ts`）**；
- 超级大表（`> 20` 文件）按 [并行切片指南](references/parallel-slicing-guide.md) 分批迁移调用方，严禁在旧 `schema.ts` 尚存时开启下一张表。

### Step 6：自查清单与自动化验证（全部通过才算完成）

**Agent 编码与边界自查清单（提示词强约定，提交前逐项核对）：**
- [ ] **分层隔离**：`mongoose`、`common/mongo`、`mongo/schema` 与裸 `Mongo*` 仅出现在 `mongo/` 内；`kysely`、`pg`、`mysql2`、`sql/table` 仅出现在 `sql/` 内；`mongo/repo`、`sql/repo`、`noop/repo` 仅在 `repo.ts` 中装配给 `defineRepoToken` / `defineLogRepoToken`，业务层仅注入 `*RepoToken` 与 `tx?: DbSession`；
- [ ] **契约纯净 & 规范对齐**：`repo.type.ts` / `service.ts` 零泄漏 `FilterQuery`、`ClientSession`、`fields: string`；遵守 `syntax.md`（使用 `type` 不用 `interface`、禁止 barrel `export ... from`、`===`、`??`）；`mongo/schema.ts` 使用惰性 getter 函数获取 Model（零模块顶层副作用）；
- [ ] **可移植 SQL**：`sql/table.ts` 与 `sql/repo.ts` 未使用 `pgTable`、`ARRAY[]`、`GIN`/`GIST`、`ILIKE`、`RETURNING`、部分唯一索引 `WHERE` 与 JSON 路径查询；可空唯一列与软删除使用确定性哨兵值（`''` / `0`）。

```bash
# 1. 结构、索引零丢失比对、旧 schema 收口与双库契约单测（若删除已提交，传入 origin/main:<旧schema相对路径> 或 <merge-base>:<旧schema相对路径>）
node .agents/skills/system/multi-db-repo-refactor/scripts/verify-domain.mjs \
  --dir <packages/service/...> \
  --git-legacy <[ref:]旧schema相对路径> \
  --test <合同与业务测试文件...>

# 2. 复查全局重构进度与残留引用（确认旧 model 名 0 引用且 WIP=1 已清零）
node .agents/skills/system/multi-db-repo-refactor/scripts/audit-domain.mjs --status
```

确认以上自查清单与命令均通过，且相关 `tsc --noEmit` 与业务测试全部通过后，同步勾选 [设计总纲](../../../design/common/dal/multi-db-repository-architecture.md) 中的对应 TODO。
