# DAL 局部开发规范

本文件适用于 `packages/dal/**`。它补充根目录 `AGENTS.md` 和
[FastGPT 代码规范](../../.agents/code/syntax.md)，修改 DAL 前必须先阅读并遵守。

## 总体目标

DAL 按业务组织数据访问能力，同时隔离数据库实现：

```text
packages/dal/
├── business/
│   └── support/               # 数据库无关的业务实体、DTO、Repository 合同
├── mongodb/
│   ├── business/
│   │   └── support/           # MongoDB 业务实现
│   └── ...                   # MongoDB 通用基础设施
├── db/                       # 数据库通用类型、错误、并发、事务和表名抽象
└── redis/                    # Redis adapter、cache 和 runtime
```

当前 `business/support` 目录承担 DAL 外层业务定义的职责。它与
`mongodb/business/support` 的职责不同：

- `business/support/<business>` 定义 MongoDB、SQL-like 数据库都能复用的实体、DTO 和 Repository 合同。
- `mongodb/business/support/<business>` 实现 MongoDB 的 Schema、字段映射和 Repository。
- 未来 SQL-like 实现应复用 `business/support`，在自己的 adapter/business 目录实现，不复制公共实体。
- 真正的跨 Repository 业务编排、权限判断和业务规则属于 `packages/service`，不放入 DAL。

## 目录组织

必须以业务域作为主目录，不以 `entity/user`、`repository/user`、`model/user` 等技术类型作为一级分类。

User 垂直切片的标准结构：

```text
business/support/user/
  entity.ts                    # 数据库无关 User 实体
  dto.ts                       # CreateUser、UpdateUser、UserCredentials 等输入结构
  repository.ts                # UserRepository 合同
  team/
    entity.ts                  # 数据库无关 TeamMemberDetail 等实体
    dto.ts                     # 团队相关 DTO
    repository.ts              # TeamRepository 合同
  verification/
    entity.ts                  # 数据库无关 TmpDataMaterial 等实体
    dto.ts                     # 查询过滤 DTO
    repository.ts              # TmpDataRepository 合同

mongodb/business/support/user/
  entity.ts                    # Mongo 文档到公共实体的映射，例如 toUser
  schema.ts                    # User Mongoose Schema、Model 和 SchemaType
  repository.ts                # MongoUserRepository
  team/
    entity.ts                  # Mongo team member 到公共实体的映射
    schema.ts                  # Team Mongoose Schema、Model 和 SchemaType
    repository.ts              # MongoTeamRepository
    group/
      schema.ts                # MemberGroup Mongoose Schema 和 Model
    member/
      schema.ts                # TeamMember Mongoose Schema 和 Model
    org/
      schema.ts                # Org Mongoose Schema 和 Model
  verification/
    schema.ts                  # TmpData Mongoose Schema 和 Model
    repository.ts              # MongoTmpDataRepository
```

`group`、`member`、`org` 是独立业务子目录。不要把它们重新合并成
`group.ts`、`member.ts` 或 `org.ts`。

## 文件职责

### `business/support` 公共业务层

#### `entity.ts`

- 定义对外稳定的实体结构、Zod schema 和 `z.infer` 类型。
- 实体 ID 统一使用 `EntityId`/`string`，不能暴露 Mongo `ObjectId`。
- 可以依赖 `@fastgpt/global`、`db/types` 和数据库无关的 transaction 类型。
- 禁止引入 `mongoose`、Mongo Model、Mongo Query、`ClientSession`、集合名、`defineIndex` 或 Mongo 工具。
- 不负责查询数据库，也不放 `findById`、`create` 等持久化方法。

#### `dto.ts`

- 定义创建、更新、查询和凭据等输入 DTO。
- 可复用 `entity.ts` 的公共 schema，避免重复定义同一结构。
- DTO 不得包含 Mongo 专用字段和数据库驱动类型。

#### `repository.ts`

- 只定义数据库无关的 Repository 合同和参数类型。
- 方法参数、返回值和事务上下文必须使用公共实体、DTO、`EntityId`、`TransactionContext`。
- 不得实现数据库查询，不得导入 Mongoose 或 Mongo adapter。

### `mongodb/business/support` Mongo 实现层

#### `schema.ts`

- 定义 Mongoose `Schema`、Model 工厂、Mongoose SchemaType 和 Mongo 文档类型。
- 所有 FastGPT 管理的索引必须使用 `defineIndex` 声明，禁止直接调用 `schema.index()`。
- 字段默认值、密码 setter、引用关系、TTL、唯一约束等 Mongo 持久化细节放在这里。
- Schema 文件可以依赖 `mongodb` 通用基础设施和 `db/tables`，但不能反向修改公共实体契约。

#### `entity.ts`

- 负责 Mongo 文档与公共实体之间的字段映射和归一化。
- `toUser`、`toTeamMemberDetail` 等函数必须保留在对应 `mongodb/business/support` 业务目录的 `entity.ts`。
- 负责 `ObjectId -> string`、历史字段默认值、Mongo 元数据隐藏等边界转换。
- 不定义 Mongoose Schema，不把公共实体改成 Mongo 文档类型。

#### `repository.ts`

- 实现 `business/support` 中对应的 Repository 合同。
- 可以使用 Mongoose Model、Query、ClientSession、Mongo 错误适配和 Mongo 事务工具。
- 数据库错误必须经过 `DatabaseErrorAdapter`，事务必须使用公共 `TransactionContext` 映射到 Mongo session。
- 查询、写入、投影、CAS 更新等持久化细节放在这里；返回结果必须经过 Mongo `entity.ts` 映射。
- 不在 Repository 中编排跨业务服务、处理权限或决定 HTTP 错误。

#### `index.ts`

- 作为目录的统一对外出口，只做实际实现的聚合导出。
- 不创建旧路径兼容转发文件。
- 对外导出 Mongo Schema、Model 工厂、映射函数和 Repository 实现时，必须从对应目录入口导出。

## 依赖方向

允许的依赖关系：

```text
packages/service
      │
      ▼
business/support/<business>  ◄── mongodb/business/support/<business>
      ▲                         │
      │                         ▼
      └────────────── mongodb 通用基础设施 / db / transaction
```

具体要求：

- `business/support` 不得依赖 `mongodb/business`。
- `business/support` 不得依赖 `mongodb` 目录中的实现文件。
- `mongodb/business/support` 可以依赖 `business/support` 合同和 `mongodb` 通用基础设施。
- `packages/service` 优先依赖 `business/support` 合同或 `common/dal` 出口，不直接依赖 Mongo Model。
- 新增 SQL-like adapter 时，复用 `business/support` 合同，不修改公共实体以适配某一种数据库。

## 命名和边界规则

- `entity.ts` 是公共实体或数据库边界映射；`schema.ts` 在 Mongo business 中专指 Mongoose Schema。
- 不要把 Mongoose Schema 放到公共 `business/support` 的 `entity.ts`。
- 不要把 `toUser`、`toTeamMemberDetail` 移入 Repository；映射职责属于 Mongo `entity.ts`。
- 不要在公共层暴露 `_id`、`__v`、password 或其他 Mongo 文档元数据。
- 不要在 DAL 中复制 `packages/service` 已有的业务 Schema；只定义 DAL 所需的最小实体和合同。
- 使用 `type`，不使用 `interface`；Zod schema 应通过 `z.infer` 推导类型。
- 目录需要对外导出时使用 `index.ts`，不要创建只为兼容旧路径的转发文件。

## Mongo Schema 与索引

- 新增或修改字段、索引、唯一约束、TTL、partial filter、collation 时，必须检查历史索引。
- 明确由 FastGPT 创建且已废弃的历史索引，使用 `defineIndex(schema, { ..., deprecated: true })` 登记。
- 不登记客户自建索引、来源不明的索引，也不能仅凭当前 Schema 未声明就推断其废弃。
- DAL Mongo Model 必须通过 `getDalModel` 注册，以确保公共中间件和 Model 复用逻辑一致。
- 数据库无关事务合同统一放在 `db/transaction.ts`，Mongo session 适配放在 `mongodb/transaction.ts`。

## 测试要求

- Mongo business 的测试放在 `packages/dal/test/mongodb/business/<business>`，目录结构应尽量对应实现目录。
- `schema` 测试覆盖默认值、字段行为和索引声明。
- `entity` 测试覆盖文档映射、历史数据默认值、Mongo 元数据隐藏和非法值处理。
- `repository` 测试覆盖查询条件、事务 session、错误适配、资源不存在和并发行为。
- 修改 DAL 后至少运行 `pnpm --filter @fastgpt/dal typecheck` 和相关局部测试；不要在开发过程中用全量测试替代局部验证。
