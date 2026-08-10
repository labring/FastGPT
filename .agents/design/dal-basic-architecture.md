# DAL 基础架构（User 垂直切片）

## 目标

让业务层依赖数据库无关的实体和 Repository 能力，MongoDB、SQL-like 数据库只负责实现适配器。

## 分层

```text
domain/       数据库无关的实体、ID、输入输出 schema
ports/        Repository 接口（业务可依赖的最小能力）
mongodb/      Mongo Schema、ObjectId 转换、Repository 实现
sql/          后续增加 SQL 表结构、字段映射和 Repository 实现
transaction/  数据库无关的事务上下文和事务入口
```

领域对象统一使用 `id: string`。MongoDB 的 `_id: ObjectId` 只在 `mongodb` 层出现，外键也在映射边界转换为字符串。

## User 当前实现

- `domain/user.ts`：`User`、`CreateUser`、`UpdateUser`
- `ports/user.repository.ts`：查询、创建、更新的最小 Repository 合约
- `mongodb/models/user.ts`：Mongo 文档 schema，使用 `_id`
- `mongodb/mappers/user.ts`：Mongo 文档到领域对象的转换
- `mongodb/repositories/user.ts`：通过注入 Mongoose Model 实现 Repository，便于测试

## 约束

1. 上层不得依赖 Mongo Model、Mongoose Query 或 Mongo 查询对象。
2. `EntityId` 暂不限制为 24 位，以保留 UUID、SQL sequence 等后续实现空间。
3. 数据库字段命名、ID 类型、查询参数转换必须集中在 adapter/mapper 中。
4. 新增数据库实现时复用 `ports` 和 `domain`，不复制业务实体定义。

事务由 service 决定边界，通过 `TransactionRunner.withTransaction` 创建。Repository 接收可选的 `TransactionContext`；Mongo adapter 在内部将它映射为 `ClientSession`，SQL adapter 将它映射为 transaction connection。业务层不依赖具体数据库事务类型。

## 后续 TODO

- 增加 SQL-like User adapter，并验证两种 adapter 的行为契约一致。
- 统一 DAL 的事务、分页、唯一约束错误和并发更新抽象。
- 在确认领域字段后，将 `packages/service/support/user` 的调用逐步迁移到 Repository。
