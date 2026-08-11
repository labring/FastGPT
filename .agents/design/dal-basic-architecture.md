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

## 业务侧试接入

`packages/service/common/dal/` 是业务侧的新 DAL 组装目录，不修改原有 `common/mongo`。Mongo DAL 在 service 层拥有**独立连接**，不复用 `connectionMongo`，连接生命周期由 dal/mongo 自己管理。

目录结构：

```text
packages/service/common/dal/
  index.ts        # 数据库无关出口：createRepositories() 按 DAL_DB_TYPE 组装 userRepository，导出 transactionRunner 及接口类型（DatabaseAdapter/UserRepository/TransactionRunner）；后续实体增加 team.ts、app.ts
  mongo/
    index.ts      # Mongo composition root：createMongoDal(client?)、mongoDal、transactionRunner，唯一接触 MongoAdapter 具体实现的模块
    connection.ts # MongooseConnection 类 + connection 单例（client/connect/disconnect）
    config.ts     # 连接参数配置（池大小、超时等）+ 连接事件监听注册 registerMongooseListeners
```

连接设计：

- `connection.ts` 定义 `MongooseConnection` 类：`client` getter 暴露底层 `Mongoose` 实例（作为 adapter 的 client），`connect(url?)` 负责连接与失败重试，`disconnect()` 断开连接；连接事件监听由 `config.ts` 的 `registerMongooseListeners` 注册；导出单例 `connection`，不使用挂载到 `global` 的缓存模式。
- dal/mongo 是自包含的 service 层连接模块，不依赖 `common/mongo` 与 `common/mongo/init.ts`：连接参数与监听注册由 `config.ts` 提供，连接与失败重试由 `connection.ts` 实现。
- 生产接线在 `projects/app/src/instrumentation-node.ts` 增加 `connect-dal-mongo` 初始化步骤（调用 `connection.connect()`）；测试接线在 `test/setup.ts` 连接内存 MongoDB，`afterAll` 断开。
- 测试 mock（`test/mocks/common/mongo.ts`）mock `connection.connect`，沿用按测试文件/实例隔离的数据库分配，并让 DAL 连接实例与 `connectionMongo` 共享同一测试库，保证迁移期旧 Model 写入的数据可被 DAL Repository 交叉读取；生产环境两者本就指向同一数据库。
- 业务侧从 `@fastgpt/service/common/dal` 导入：`import { userRepository } from '@fastgpt/service/common/dal'`，调用 `userRepository.findById(...)`；事务入口从同一入口获取 `transactionRunner`，保证 repository 与事务 context 来自同一个 adapter。

解耦约束：

- 业务侧导入路径不带 `mongo`，`userRepository`/`transactionRunner` 的类型一律是 `@fastgpt/dal` 的接口（`UserRepository`/`TransactionRunner`/`DatabaseAdapter`），业务代码不感知具体数据库实现。
- `common/dal/mongo` 是 service 层 composition root，只负责用独立连接组装 `MongoAdapter` 并导出单例；新增 SQL adapter 时仅替换 `mongo/index.ts` 内部的组装，`common/dal` 的出口和业务导入路径不变。
- 数据库 adapter 选择由 `DAL_DB_TYPE`（`mongo`/`sql`，默认 `mongo`）决定，声明在 `packages/service/env.ts`；`common/dal/index.ts` 的 `createRepositories()` 按该变量组装 Repository，`sql` 接入前显式失败。

独立连接的代价与边界：

- 应用会存在第二个 Mongo 连接池（大小由 `DB_MAX_LINK` 控制），部署时需确认 Mongo 连接数上限。
- DAL Model 与旧 Model 指向同一 `users` 集合，索引自动创建幂等；DAL Model 尚未接入业务侧 `addCommonMiddleware` 慢查询日志和 `MongoIndexManager` 统一管理，删除旧 Model 前必须补齐。

首批只迁移不依赖旧 `ClientSession`、Mongoose Document 或字段投影的调用：

- 系统管理员鉴权通过 `userRepository.findById` 查询 root 用户。
- Chat Completion auth proxy 通过 `userRepository.findByUsername` 获取领域对象的 `id: string`。
- `authUserExist` 以及不带 session 的 `getUserDetail` 已使用 DAL；`getUserDetail` 对旧 `ClientSession` 保留显式兼容分支。
- 密码过期检查、过期密码重置、旧密码校验与密码更新已切换到 `UserRepository`。

仍接收旧 `ClientSession` 的业务暂不迁移；这类调用需要先把事务边界整体切换到 DAL 的 `TransactionContext`，不能把两种事务上下文混用。当前明确延后的边界包括：

- 验证码登录会在旧事务中返回并修改 Mongoose Document。
- 用户资料更新同时修改 TeamMember 和头像资源。
- root 用户初始化同时创建默认团队。
- 日志导出中的 `users` `$lookup` 属于跨集合读模型，未下沉到 UserRepository。

迁移期间旧 User Model 仍负责索引同步。DAL Model 尚未接入业务侧 `addCommonMiddleware` 的慢查询日志，也未被 `MongoIndexManager` 管理；在删除旧 Model 前必须补齐这两个生命周期能力。

## 后续 TODO

- [x] 对齐生产 User Schema、默认值、密码行为与当前索引。
- [x] 补齐 User 基础 Repository 操作和 Mongo 事务支持。
- [x] 补齐 mapper、Schema、Repository、事务和索引局部测试。
- [x] 增加数据库错误 Adapter 与 Mongo 错误映射。
- [ ] ~~增加 SQL-like User adapter（接入 `DAL_DB_TYPE=sql` 分支）~~ 已延后：整个 MongoDB 重构完成后再考虑，另起项目跟进。
- [x] 统一 DAL 的分页、唯一约束错误和并发更新抽象。
- [x] 将 `packages/service/support/user` 的调用迁移到 Repository（M9：loginByPassword /
  update.ts / initRootUser / crm.ts / getUserDetail 兼容分支，详见
  [dal-m9-user-call-migration.md](./dal-m9-user-call-migration.md)）。
- 接入独立 DAL 连接后，验证与主连接的索引同步、慢查询日志和生命周期管理。
  （M10 代码接入完成：慢查询中间件 + MongoIndexManager 同步；运行时验证依赖 M11
  连接池部署观测，详见 [dal-m10-model-lifecycle.md](./dal-m10-model-lifecycle.md)。）
