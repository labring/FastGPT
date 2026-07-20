# MongoDB 索引同步安全化方案

## 背景

私有化部署客户可能会通过 `mongosh`、运维脚本或数据库管理平台为 MongoDB 集合添加自定义索引。当前 FastGPT 在模型加载时调用 Mongoose `model.syncIndexes()`，该 API 的语义是让数据库索引与 schema 中声明的索引保持一致：创建缺失索引，同时删除 schema 中不存在的索引。

这会导致服务每次重启时都可能删除客户自建索引。现有 `SYNC_INDEX=false` 能临时关闭启动同步，但它把“补建 FastGPT 必需索引”和“删除旧索引/未知索引”一起关闭了，升级时容易漏建新索引或遗留旧唯一索引。

## 改造前代码现状

- 主应用入口：`packages/service/common/mongo/index.ts`
  - `getMongoModel()` / `getMongoLogModel()` 编译 model 后调用 `syncMongoIndex(model)`。
  - `syncMongoIndex()` 在非测试、非构建、`SYNC_INDEX=true` 且存在 `MONGO_URL` 时执行 `await model.syncIndexes({ background: true })`。
- Marketplace 入口：`projects/marketplace/src/service/mongo/index.ts`
  - 同样在 model 编译后调用 `model.syncIndexes({ background: true })`。
  - 当前没有 `await`，`try/catch` 捕不到异步失败。
- 环境变量：
  - `packages/service/env.ts` 和 `projects/marketplace/src/env.ts` 均定义 `SYNC_INDEX: BoolSchema.default(true)`。
- 部署文档默认仍配置 `SYNC_INDEX: true`。

## 已确认决策

1. 启动时默认执行 manager 管理的主动安全同步，不再通过环境变量切换索引处理模式。
2. 移除 `MONGO_INDEX_SYNC_MODE`；已经移除的 `SYNC_INDEX` 也不恢复兼容逻辑。
3. 主动安全同步固定执行“创建当前 schema 缺失索引 + 删除该 schema 显式声明的废弃索引”，不会调用 Mongoose 具有破坏性语义的 `syncIndexes()`。
4. 废弃索引不再集中维护 registry，而是与当前索引一起维护在所属 Schema 文件中；collection 从 model 推导，声明本身不再重复填写 collection name。
5. schema 外且未被显式声明为废弃的索引一律保留，只记录差异和告警，避免删除客户自建索引。
6. `llm_request_records.requestId_1` 已确认不再需要，但此前已明确不纳入本次清理；本次仅迁移现有中心清单中的 chat 和 sandbox 废弃索引，不顺带扩大删除范围。

## 根因判断

`syncIndexes()` 不是单纯“创建索引”，而是完整 reconcile：

1. 计算 schema 与数据库已有索引差异。
2. 删除 schema 中不存在的索引。
3. 创建 schema 中缺失的索引。

因此客户自建索引被删除是当前 API 选择带来的必然行为，不是异常分支。

## 设计目标

1. 默认保护客户自建索引：启动时不删除 schema 未声明的索引。
2. 仍能自动补建 FastGPT 新版本需要的缺失索引。
3. 保留可复用的差异检查能力，帮助日志或后续管理入口识别 schema 外索引和缺失索引。
4. 不再保留启动期模式选择或强制全量同步能力，避免配置分支导致不同部署的索引状态长期分叉。
5. 主应用与 Marketplace 使用一致的索引策略和错误处理。

## 非目标

- 不尝试自动判断所有未知索引是否由客户创建。历史上未带所有权标记，完全自动判断不可靠。
- 不删除 Schema 未明确登记为废弃的索引。
- 不提供环境变量关闭索引创建或废弃索引清理。

## 推荐方案

### 1. 固定执行主动安全同步

移除 `packages/service/env.ts` 和 `projects/marketplace/src/env.ts` 中的 `MONGO_INDEX_SYNC_MODE`。主应用和 Marketplace 在满足现有运行条件时固定执行同一条索引同步链路，不再支持 `off/create/dryRun/sync` 启动模式。

同步内部使用 Mongoose 的 `createIndexes()` 创建当前 Schema 索引，不执行 `syncIndexes()` 或 `cleanIndexes()`。创建完成后，再处理当前 Schema 显式声明的废弃索引。

建议同时记录差异日志：

- `toCreate`：即将创建的 FastGPT schema 索引。
- `toDrop`：数据库存在但 schema 不声明的索引，只告警，不删除。
- 冲突：同名或同 key 但 options 不一致的索引，交由 `createIndexes()` 抛错并记录日志，提示需要迁移或人工处理。

不建议只简单替换成 `model.createIndexes()` 后结束，原因是：

1. `createIndexes()` 对已有索引 options 不做修正。TTL、unique、partialFilterExpression 变化时，旧索引仍会保留旧行为。
2. 它缺少差异报告，管理员无法知道哪些旧索引需要人工处理或迁移。
3. 它不处理旧索引 options 变化或历史旧索引清理，因此需要由 schema-local 废弃声明补足。

因此可以内部用 `createIndexes()` 完成安全创建，但对外的抽象应是 `mongoIndexManager`，保留 inspect 和未来管理入口的扩展点。

### 2. Schema 内声明废弃索引

在 Mongo 公共模块提供 schema-level 注册 helper。Schema 文件继续使用 `schema.index(...)` 声明当前索引，并在相邻位置调用 helper 声明该 Schema 需要删除的历史索引。helper 只保存元数据，不把自定义 options 传给 Mongoose 或 MongoDB。

建议 API 形态：

```ts
registerDeprecatedMongoIndexes(ChatSchema, [
  {
    indexName: 'appId_1_chatId_1',
    key: { appId: 1, chatId: 1 },
    options: { unique: true }
  }
]);
```

元数据应挂在 Schema 实例自身，并使用 Mongo 公共模块私有的 symbol key 读写；不使用中心数组，也不使用可能在热加载或重复模块实例间丢失关联的进程级 `WeakMap`。manager 从 `model.schema` 读取这份元数据。

废弃索引定义只包含 `indexName`、`key` 和需要参与精确匹配的可选关键 options。

定义不包含 `collectionName`、版本或说明字段。manager 从 model 获取 collection，并且只处理 model.schema 上登记的废弃项。这能让当前索引和历史删除声明在同一个业务 Schema 文件中完成 review，也避免中心清单与 Schema 演进脱节。

现有中心清单迁移位置：

- chat 废弃索引迁移到 `packages/service/core/chat/chatSchema.ts`。
- sandbox instance 废弃索引迁移到 `packages/service/core/ai/sandbox/infrastructure/instance/schema.ts`。
- 迁移完成后删除 `packages/service/common/mongo/deprecatedIndexes.ts`。

### 3. 历史旧索引处理边界

主动同步只允许清理当前 Schema 显式登记的 FastGPT 废弃索引，并且删除前必须精确匹配 index name、key 和关键 options。

该边界的原因：

1. 当前核心目标是保护客户自建索引，不能按 schema 外索引一概删除。
2. 历史旧索引只能通过所属 Schema 的明确声明识别，不能自动猜测。
3. 必须先成功创建当前索引，再执行该 model 的废弃索引清理；创建失败时不继续删除，避免替代索引缺失。
4. 多实例重复执行必须保持幂等：索引已不存在时视为跳过，定义不匹配时保留并告警。

### 4. 提供可审计的管理入口

建议新增 Root 管理员 API 或脚本：

- `POST /api/admin/mongoIndexes/inspect`
  - 默认 dry-run。
  - 输出每个集合的 `toCreate`、`unknownIndexes`、`conflicts`、`fastgptObsoleteIndexes`。
- `POST /api/admin/mongoIndexes/apply`
  - 只应用 manager 已定义的安全同步动作。
  - 不提供旧式全量同步能力。

本次先完成固定的启动同步行为，Root 管理员 API 或脚本作为后续增强。

### 5. 未来索引命名规范

新建 FastGPT schema 索引尽量显式命名，例如 `fg_<collection>_<purpose>`，降低未来识别成本。

注意：不能一次性给所有旧索引改名，因为 MongoDB 不支持直接重命名索引，改名通常等价于新建再删除，容易触发冲突和重建成本。旧索引应通过迁移清单逐步治理。

## 推荐落地架构

### 1. 模块划分

建议在 `packages/service/common/mongo/` 下新增索引管理模块：

- `indexManager.ts`
  - `MongoIndexManager.syncModelIndexes()`
  - `MongoIndexManager.inspectModelIndexes()`
  - `MongoIndexManager.cleanupModelDeprecatedIndexes()`
  - `MongoIndexManager.formatCleanupReport()`
- schema metadata helper
  - 注册和读取某个 Schema 的废弃索引定义。
  - 类型不包含 collection name，避免业务 Schema 重复维护集合信息。

`getMongoModel()` / `getMongoLogModel()` 只负责把 model 注册给 manager，不直接调用 Mongoose 的 destructive API。这样后续可以统一做并发控制、日志聚合和管理 API 复用。

### 2. 启动流程

每个 model 固定执行：

1. 用 `diffIndexes()` 检查 `toCreate` 和 schema 外索引，仅用于日志与结果报告。
2. 用 `createIndexes()` 创建当前 Schema 声明的索引。
3. 读取 model.schema 上登记的废弃索引定义。
4. 在当前 model 对应 collection 中逐项精确匹配并删除；未知索引不参与删除。

废弃清理从连接级全局阶段下沉到 model 任务后，不再需要等待全连接所有 model 的索引任务，也不再需要 `connectMongo({ cleanupDeprecatedIndexes })` 这类入口开关。

### 3. 并发与失败处理

当前 model 加载时即触发索引同步。后续实现至少要保证：

1. 同一进程内同一 model 的并发索引任务会复用；任务结束后允许后续调用重新检查，以支持热加载和重连。
2. 多实例并发启动时，重复创建索引错误可识别并降噪；真正的冲突错误必须记录。
3. 索引任务失败不应让 model 注册失败，但要有明确日志，必要时在健康检查或管理 API 暴露状态。
4. Marketplace 已修正异步错误捕获，后续如果引入管理入口，应继续复用同一 manager。

### 4. 日志分级

- `debug`：每个 model 输出完整 diff、schema 外索引名称和 schema-local 废弃项扫描明细。
- `info`：每个 model 输出索引同步结果摘要，并记录实际 drop 的废弃索引。
- `warn`：输出需要运维关注但不阻塞启动的问题，例如检测到 schema 外索引或废弃索引定义不匹配。
- `error`：输出索引创建或废弃索引清理失败，保留 model、collection 和 error 信息。

### 5. 本次交付边界

- 移除 `MONGO_INDEX_SYNC_MODE`，启动时固定执行主动安全同步。
- 固定同步语义为 `createIndexes()` + 当前 Schema 显式声明的 deprecated cleanup。
- 将中心废弃索引清单迁移到 chat 和 sandbox instance Schema，随后删除中心 registry。
- 加日志说明 `toCreate/toDrop`，但 `toDrop` 不删除；索引冲突由 `createIndexes()` 错误日志暴露。
- 主应用与 Marketplace 行为一致。
- 补回归测试：客户自建索引不会被删除，只删除当前 Schema 登记且精确匹配的废弃索引。
- 代码确认后再更新 `.mdx` 文档，并由生成流程统一产出 `.yml` 部署文件。

Root 管理员 inspect/apply API 或等价脚本作为后续增强，不阻塞本次修复。

## 已知历史旧索引记录

### `llm_request_records.requestId_1`

- 引入提交：`76d6234de V4.14.7 features (#6406)`，提交时间 `2026-02-12 16:37:50 +0800`。
- 引入方式：`packages/service/core/ai/record/schema.ts` 初次新增 LLM 请求追踪记录时，在 `requestId` path 上声明 `unique: true`。MongoDB 自动生成索引名 `requestId_1`。
- 变更提交：`f008ea971 feat: teamId in reacord llm`，提交时间 `2026-06-25 12:27:57 +0800`；后续合并提交 `60c62b7af Fix test (#7179)` 包含同样变更。
- 变更原因：LLM 请求追踪记录新增 `teamId` 隔离，查询从 `{ requestId }` 调整为 `{ requestId, teamId }`，唯一索引从单字段 `requestId` 调整为复合 `{ teamId: 1, requestId: 1 }`。
- 当前判断：旧 `requestId_1` 对当前 schema 已无必要，且可能继续施加跨团队全局唯一约束。但 `requestId` 由 `getNanoid(12)` 生成，实际碰撞概率很低；请求追踪记录保存失败只记录错误，不阻塞主流程。
- 处理边界：本次不为它新增 schema-local 废弃声明。后续如需清理，应单独确认后在 `packages/service/core/ai/record/schema.ts` 声明并补回归测试。

## 边界与风险

1. `createIndexes()` 不会更新已存在索引的 options。TTL 秒数、unique、partialFilterExpression 等发生变化时，需要独立 migration 或人工处理。
2. 旧唯一索引如果不删除，可能继续影响业务。例如 `llm_request_records` 从 `{ requestId }` 改到 `{ teamId, requestId }` 后，旧 `requestId_1` 若残留，会继续限制跨团队相同 requestId。
3. 旧式 Mongoose 全量同步不作为启动行为暴露，避免重新引入删除客户索引的风险。
4. 多实例同时启动会并发创建索引。MongoDB 创建已存在索引通常是幂等的，但冲突错误需要聚合成清晰日志，避免噪声刷屏。
5. Marketplace 已统一接入 `mongoIndexManager`，异步错误会被捕获并记录。
6. 主动清理意味着错误的 schema-local 声明会在服务启动时生效，因此定义 review 和精确匹配是必须保留的防线。

## 测试策略

至少需要覆盖：

1. 固定同步会创建 Schema 中缺失索引，并保留未登记的 schema 外索引。
2. Schema 未登记废弃项时不执行任何删除。
3. Schema 登记的废弃索引只有在 name、key 和关键 options 精确匹配时才删除。
4. 当前索引创建失败时不删除废弃索引。
5. 相同名称但定义不同的客户索引保留并告警。
6. 已不存在的废弃索引、多实例并发重复清理保持幂等。
7. chat 和 sandbox 的现有中心清单迁移后行为不变。
8. 主应用与 Marketplace 均固定调用同一 manager，异步错误可以被捕获并记录。

仓库已有 `mongodb-memory-server` 测试环境，可以写真实 MongoDB 索引回归测试，而不是只 mock Mongoose 方法。

## 后续增强

1. 是否继续补 Root 管理员 inspect/apply API，提供启动日志之外的索引诊断入口。
2. 是否将 `llm_request_records.requestId_1` 纳入对应 Schema 的废弃索引声明。
3. 对客户自己改动 FastGPT 既有索引 options 的情况，当前只告警；如未来需要自动修正，应以明确迁移项实现。

## TODO

- [x] 确认修订方案：移除模式变量，固定执行主动安全同步，废弃索引下沉到所属 Schema。
- [x] 新增 schema-level 废弃索引注册与读取能力；定义仅包含 name、key 和用于精确匹配的可选关键 options。
- [x] 重构 `MongoIndexManager`：移除 mode 分支，按 model 依次执行 inspect、`createIndexes()` 和 schema-local deprecated cleanup。
- [x] 将 chat 与 sandbox instance 的现有废弃索引定义迁移到对应 Schema 文件，并删除中心 `deprecatedIndexes.ts`。
- [x] 移除连接级 cleanup 任务、等待逻辑、`connectMongo.cleanupDeprecatedIndexes` 参数及 instrumentation 调用。
- [x] 从主应用和 Marketplace env 中移除 `MONGO_INDEX_SYNC_MODE`，删除 manager 中的 mode 类型及对应 env 测试。
- [x] 简化主应用 `getMongoModel()` / `getMongoLogModel()` 与 Marketplace `getMongoModel()` 的 manager 调用，保持异步错误日志完整。
- [x] 更新 `AGENTS.md` 的 MongoDB Schema 与索引维护约束，要求在所属 Schema 中声明废弃索引，不再引用中心清单。
- [x] 调整 manager 单元测试和真实 MongoDB 回归测试，覆盖安全创建、schema-local 精确删除、未知索引保留和并发幂等。
- [x] 运行索引管理相关局部测试与类型检查；实现全部完成后再运行全量测试（全量并发运行出现 9 个无关超时失败，失败文件在单 worker 下全部复跑通过）。
- [x] 检查并移除 `.mdx`、部署配置和其他文档中的 `MONGO_INDEX_SYNC_MODE` 引用；需要生成的 `.yml` 通过既有生成流程更新。
- [ ] 后续增强：新增 Root 管理员 inspect/apply API 或等价脚本。
