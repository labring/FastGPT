# FastGPT 多数据库适配（MongoDB + OceanBase）与领域仓储重构设计

> 状态：收敛定稿（仅面向 MongoDB 与 OceanBase 4.3+ / SeekDB）
>
> 关联文档：[FastGPT Data Access Layer 设计](./data-access-layer.md)、[Mongo 索引同步策略](../mongo-index-sync-strategy.md)

## 1. 背景、定位与边界

1. **目标引擎（二选一运行）**：**`DbDialect = 'mongo' | 'oceanbase'`**（OceanBase 4.3+ / SeekDB MySQL 兼容模式，经 `mysql2` + `Kysely` 访问）。不额外兼顾 PostgreSQL 或标准 MySQL 差异，不做异构数据库间数据迁移，也不做运行期双写。
2. **主库与向量库物理隔离红线**：即便部署时业务库与 OceanBase / SeekDB 向量库指向同一实例，代码层面仍保持 100% 连接池、Schema 与事务边界隔离，严禁业务 Repository 与 `VectorController` 共享事务。
3. **范围外边界**：
   - `dataset_image`（Mongo GridFS 历史遗留）：OceanBase 模式下不建表，走只读空降级；
   - `projects/marketplace`：独立应用，不在主仓多库改造范围内。

## 2. 总体架构与物理包边界

- **拒绝两条死胡同**：① 不自研通用 Mongo Query → SQL 翻译器；② 不按 JSON 嵌套层数机械拆表，仅遵循**四信号拆表法则**（需进 `WHERE/ORDER BY` 反查、高频局部更新/CAS、数组无上限增长、跨行 `SUM/COUNT` 之一才拆关系列或子表，其余直接存 OceanBase 原生 `JSON`）。
- **物理包硬隔离（与 Redis DAL 对称）**：
  - `@fastgpt/global`（browser-safe）：仅放 24 位 Hex `EntityId`、业务枚举与 OpenAPI DTO，不放物理表/集合名；
  - `@fastgpt/dal`（纯服务端）：收口持久化基础设施与领域仓储 `packages/dal/db/repos/<domain>/`（Pro 10 表落 `pro/admin/src/dal/db/repos/`），`packages/dal/package.json` 仅暴露 `repo` 与 `repo.type`，显式把 `mongo/*` 与 `oceanbase/*` 设为 `null` 并辅以 Vitest 插件阻断；
  - `@fastgpt/service`：领域编排封装为 `XxxService` 类 + 构造函数对象注入（默认 `injectRepo(Token)`），单测零 DB 隔离运行。

```text
packages/dal/db/repos/<domain>/
├── repo.type.ts           # 【公开】契约 type、Write/Read Zod Schema、.pick() 窄 DTO
├── repo.ts                # 【公开】defineRepoToken({ mongo, oceanbase })
├── mongo/                 # 【私有】defineMongoCollection + MongoRepositoryBase
│   ├── schema.ts
│   └── repo.ts
└── oceanbase/             # 【私有】行类型、原生 utf8mb4_bin DDL + OceanBaseRepositoryBase
    ├── table.ts
    └── repo.ts
```

## 3. `@fastgpt/dal/db` 底座核心设计

1. **Runtime 与日志双态拓扑（`runtime.ts`）**：
   - 启动入口显式调用 `configureDbRuntime(...)`，内部不隐式读环境变量；
   - `logMode` 双态：配置 `logWriteUrl` 进入 `separate`（独立日志连接池），未配置默认 `shared`（透明回退复用主池，零重复建池）。
2. **显式事务模型 `DbSession` 与 `afterCommit`（`transaction.ts`、`errors.ts`）**：
   - 坚持显式传 `tx?: DbSession`，严禁 `AsyncLocalStorage` 隐式传播（防止 LLM 流式请求/S3 卷入 SQL 长事务耗尽连接池）；
   - `WeakMap` 封装原生会话句柄，校验逻辑 `dialect` 与 `datasource` 隔离；
   - 自动重跑确定已回滚的并发冲突（Mongo `112` / `TransientTransactionError`，OceanBase `1213/1205/6002/6004/6210/6223`）并在重跑前清空 `afterCommit`；
   - **严禁重放提交结果未知错误**：命中 OceanBase `6225`/`4012` 或 Mongo `UnknownTransactionCommitResult` 时一律抛出 `DbTransactionOutcomeUnknownError` 保留 `cause`。
3. **24 位 Hex `EntityId`（`@fastgpt/global/common/string/entityId`）**：
   - 零驱动依赖的 12B 时间序生成器（`4B 秒时间戳 + 5B 进程熵 + 3B 单调计数器`），100% 兼容现有 94 处 24-hex OpenAPI 契约、S3 路径与 `_id > cursor` 字典序游标，OceanBase 中存为 `VARCHAR(24)`。
4. **出口 Zod 分级校验（`parse.ts`）**：
   - 单行读取 `parseRepoRow` 走 **Fail-Fast**（失败抛 `DbRecordCorruptedError`）；
   - 列表批量读取 `parseRepoRows` 走 **Warn & Skip**（整批快路径失败时退化逐行校验，记录结构化告警并跳过坏行）。
5. **消除 Mongo Change Streams（Redis Pub/Sub + Cron 兜底）**：
   - 删除 `watch.ts` 与 `volumnMongoWatch.ts`；`@fastgpt/dal/redis` 增加 `subscriber` 角色与 `SignalPubSubChannel`，写操作通过 `afterMongoCommit` 发布轻量信号，丢消息由周期 Cron 对账兜底。
6. **生产生效 vs OceanBase 预置能力解耦（两步演进）**：
   - **当前阶段（Mongo 生产 + OceanBase 仅测试环境验证）**：Mongo 侧禁用 `autoIndex` + 独立无超时 DDL 连接后台只增补建 + 清零 17 条 `deprecated: true` 墓碑；OceanBase 侧仅维护极简 `mysql2 + Kysely` 测试运行时与原生 `CREATE TABLE IF NOT EXISTS ... utf8mb4_bin` DDL，不提前堆砌生产级迁移账本、读写分离、超时降级或未使用的预置 Helper；
   - **OceanBase 上生产前置阶段（后续独立 PR）**：再补齐版本化 OceanBase DDL 迁移器（Redis 租约锁 + `_fg_migrations` 账本 + 向前兼容回滚）、OceanBase 读写分离/事务超时/慢查询观测，以及带过期时间表的后台分批 TTL 清理。

## 4. 测试体系与演进路线

- **L0 纯内存单测**：Service 构造函数注入 Fake Repo（零 DB）；OceanBase Repo 使用 `createMockOceanBaseKysely` 验证 SQL 与归一化边界；
- **L1/L2 双引擎契约测试**：`MongoMemoryReplSet` + 真实 **SeekDB / OceanBase**（配置 `FASTGPT_TEST_OCEANBASE_URI` 自动运行，`FASTGPT_TEST_REQUIRED_OCEANBASE=1` 强门禁）。

### TODO 路线
- [x] **Phase 0（本 PR — 生产生效 + 测试态 OB 试点）**：极简 DAL 双引擎核心（`mongo` + `oceanbase`）、24-hex `EntityId`、去 Change Streams 切 Redis Pub/Sub、Mongo 异步只增同步与 17 条墓碑清零、Pilot 0（`AppRegistration`）与双轨 `test-dal` CI。
- [ ] **Phase 1**：存量业务表按子域垂直迁入 `@fastgpt/dal/db/repos/`（Pro 10 表入 `pro/admin/src/dal/db/repos/`），按需补充 `OceanBaseRepositoryBase` 公共 Helper，逐域删除旧 `schema.ts` 并最终移除 `packages/service/common/mongo/`。
- [ ] **Phase 2（OceanBase 上生产独立 PR）**：补齐版本化 OceanBase 迁移器、读写分离/超时/观测、启动入口装配与 TTL 后台物理清理任务。
- [ ] **Phase 3**：挂载真实 OceanBase 4.3+ / SeekDB 与 MongoDB 副本集完成全量业务回归与并发压测验收。
