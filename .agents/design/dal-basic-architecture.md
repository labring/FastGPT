# DAL 基础架构（User 垂直切片）

## 目标

让业务层依赖数据库无关的实体和 Repository 能力，MongoDB、SQL-like 数据库只负责实现适配器。

## 分层

```text
domain/       数据库无关的实体、ID、输入输出 schema
db/           Mongo 与 SQL-like adapter 共用的物理表名
ports/        Repository 接口（业务可依赖的最小能力）
mongodb/      Mongo Schema、ObjectId 转换、Repository 实现
sql/          后续增加 SQL 表结构、字段映射和 Repository 实现
transaction/  数据库无关的事务上下文和事务入口
```

领域对象统一使用 `id: string`。MongoDB 的 `_id: ObjectId` 只在 `mongodb` 层出现，外键也在映射边界转换为字符串。

## User 当前实现

- `domain/user.ts`：`User`、`CreateUser`、`UpdateUser`、`UserCredentials`
- `ports/user.repository.ts`：ID/用户名/凭据查询、创建和更新合约
- `mongodb/models/user.ts`：与生产 User 字段、默认值、密码处理和索引一致的 Mongo Schema
- `mongodb/mappers/user.ts`：显式转换 Mongo 文档，不泄漏 `_id`、`__v` 和 password
- `mongodb/repositories/user.ts`：通过注入 Model 实现 Repository，支持事务 context
- `db/adapter.ts`：数据库无关的 Adapter 合约
- `mongodb/adapter.ts`：Mongo Adapter，从同一个 Mongoose client 组装 Repository 和事务执行器

## 约束

1. 上层不得依赖 Mongo Model、Mongoose Query 或 Mongo 查询对象。
2. `EntityId` 暂不限制为 24 位，以保留 UUID、SQL sequence 等后续实现空间。
3. 数据库字段命名、ID 类型、查询参数转换必须集中在 adapter/mapper 中。
4. 新增数据库实现时复用 `ports` 和 `domain`，不复制业务实体定义。
5. 密码只出现在创建、更新和凭据校验输入中，不属于默认返回的 `User` 实体。
6. Mongo adapter 收到非法 ObjectId 或非本 adapter 创建的事务 context 时必须失败，不能静默降级。

事务由 service 决定边界，通过 `TransactionRunner.withTransaction` 创建。Repository 接收可选的 `TransactionContext`；Mongo adapter 在内部将它映射为 `ClientSession`，SQL adapter 将它映射为 transaction connection。业务层不依赖具体数据库事务类型。

## 错误 Adapter

`DatabaseErrorAdapter` 在 Repository 和事务边界把驱动错误转换为稳定合同。调用方只使用 `execute(handler)`，不维护 operation、mode、outcome 或 retryable 等执行元数据：

| 错误代码 | 语义 |
| --- | --- |
| `DB_INVALID_ARGUMENT` | 参数无法被目标数据库表示，操作未开始 |
| `DB_UNIQUE_CONSTRAINT` | 唯一约束冲突，只暴露冲突字段名 |
| `DB_CONFLICT` | 写冲突或可重试事务冲突 |
| `DB_TIMEOUT` | 操作超时；写操作结果可能未知 |
| `DB_UNAVAILABLE` | 连接、拓扑或节点不可用 |
| `DB_OPERATION_FAILED` | 无法进一步分类的数据库失败 |

`null/false` 表示资源不存在，不使用异常。DAL 不决定 HTTP 状态码、用户文案或业务重试策略；原始驱动错误只保留在 `cause` 中供服务端日志使用。Mongo 事务会把已适配错误的原始 cause 交回 driver，由 `withTransaction` 在内部自行判断是否自动重试，该策略不进入公共错误合同。

## 后续 TODO

- [x] 对齐生产 User Schema、默认值、密码行为与当前索引。
- [x] 补齐 User 基础 Repository 操作和 Mongo 事务支持。
- [x] 补齐 mapper、Schema、Repository、事务和索引局部测试。
- [x] 增加数据库错误 Adapter 与 Mongo 错误映射。
- 增加 SQL-like User adapter，并验证两种 adapter 的行为契约一致。
- 统一 DAL 的分页、唯一约束错误和并发更新抽象。
- 在确认领域字段后，将 `packages/service/support/user` 的调用逐步迁移到 Repository。
