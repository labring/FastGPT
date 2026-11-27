---
name: multi-db-repo-refactor
description: >-
  Guides refactoring FastGPT MongoDB models into dual-engine Domain Repositories supporting
  MongoDB and OceanBase (4.3+ / SeekDB, MySQL mode) with Kysely, Zod read normalization,
  DI tokens, constructor-injected Services, and clean contract/unit tests.
---

# FastGPT MongoDB + OceanBase 领域仓储重构 SOP

本技能用于将存量裸 `Mongo*` 调用分两阶段收敛为 **MongoDB + OceanBase（4.3+ / SeekDB，MySQL 兼容模式）** 领域仓储，不额外兼容 PostgreSQL 或标准 MySQL：

- **Phase 1A（当前默认 · Mongo 先行收口重构）**：优先将全部存量业务表重构为 **数据库无关的领域契约（`repo.type.ts`）+ `mongo/` 完整实现 + `XxxService` 注入切换**，清理旧 `schema.ts` 与 `packages/service/common/mongo/`；此阶段暂不编写 `oceanbase/` 实现：
  - `defineRepoToken` 允许暂缺 `oceanbase`：在**未挂载伴生 Mongo（`fallbackMongo`）的纯 OceanBase** 运行时下保持 fail-closed 抛 `DbConfigurationError`；在**已挂载伴生 `fallbackMongo` 的混合模式**下，Mongo-only 仓储会自动路由至伴生 Mongo，但默认 `runInTransaction(fn)` 仍走主 OceanBase 方言，因此仅操作 Mongo-only 仓储的事务写入必须由编排层显式调用 `runInTransaction(fn, { dialect: 'mongo' })`（避免向 Mongo 仓储传入 OceanBase `DbSession` 触发方言不匹配）；
  - `createContractBackends` 同时省略 `oceanBaseTables` 与 `oceanBaseDdls` 仅跑 Mongo 契约套件，避免在 SeekDB CI 下误报错。
- **Phase 1B（集中补齐 OceanBase）**：待 Mongo 全部收口稳妥后，基于已定型的 `repo.type.ts` 集中补齐各域 `oceanbase/{table.ts,repo.ts}`、`coreOceanBaseDdls`/`proOceanBaseDdls` 及双引擎 SeekDB 契约验证，并将对应编排层的显式 `{ dialect: 'mongo' }` 事务切回默认主方言事务，实现 `packages/service` / 上层调用方零契约返工。

## 核心约束

1. **物理包隔离（`exports` + `tsc` 强制门禁）**：
   - `@fastgpt/global`：仅放前后端共享的 24 位 Hex `EntityId`、业务枚举、OpenAPI DTO，不放数据库物理集合名/表名常量。
   - `@fastgpt/dal`：开源表统一落 `packages/dal/db/repos/<domain>/`（Pro 专属表落 `pro/admin/src/dal/db/repos/<domain>/`）；仅在 `packages/dal/package.json` 暴露 `repo` 与 `repo.type`，`mongo/*` 与 `oceanbase/*` 显式设为 `null`。
   - `@fastgpt/service`：领域编排封装为 `XxxService` 类 + 构造函数对象注入（默认 `injectRepo(Token)`），不引入 Mongoose 或 Kysely 驱动类型。
2. **明确范围外**：
   - `packages/service/core/dataset/image/schema.ts`（Mongo GridFS 历史遗留）：OceanBase 模式下不建表，走只读空降级。
   - `projects/marketplace/**`：独立应用，不在主仓多库范围内。
3. **四信号拆表法则**：仅因 `WHERE/ORDER BY` 反查、高频局部更新/CAS、数组无上限增长、跨行 `SUM/COUNT` 之一才拆关系列或子表；其余聚合根直接存 OceanBase 原生 `JSON`。
4. **OceanBase 建模约定**：
   - 建表统一使用 `DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`，以版本化 SQL 迁移脚本作为表结构单一事实源（SSOT）。
   - 主键统一 `VARCHAR(24)` 存 24 位小写 Hex `EntityId`；进入唯一索引的可空列/软删除列使用哨兵值（`''` / `0`）规避 `NULL != NULL`。
   - 托管索引统一命名 `fg_<table_short>_<purpose>[_vN]`（≤63 ASCII 字节，不碰客户自建索引）；存量 Mongo 索引原位冻结零重建。
   - 充分利用 OceanBase 原生能力：`FOR UPDATE SKIP LOCKED`、`FULLTEXT ... WITH PARSER ik/space`、按 `team_id` 前导列或分区；直接写标准 `ORDER BY` 走索引，不做破坏索引的 `CASE WHEN` 排序体操。

## 标准目录结构

```text
packages/dal/db/repos/<domain>/
├── repo.type.ts           # 【公开】数据库无关领域接口、Read/Write Zod Schema、.pick() 窄 DTO（Phase 1A 必写）
├── repo.ts                # 【公开】defineRepoToken({ mongo, oceanbase? })（Phase 1A 先挂 mongo）
├── mongo/                 # 【私有】（Phase 1A 必写）
│   ├── schema.ts          # 原生 new Schema + defineMongoCollection（零导入副作用）
│   └── repo.ts            # extends MongoRepositoryBase
└── oceanbase/             # 【私有】（Phase 1B 集中补齐；Pilot 0 AppRegistration 已完成）
    ├── table.ts           # 行类型、表名常量与原生 OceanBase CREATE TABLE DDL
    └── repo.ts            # extends OceanBaseRepositoryBase（Kysely + mysql2）

packages/dal/test/db/repos/<domain>/repo.contract.test.ts
packages/service/<domain>/service.ts
packages/service/test/<domain>/service.unit.test.ts
```

## 5 步落地流程（Phase 1A Mongo 先行）

1. **查调用面**：用 `rg` 盘点目标 `MongoXxx` 在 `packages/`、`projects/`、`pro/admin/` 中的全部调用点（含测试夹具），优先选调用点 `<= 15` 的独立表。
2. **建领域仓储（DB 无关契约 + Mongo 实现）**：在 `packages/dal/db/repos/<domain>/` 编写严格的 DB 无关 `repo.type.ts`（仅 24-hex `EntityId` 与显式 `tx?: DbSession`，禁止出现 `ObjectId`/`ClientSession`/`FilterQuery`）、`mongo/{schema.ts,repo.ts}` 与 `repo.ts`（`{ mongo }`），并在 `packages/dal/db/repos/registry.ts` 注册 `coreMongoCollections`、在 `packages/dal/package.json` 暴露 `repo` / `repo.type`（`mongo/*` 与 `oceanbase/*` 设为 `null`）。
3. **核对存量 Mongo 索引**：确保旧 `schema.ts` 的全部现行 `defineIndex` 原样迁入 `defineMongoCollection({ indexes })`，不新增 `deprecated: true` 墓碑。
4. **迁调用方并删旧 Schema**：封装 `XxxService`，迁完所有生产与测试调用方后物理删除旧 `schema.ts`，再用 `rg` 确认非 `migration/` 目录零残留引用。若迁移的写路径位于事务内，且当前仓储尚未提供 `oceanbase/` 实现，编排层需在混合模式（主 OceanBase + 伴生 `fallbackMongo`）下显式使用 `runInTransaction(fn, { dialect: 'mongo' })`，避免默认主方言事务传入 OceanBase `DbSession` 触发方言不匹配（Phase 1B 补齐 `oceanbase/` 后切回默认主方言事务）。
5. **运行最小验证集**：
   - `pnpm --filter @fastgpt/dal typecheck`（涉及上层改动时一并检查对应 workspace）；
   - `pnpm test packages/dal/test/db/package-exports.test.ts packages/dal/test/db/schema-drift-guard.test.ts`；
   - 运行该域契约测试（Phase 1A 在 `repo.contract.test.ts` 调用 `createContractBackends({ mongoCollections: [...] })` 同时省略 `oceanBaseTables` 与 `oceanBaseDdls` 跑 `MongoMemoryReplSet`，并补断言验证**未挂载伴生 `fallbackMongo` 的纯 OceanBase** 运行时访问该仓储 fail-closed 抛 `DbConfigurationError`；若该域编排层包含事务写入，一并覆盖混合模式下显式 `runInTransaction(fn, { dialect: 'mongo' })`；Phase 1B 补 `oceanbase/` 时再同时传入非空的 `oceanBaseTables` 与 `oceanBaseDdls`）及 `service.unit.test.ts`、受影响业务回归单测。
