# 深水区建模食谱与 SQL/Mongo 对照规范

所有 `sql/` 层代码必须同时兼容 **PostgreSQL ≥ 14**、**OceanBase 4.x（MySQL 模式）** 与 **MySQL 8.0+**。严禁使用任何单方言专有特性。

## 1. 四信号 JSON 拆表法则（禁止按嵌套层数切分）

切勿规定“第 2 层 JSON Object 必须拆子表”。PG `JSONB` 与 OceanBase 二进制 `JSON` 对整存整取的多层配置树（如 `App.chatConfig`、`AppVersion.nodes`）单行读取性能极佳；乱拆表反而引发跨表 JOIN 与分布式写事务（2PC）。

仅当嵌套字段或数组命中以下 **任意 1 个信号** 时，必须从 `JSON` 中剥离并拆成独立关系列或关联子表：

| 信号 | 判定条件 | 典型反例 / 正例 | SQL 建模方式 |
| --- | --- | --- | --- |
| **1. 检索/排序/反查** | 需进 `WHERE`、`ORDER BY` 或反向定位主记录 | `DatasetData.indexes[].dataId`（向量召回后按 `dataId` 反查数据行） | 拆关联表 `dataset_data_indexes(data_id PK, dataset_data_id, ...)` + B-Tree 索引 |
| **2. 高频独立并发更新** | 多协程/后台任务只修改其中某个子项的状态 | `ChatItem.metadata.workflowBuilderTasks[hash]` 并发 CAS 更新 | 拆独立子表，将行锁收缩到单个子项级别 |
| **3. 数组无上限增长** | 数组元素随业务运行不断追加，存在撑爆单行风险 | 对话消息列表、审计事件流 | 拆独立子表 + `_id` 游标分页 |
| **4. 跨行聚合或原子加减** | 需 `SUM/COUNT` 统计或并发 `$inc` 扣减 | `surplusPoints` 积分余额、用量计数 | 提拔为顶层 `BIGINT`/`DOUBLE` 关系列 |

## 2. 跨方言可移植 SQL 禁用清单 vs 替代写法

| 禁用语法（PG/Mongo 私货） | 原因 | 标准替代方案（`@fastgpt/dal/db/sql`） |
| --- | --- | --- |
| `VARCHAR[]` 数组列 + `GIN` 索引 | OceanBase / MySQL 无数组列与 GIN | 层级树使用 `ancestor_path VARCHAR(1024)` + 标准 B-Tree（`LIKE 'rootId/%'`）；多对多拆关联表 |
| `CREATE UNIQUE INDEX ... WHERE col IS NULL` | OceanBase / MySQL 不支持局部索引；且标准唯一索引中 `NULL != NULL` | 可空唯一列存哨兵值：`this.toParentSentinel(parentId)`（根目录存 `''`）、未删记录 `delete_time_ms = 0` |
| `INSERT ... RETURNING *` | OceanBase / MySQL 不支持 `RETURNING` | 应用层通过 `createEntityId()` 预生成 24 位主键与时间戳，直接返回构造后的对象并过 `this.parseRow(...)` |
| `ILIKE` 与反斜杠转义 | MySQL / OceanBase 无 `ILIKE`，且受 `NO_BACKSLASH_ESCAPES` 影响 | 统一调用 `this.caseInsensitiveLike(col, keyword)`（编译为 `LOWER(col) LIKE ? ESCAPE '|'`） |
| 直接传 JS 数组写入 JSON 列 | `pg` 驱动把 JS 数组误序列化成 PG Array `{"a"}` | 统一包裹 `this.toJsonParam(value)`（显式 `JSON.stringify`），读出口用 `jsonColumnSchema(...)` |
| `MERGE INTO` / `jsonb_path_exists` | 仅 PG 15+ 或方言特定语法 | 用 `this.upsertRow(...)`（PG `ON CONFLICT` / OB `ON DUPLICATE KEY UPDATE`）；JSON 黑盒存取 |
| 一次性插上万行 `values(rows)` | 超出 PG `65,535` 绑定参数上限 | 统一调用 `this.insertChunked({ rows })` |

## 3. 排序原子抢占 & 最早过期扣减（`FOR UPDATE SKIP LOCKED`）

PG >= 9.5、OceanBase >= 4.x 与 MySQL >= 8.0 均原生支持事务内 `SELECT ... FOR UPDATE SKIP LOCKED`。禁止在 SQL `UPDATE` 上尝试 `ORDER BY ... LIMIT 1`。

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

## 5. 双库契约测试（Mongo + PGlite）必测矩阵

每张表生成测试时，必须通过 `@fastgpt/dal/db/testing` 的 `registerDualDialectContractSuite` 与 `createPGliteSqlTestHarness` 至少验证以下 5 类场景：

1. **空值与类型归一化对齐**：可选字段传 `undefined` / `null`、布尔、JSON 数组及日期在 Mongo 与 PGlite 返回结构与 `===` 值完全一致；
2. **哨兵唯一键冲突**：例如同 `teamId` + 根目录 `parentId: null` + 同名创建，双库均触发唯一冲突或幂等更新；
3. **租户隔离与软删除不可见性**：跨 `teamId` 不可查改，软删除后常规读接口返回 `null` / 空列表；
4. **`parseRepoRows` 脏行隔离（Warn & Skip）**：向底层直插一条缺失必填列的历史坏记录，验证列表返回剩余正常行且不抛 500；
5. **事务回滚 & `afterCommit`**：事务回调中途抛错时数据全回滚且不触发 `afterCommit`；提交成功后按注册顺序执行 `afterCommit`。
