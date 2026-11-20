# 深水区建模食谱、OB/MySQL 优先规范与多层级测试矩阵

所有 `sql/` 层代码必须**优先 100% 兼容 OceanBase 4.3+ / SeekDB（MySQL 模式）与 MySQL 8.0+（P0）**，同时兼容 **PostgreSQL ≥ 14（P1）**。严禁使用任何单方言专有特性，也不得仅凭 PGlite 跑通就假设 OceanBase / MySQL 兼容。

## 1. 四信号 JSON 拆表法则（禁止按嵌套层数切分）

切勿规定“第 2 层 JSON Object 必须拆子表”。OceanBase 二进制 `JSON` 与 PG `JSONB` 对整存整取的多层配置树（如 `App.chatConfig`、`AppVersion.nodes`）单行读取性能极佳；乱拆表反而引发跨表 JOIN 与分布式写事务（2PC）。

仅当嵌套字段或数组命中以下 **任意 1 个信号** 时，必须从 `JSON` 中剥离并拆成独立关系列或关联子表：

| 信号 | 判定条件 | 典型反例 / 正例 | SQL 建模方式 |
| --- | --- | --- | --- |
| **1. 检索/排序/反查** | 需进 `WHERE`、`ORDER BY` 或反向定位主记录 | `DatasetData.indexes[].dataId`（向量召回后按 `dataId` 反查数据行） | 拆关联表 `dataset_data_indexes(data_id PK, dataset_data_id, ...)` + B-Tree 索引 |
| **2. 高频独立并发更新** | 多协程/后台任务只修改其中某个子项的状态 | `ChatItem.metadata.workflowBuilderTasks[hash]` 并发 CAS 更新 | 拆独立子表，将行锁收缩到单个子项级别 |
| **3. 数组无上限增长** | 数组元素随业务运行不断追加，存在撑爆单行风险 | 对话消息列表、审计事件流 | 拆独立子表 + `_id` 游标分页 |
| **4. 跨行聚合或原子加减** | 需 `SUM/COUNT` 统计或并发 `$inc` 扣减 | `surplusPoints` 积分余额、用量计数 | 提拔为顶层 `BIGINT`/`DOUBLE` 关系列 |

> **OceanBase 大表分区前导列约定**：超大流水/数据表（`chat_items`、`dataset_datas`、`app_chat_logs`、`llm_request_records`）的所有业务索引均坚持以 `team_id` 作为前导列，为后续按租户分区留退路。

## 2. 跨方言可移植 SQL 禁用清单 vs 替代写法（OceanBase/MySQL 优先）

| 禁用语法（PG/Mongo/不安全 MySQL 私货） | 原因 | 标准替代方案（`@fastgpt/dal/db/sql`） |
| --- | --- | --- |
| `VARCHAR[]` 数组列 + `GIN` 索引 | OceanBase / MySQL 无数组列与 GIN | 层级树使用 `ancestor_path VARCHAR(1024)` + 标准 B-Tree（`LIKE 'rootId/%'`）；多对多拆关联表 |
| `CREATE UNIQUE INDEX ... WHERE col IS NULL` | OceanBase / MySQL 不支持局部索引；且标准唯一索引中 `NULL != NULL` | 可空唯一列存哨兵值：`this.toParentSentinel(parentId)`（根目录存 `''`）、未删记录 `delete_time_ms = 0` |
| `INSERT ... RETURNING *` / `.returning()` | OceanBase / MySQL 不支持 `RETURNING` | 应用层通过 `createEntityId()` 预生成 24 位主键与时间戳，直接返回构造后的对象并过 `this.parseRow(...)` |
| `ILIKE` 与反斜杠转义 | MySQL / OceanBase 无 `ILIKE`，且受 `NO_BACKSLASH_ESCAPES` 影响 | 统一调用 `this.caseInsensitiveLike(col, keyword)`（编译为 `LOWER(col) LIKE ? ESCAPE '|'`）；建表统一 `COLLATE=utf8mb4_bin` 保证等值与唯一键区分大小写 |
| `INSERT IGNORE` / `.ignore()` | MySQL / OceanBase 会将 `NOT NULL`、截断等真实错误静默降级为 Warning | 走 `this.upsertRow(...)`（无更新场景 OB 侧走无副作用 `ON DUPLICATE KEY UPDATE _id = _id`，且限定单唯一键冲突路径） |
| 裸 `ORDER BY nullable_col DESC` 或 `NULLS FIRST/LAST` | PG `DESC` 默认 `NULLS FIRST` 而 OB/MySQL 默认 `NULLS LAST`，且 MySQL 8 不支持 `NULLS LAST` 语法 | 显式加 `CASE WHEN col IS NULL THEN 1 ELSE 0 END asc`（或 `orderByNullable` / 哨兵值）统一排序行为 |
| 给 `text` / `json` 列声明 `defaultValue` 或建 B-Tree 索引 | MySQL / OceanBase 禁止 `LONGTEXT`/`JSON` 设常量默认值（`ERROR 1101`）与无前缀长度普通索引 | 去掉 `defaultValue` 在应用层兜底；需要索引检索的字段改为定长 `varchar` |
| 复合索引字节宽超过 `3072` 字节 / 索引名超 `63` 字符或无 `fg_` 前缀 | InnoDB / OceanBase `utf8mb4` 每字符占 4 字节，总长超 3072B 直接建表失败；PG 索引名超 63B 静默截断且全库唯一 | 压缩复合索引中 `varchar` 列宽或改为定长哈希列；全部 SQL 索引与新增 Mongo 索引统一采用 `fg_<table_short>_<purpose>[_vN]`（≤63B），存量无前缀 Mongo 索引原位冻结不改名 |
| 直接传 JS 数组写入 JSON 列 | `pg` 驱动把 JS 数组误序列化成 PG Array `{"a"}` | 统一包裹 `this.toJsonParam(value)`（显式 `JSON.stringify`），读出口用 `jsonColumnSchema(...)` |
| `MERGE INTO` / `jsonb_path_exists` | 仅 PG 15+ 或方言特定语法 | 用 `this.upsertRow(...)`；JSON 黑盒存取 |
| 一次性插上万行 `values(rows)` | 超出 PG `65,535` 绑定参数上限 | 统一调用 `this.insertChunked({ rows })` |
| 大表 `.cursor()` 改深分页 `OFFSET` / 长连接 `pg-cursor` | 深分页退化严重，长游标占死连接池 | 统一用基于 24 位有序 `_id` 的 **Keyset 分批迭代**（`WHERE _id > cursor ORDER BY _id ASC LIMIT N`） |
| 跨表 `$lookup` 在单表 Repo 里硬拼裸 JOIN | 破坏领域边界且无法跨 `main`/`log` 双库 | 简单主从字段补全改 Service 批量 `IN` 组装；必须在 DB 侧按关联条件过滤分页的独立建只读 **Query Repo** |
| 纯读查询误调 `this.db(tx)` 或裸拼大写 ID | 绕过读副本路由；且 SQL `VARCHAR(24)` 大小写敏感而 Mongo `ObjectId` 大小写不敏感 | 纯读查询调 `this.readDb(tx)`；入口判 `isValidEntityId(id)`，SQL `WHERE` 参数调 `this.normalizeId(id)` |

## 3. 排序原子抢占 & 最早过期扣减（`FOR UPDATE SKIP LOCKED`）

OceanBase >= 4.3 / SeekDB、MySQL >= 8.0 与 PG >= 14 均原生支持事务内 `SELECT ... FOR UPDATE SKIP LOCKED`。禁止在 SQL `UPDATE` 上尝试 `ORDER BY ... LIMIT 1`。

```ts
// sql/repo.ts 标准写法：在 runInTransaction 事务内先抢占锁定单行，再按主键原子更新
async claimNextTask({ now, lockOwner, tx }: { now: Date; lockOwner: string; tx?: DbSession }) {
  const execute = async (activeTx: DbSession) => {
    const candidate = await this.db(activeTx)
      .selectFrom('dataset_trainings')
      .select(['_id'])
      .where('lock_time', '<=', now)
      .orderBy('lock_time', 'asc')
      .orderBy('_id', 'asc')
      .limit(1)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();

    if (candidate === undefined) {
      return null;
    }

    await this.db(activeTx)
      .updateTable('dataset_trainings')
      .set({ lock_time: new Date(now.getTime() + 60_000), lock_owner: lockOwner })
      .where('_id', '=', candidate._id)
      .execute();

    const updated = await this.db(activeTx)
      .selectFrom('dataset_trainings')
      .selectAll()
      .where('_id', '=', candidate._id)
      .executeTakeFirst();

    return this.parseNullable(updated);
  };

  if (tx !== undefined) {
    return execute(tx);
  }
  return runInTransaction(execute);
}
```

## 4. 消灭 `insert + catch(11000)` 试探写法（PG `25P02` 防护）

在 PG 事务内一旦某条 SQL 抛错（哪怕业务 `try/catch` 捕获），整个事务会立即进入 `25P02 aborted` 状态导致后续全部 SQL 崩溃：

- **禁止**在 Service 或 Repo 里写 `try { insert } catch (unique) { update }`；
- 幂等写入一律使用 `this.upsertRow({ values, conflictKeys, updateValues, tx })`（Mongo 侧对应 `findOneAndUpdate(..., { upsert: true })`）。

## 5. 混合事务渐进桥接（`mongoSessionRun` -> `DbSession`）

当外层调用方在同一个 `mongoSessionRun(async (session) => ...)` 事务中同时编排了「尚未迁移的其他裸 `Mongo*` 表」与「已完成重构的新领域 Service/Repo」时：

```ts
import {
  bridgeClientSessionToDbSession,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';

await mongoSessionRun(async (session) => {
  await MongoUnmigratedSibling.updateOne({ _id: appId }, { $set: { ... } }, { session });
  const tx = bridgeClientSessionToDbSession(session);
  await appRegistrationService.deleteAppRegistrations({ teamId, appId, tx });
});
```

- `bridgeClientSessionToDbSession` 会将原生 `ClientSession` 包装为 `DbSession`，并把内部 `tx.afterCommit(...)` 挂入外层 `afterMongoCommit` 队列（回滚/重试自动丢弃，提交后顺序执行）；
- 遵循 **自底向上顺序**：待该事务链路涉及的全部叶子表均完成 DAL 重构后，再将外层 `mongoSessionRun` 整体替换为 `runInTransaction`。

## 6. 多层级测试矩阵（必做 + 按表特征必补）

单靠基础 CRUD 契约无法兜住 OceanBase / 并发 / Service 编排 / 存量回归风险。每个重构切片必须按以下 4 类补齐对应测试：

### 6.1 必做 A：多方言仓储契约测试（`repo.contract.test.ts`，L1 + L2 共用）

通过 `@fastgpt/dal/db/testing` 编写一份与引擎无关的契约测试（Phase 0.5 `createContractBackends` 就位后自动按环境变量挂载 `Mongo + PGlite + MySQL 8 / OceanBase / PG`；Mongo 端 `setup` 必须配置真实 `configureMongoDalRuntime({ mainWriteUrl })` + `model.createCollection()`，**严禁**桩成 `transactionRunner: ({ execute }) => execute(undefined)`）：

1. **DDL 双端编译校验**：同时断言 `compileSqlTableDDL(table, 'oceanbase')`（`DATETIME(3)`、内联索引、无 `CREATE INDEX IF NOT EXISTS`）与 `compileSqlTableDDL(table, 'postgres')`；
2. **空值与类型归一化对齐**：可选字段传 `undefined` / `null`、布尔 `0/1`、JSON 数组、`BIGINT` 及毫秒日期在全后端返回结构与 `===` 值一致；
3. **24 位 Hex ID 大小写与非法 ID 同构**：传入大写/混合大小写合法 24 位 Hex ID（写与查）全后端均命中同一记录并返回小写归一化 ID；传入 `'not-an-object-id'` 等非法字符串均返回 `null` / `[]` / `0` 而不抛驱动异常；
4. **哨兵唯一键冲突**：例如同 `teamId` + 根目录 `parentId: null` + 同名创建，全后端均触发唯一冲突或幂等 Upsert；
5. **租户隔离与软删除不可见性**：跨 `teamId` 不可查改，软删除后常规读接口返回 `null` / 空列表；
6. **`parseRepoRow` Fail-Fast + `parseRepoRows` 脏行隔离（Warn & Skip）**：向底层直插一条缺失必填列的历史坏记录，单行读抛 `DbRecordCorruptedError`，列表读跳过坏行返回剩余正常行且不抛 500；
7. **真实事务回滚 & `afterCommit`**：事务回调中途抛错时数据真实回滚且不触发 `afterCommit`；提交成功后按注册顺序执行 `afterCommit`。

### 6.2 必做 B：Service 纯内存单测（`service.test.ts`，L0 零 DB）

- 凡 `service.ts` 存在业务编排（多 Repo 协同、权限/配额校验、状态转换、异常映射、`afterCommit` 副作用触发、混合事务透传），**必须**编写 `service.test.ts`；
- 通过构造函数注入内存 Stub / `vi.fn()` Repo（`new XxxService({ xxxRepo: stubRepo })`），**零 `vi.mock` 模块劫持、零数据库依赖**。

### 6.3 按表特征必补的专项测试（对照 Step 1 `Recommended Extra Tests`）

| 表/查询特征 | 必须补齐的额外测试 |
| --- | --- |
| **`datasource === 'log'`（4 张日志表）** | **日志路由与 Noop 降级测试**：当前 Phase 0 运行时 `hasLogDatabase()` 仅按 `logWriteUrl` 判定，未配置时路由至 `Noop`，须验证有 `logWriteUrl` 的正常读写与 `Noop` 静默跳过写/空读行为；**上线单库默认部署的日志表迁移前须先完成设计总纲 TODO `0.5.1`**，并在 `0.5.1` 落地后同步验收三态路由（`shared` 默认复用主池、`separate` 独立池、`disabled` 走 `Noop`）。 |
| **`FOR UPDATE SKIP LOCKED` / 原子扣减 / CAS / `$inc` / 冲突重试** | **并发抢占与冲突重试测试**：使用 `Promise.all` 并发抢占同一批任务/扣减同一余额，验证零重复领取、不超扣、重试时上一轮未提交的 `afterCommit` 被清空丢弃（注意：单连接 PGlite 测不到多连接并发，需确保在真实 OB/MySQL/PG/Mongo 连接池下完整执行）。 |
| **可空列排序（如 `pinnedAt`、`expireTime`、`sort`）** | **含 `NULL` 行的排序边界测试**：同时插入带值行与 `NULL` 行，验证 `ASC` / `DESC` 在 Mongo、PG、OB/MySQL 返回完全一致的顺序。 |
| **`$regex` 模糊搜索 / 唯一键大小写** | **大小写对照测试**：验证等值查询与唯一索引严格区分大小写（对齐 `utf8mb4_bin`），而 `caseInsensitiveLike` 跨库大小写不敏感且正确转义 `%`、`_`、`|`。 |
| **TTL 过期表（`expireTime` / `expires`）** | **TTL 读过滤测试**：插入已过期与未过期两条记录，断言常规读路径绝不返回已过期记录。 |
| **大表 `.cursor()` 导出 / Keyset 游标分页** | **多批游标遍历测试**：覆盖多批遍历无漏行、无重行、空结果终止。 |
| **权限位运算（`$bitsAllSet` / `$bitsAnySet`）** | **掩码边界测试**：覆盖 `0`、单 bit、复合 bit、全覆盖与部分命中。 |
| **Phase 0.5 轻量 SQL DDL 迁移器就位后** | **SQL Migration 守卫测试**：验证新增/修改表结构的增量 SQL Migration 正向升级、幂等重跑、回滚遇未来版本 ID 向前兼容跳过、PG `CONCURRENTLY` / `indisvalid` 自愈，及 `information_schema` / `pg_index` 与 `sql/table.ts` 一致。 |

### 6.4 必做 C：存量测试与公共夹具同步脱 Mongo

- 收口删除旧 `schema.ts` 时，同步改造该域关联的 `test/datas/**` 与测试文件中直接操作旧 `Mongo*` 的造数与断言（`verify-domain.mjs` 自动拦截非 `migration/` 测试文件中的旧 Model 残留），并运行受影响的既有业务/API 回归测试，确保全部 1,479 个存量业务测试平滑兼容 `FASTGPT_TEST_DB_DIALECT=oceanbase|mysql|postgres`。
