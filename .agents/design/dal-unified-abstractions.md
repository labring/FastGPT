# M8：统一 DAL 的分页、唯一约束错误和并发更新抽象

关联任务：Kaneo M#8。前置设计：[dal-basic-architecture.md](./dal-basic-architecture.md)。

## 目标

为后续 Repository 提供统一的三个通用能力，先以 Mongo adapter 为基准落地并补契约测试；SQL 契约一致性验证随延后的 SQL 项目另行进行。

## 现状

- 唯一约束冲突字段暴露已实现：`MongoErrorAdapter` 从 `keyPattern` 提取字段（排序后暴露），不泄漏 `keyValue`；已有单元测试（`mongodb/errors.test.ts`）与仓储测试（`repositories/user.test.ts`：duplicate write 断言 `fields: ['username']` 且 message 不含值）。**本任务不重复实现，只保持契约。**
- 分页、并发更新无 DAL 抽象。

## 1. 分页统一结构

- `packages/dal/db/pagination.ts`（数据库无关契约）：
  - `PageParams = { page: number; pageSize: number }`（1-based）
  - `PageResult<T> = { total: number; list: T[] }`（与业务侧 `PaginationResponseType` 对齐）
  - `normalizePageParams(params, opts?)` → `{ skip, limit }`：缺省 `page=1`、`pageSize=10`，`pageSize` 上限可配（默认 100），非法输入取默认值。
- `packages/dal/mongodb/pagination.ts`（Mongo 实现）：
  - `paginate({ model, filter, page, pageSize, sort, session })`：`countDocuments` 与 `find().sort().skip().limit().lean()` 并行执行，返回 `PageResult<文档>`；支持 `ClientSession`（供事务内分页）。

## 2. 并发更新/乐观锁语义

语义约定（与「`null/false` 表示资源不存在」区分）：

- Repository 提供 `updateByIdIfState(id, expected, patch, context?)`：用「期望状态」做原子条件更新（CAS）。
- 期望状态匹配：正常更新，返回更新后的实体。
- 文档不存在：返回 `null`（保持既有语义）。
- 文档存在但期望状态不匹配：抛 `DatabaseConflictError`（`DB_CONFLICT`），语义是「并发写冲突」，与「不存在」区分开。

实现：

- `packages/dal/db/concurrency.ts`：契约类型 `ExpectedState<T>`、`CasUpdate` 接口（文档说明 mismatch → `DB_CONFLICT`）。
- `packages/dal/mongodb/concurrency.ts`：`casUpdateById({ model, id, expected, patch, session })`，基于 `findOneAndUpdate({ _id, ...expected }, { $set: patch }, { new: true })`；文档存在但未命中返回 `null` 供 Repository 映射为 `DB_CONFLICT`。
- `UserRepository` port 增加 `updateByIdIfState`；`MongoUserRepository` 实现：id 经 `toMongoObjectId` 转换，expected/patch 为领域字段（当前 User 领域字段与文档字段同名，字段映射由各 Repository 的 mapper 集中负责，本实现直接透传）。
- 设计决策记录：CAS 不匹配抛 `DB_CONFLICT` 而非返回 `null`，避免业务无法区分「不存在」与「并发冲突」；原始驱动错误只保留在 `cause`。

## 测试

- `test/db/pagination.test.ts`：`normalizePageParams` 边界（缺省、上限、非法值）。
- `test/mongodb/pagination.test.ts`：`paginate` 的 total/list、skip/limit、sort、session 透传（mock model）。
- `test/mongodb/concurrency.test.ts`：`casUpdateById` 匹配更新、不匹配返回 null、非法 id 报错（mock model）。
- `test/mongodb/repositories/user.test.ts`：新增 `updateByIdIfState` 用例（匹配→新实体；不匹配→`DB_CONFLICT`；不存在→null；非法 id→`DB_INVALID_ARGUMENT`）。

## 不做的内容

- 不新增未被业务调用的 Repository 分页方法（User 尚无分页业务需求，抽象先落在 db/mongodb 层）。
- 不修改 `DatabaseUniqueConstraintError` 现有语义与字段暴露逻辑。
- 不在本次引入 `version` 字段（生产 User Schema 无该字段；乐观锁以期望状态 CAS 表达，字段可由业务按需选用）。
