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

1. 私有化默认行为从破坏性全量同步改为 safe create：只补建 FastGPT 缺失索引，不删除 schema 外索引。
2. 不保留 `SYNC_INDEX` 兼容逻辑，直接移除旧布尔变量，统一改用 `MONGO_INDEX_SYNC_MODE`。
3. 当前启动索引处理不提供删除索引能力，历史旧索引清理留给后续独立迁移工具。
4. `llm_request_records.requestId_1` 已确认不再需要，但不在本次启动索引同步中清理。

## 根因判断

`syncIndexes()` 不是单纯“创建索引”，而是完整 reconcile：

1. 计算 schema 与数据库已有索引差异。
2. 删除 schema 中不存在的索引。
3. 创建 schema 中缺失的索引。

因此客户自建索引被删除是当前 API 选择带来的必然行为，不是异常分支。

## 设计目标

1. 默认保护客户自建索引：启动时不删除 schema 未声明的索引。
2. 仍能自动补建 FastGPT 新版本需要的缺失索引。
3. 提供 dry-run 差异检查，帮助管理员识别 schema 外索引和缺失索引。
4. 当前方案不再保留启动期强制全量同步能力，避免换一种方式重新引入删除客户索引的风险。
5. 主应用与 Marketplace 使用一致的索引策略和错误处理。

## 非目标

- 不尝试自动判断所有未知索引是否由客户创建。历史上未带所有权标记，完全自动判断不可靠。
- 不在普通服务重启时执行危险删除。
- 不把 `SYNC_INDEX=false` 作为长期推荐方案，因为它也会阻止新索引创建。

## 推荐方案

### 1. 引入索引同步模式

新增枚举型环境变量，例如 `MONGO_INDEX_SYNC_MODE`：

| 模式 | 启动行为 | 是否删除未知索引 | 使用场景 |
| --- | --- | --- | --- |
| `off` | 不处理索引 | 否 | 极端保守环境，客户自行维护索引 |
| `create` | 只创建 schema 声明但数据库缺失的索引 | 否 | 私有化默认推荐 |
| `dryRun` | 只扫描并记录差异 | 否 | 升级前检查 |

移除旧变量策略：

- 移除 `packages/service/env.ts` 和 `projects/marketplace/src/env.ts` 中的 `SYNC_INDEX`。
- 测试统一改成 `MONGO_INDEX_SYNC_MODE`；`.mdx` 文档和 `.yml` 部署文件先不手动修改，等代码改完后再统一处理。
- 未配置 `MONGO_INDEX_SYNC_MODE` 时默认 `create`。
- 旧配置 `SYNC_INDEX=false` 的用户如需继续完全跳过索引处理，升级时改为 `MONGO_INDEX_SYNC_MODE=off`。
- 旧配置 `SYNC_INDEX=true` 的用户无需迁移值；未配置新变量时默认等价于 `MONGO_INDEX_SYNC_MODE=create`，只补建缺失索引。

模式值通过共享的 `mongoIndexSyncModeList` 约束，主应用和 Marketplace 使用同一组枚举，避免两个入口分叉。这里故意不读取 `SYNC_INDEX`。这属于配置破坏性变更，但可以避免长期维护两个入口造成语义混乱。

### 2. 默认从 `syncIndexes()` 改为安全创建

`create` 模式下使用 Mongoose 的 `createIndexes()` 或基于 `diffIndexes()` 的 `toCreate` 结果只创建缺失索引，不执行 `cleanIndexes()`。

建议同时记录差异日志：

- `toCreate`：即将创建的 FastGPT schema 索引。
- `toDrop`：数据库存在但 schema 不声明的索引，只告警，不删除。
- 冲突：同名或同 key 但 options 不一致的索引，交由 `createIndexes()` 抛错并记录日志，提示需要迁移或人工处理。

不建议只简单替换成 `model.createIndexes()` 后结束，原因是：

1. `createIndexes()` 对已有索引 options 不做修正。TTL、unique、partialFilterExpression 变化时，旧索引仍会保留旧行为。
2. 它缺少差异报告，管理员无法知道哪些旧索引需要人工处理或迁移。
3. 它不处理旧索引 options 变化或历史旧索引清理，这些应由独立迁移工具处理。

因此可以内部用 `createIndexes()` 完成安全创建，但对外的抽象应是 `mongoIndexManager`，保留 inspect 和未来管理入口的扩展点。

### 3. 历史旧索引处理边界

本次不在服务启动索引同步里删除任何索引，包括 FastGPT 历史旧索引。原因：

1. 当前核心目标是保护客户自建索引，启动路径不应包含 drop index 行为。
2. 历史旧索引识别和删除需要更明确的运维确认，不应混入普通重启流程。
3. 如后续确实需要清理旧索引，应做独立 migration 脚本或 Root 管理工具，并提供 dry-run、确认参数和审计日志。

### 4. 提供可审计的管理入口

建议新增 Root 管理员 API 或脚本：

- `POST /api/admin/mongoIndexes/inspect`
  - 默认 dry-run。
  - 输出每个集合的 `toCreate`、`unknownIndexes`、`conflicts`、`fastgptObsoleteIndexes`。
- `POST /api/admin/mongoIndexes/apply`
  - 入参明确指定模式：`create`。
  - 不提供旧式全量同步能力。

本次先通过环境变量完成启动期 `off/create/dryRun`，Root 管理员 API 或脚本作为后续增强。

### 5. 未来索引命名规范

新建 FastGPT schema 索引尽量显式命名，例如 `fg_<collection>_<purpose>`，降低未来识别成本。

注意：不能一次性给所有旧索引改名，因为 MongoDB 不支持直接重命名索引，改名通常等价于新建再删除，容易触发冲突和重建成本。旧索引应通过迁移清单逐步治理。

## 推荐落地架构

### 1. 模块划分

建议在 `packages/service/common/mongo/` 下新增索引管理模块：

- `indexManager.ts`
  - `runMongoIndexSyncForModel()`
  - `inspectMongoModelIndexes()`

`getMongoModel()` / `getMongoLogModel()` 只负责把 model 注册给 manager，不直接调用 Mongoose 的 destructive API。这样后续可以统一做并发控制、日志聚合和管理 API 复用。

### 2. 启动流程

启动时允许三类行为：

- `off`：跳过。
- `dryRun`：只记录差异。
- `create`：创建缺失索引，并记录未知索引/冲突。

不在常规启动模式中暴露 Mongoose `syncIndexes()`。如未来确实需要旧式全量同步，应作为单独危险运维工具重新评审，而不是并入默认索引同步路径。

### 3. 并发与失败处理

当前 model 加载时即触发索引同步。后续实现至少要保证：

1. 同一进程内同一 model 只执行一次索引任务。
2. 多实例并发启动时，重复创建索引错误可识别并降噪；真正的冲突错误必须记录。
3. 索引任务失败不应让 model 注册失败，但要有明确日志，必要时在健康检查或管理 API 暴露状态。
4. Marketplace 已修正异步错误捕获，后续如果引入管理入口，应继续复用同一 manager。

### 4. 本次交付边界

- 新增 `MONGO_INDEX_SYNC_MODE`。
- 将默认启动行为从 `syncIndexes()` 改为安全 `create`。
- 支持 `off/create/dryRun`。
- 加日志说明 `toCreate/toDrop`，但 `toDrop` 不删除；索引冲突由 `createIndexes()` 错误日志暴露。
- 主应用与 Marketplace 行为一致。
- 补回归测试：客户自建索引在 `create/dryRun` 下不会被删除。
- 代码确认后再更新 `.mdx` 文档，并由生成流程统一产出 `.yml` 部署文件。

Root 管理员 inspect/apply API 或等价脚本作为后续增强，不阻塞本次修复。

## 已知历史旧索引记录

### `llm_request_records.requestId_1`

- 引入提交：`76d6234de V4.14.7 features (#6406)`，提交时间 `2026-02-12 16:37:50 +0800`。
- 引入方式：`packages/service/core/ai/record/schema.ts` 初次新增 LLM 请求追踪记录时，在 `requestId` path 上声明 `unique: true`。MongoDB 自动生成索引名 `requestId_1`。
- 变更提交：`f008ea971 feat: teamId in reacord llm`，提交时间 `2026-06-25 12:27:57 +0800`；后续合并提交 `60c62b7af Fix test (#7179)` 包含同样变更。
- 变更原因：LLM 请求追踪记录新增 `teamId` 隔离，查询从 `{ requestId }` 调整为 `{ requestId, teamId }`，唯一索引从单字段 `requestId` 调整为复合 `{ teamId: 1, requestId: 1 }`。
- 当前判断：旧 `requestId_1` 对当前 schema 已无必要，且可能继续施加跨团队全局唯一约束。但 `requestId` 由 `getNanoid(12)` 生成，实际碰撞概率很低；请求追踪记录保存失败只记录错误，不阻塞主流程。
- 处理边界：本次默认 `create` 不删除它。后续如需清理，应通过独立 migration 脚本或 Root 管理工具处理。

## 边界与风险

1. `createIndexes()` 不会更新已存在索引的 options。TTL 秒数、unique、partialFilterExpression 等发生变化时，需要独立 migration 或人工处理。
2. 旧唯一索引如果不删除，可能继续影响业务。例如 `llm_request_records` 从 `{ requestId }` 改到 `{ teamId, requestId }` 后，旧 `requestId_1` 若残留，会继续限制跨团队相同 requestId。
3. 旧式全量同步仍可能有排障价值，但不作为常规启动模式暴露，避免重新引入删除客户索引的风险。
4. 多实例同时启动会并发创建索引。MongoDB 创建已存在索引通常是幂等的，但冲突错误需要聚合成清晰日志，避免噪声刷屏。
5. Marketplace 已统一接入 `mongoIndexManager`，异步错误会被捕获并记录。

## 测试策略

至少需要覆盖：

1. `MONGO_INDEX_SYNC_MODE` 环境变量解析：
   - 未设置新变量时为 `create`。
   - 合法模式按原值返回。
   - 非法模式在 env 解析阶段失败。
2. `create` 模式：
   - 会创建 schema 中缺失索引。
   - 不删除手动创建的客户索引。
   - 遇到 schema 外索引只记录为 `toDrop/unknownIndexes`。
3. `dryRun` 模式：
   - 不创建索引。
   - 不删除索引。
   - 能返回差异结果。
4. Marketplace：
   - 解析环境变量与主应用一致。
   - 异步错误可以被捕获并记录。

仓库已有 `mongodb-memory-server` 测试环境，可以写真实 MongoDB 索引回归测试，而不是只 mock Mongoose 方法。

## 后续增强

1. 是否继续补 Root 管理员 inspect/apply API，作为比环境变量重启更友好的运维入口。
2. 是否需要独立 MongoDB 索引迁移脚本，用于清理确认无用的 FastGPT 历史旧索引。
3. 对客户自己改动 FastGPT 既有索引 options 的情况，当前只告警；如未来需要自动修正，应以明确迁移项实现。

## TODO

- [x] 补充需求确认，确定环境变量命名和默认行为。
- [x] 移除 `SYNC_INDEX`，新增 `MONGO_INDEX_SYNC_MODE`。
- [x] 设计并实现 `mongoIndexManager`：统一主应用和 Marketplace 的索引处理。
- [x] 实现 `off/create/dryRun` 基础模式。
- [x] 接入主应用 `getMongoModel()` / `getMongoLogModel()`。
- [x] 接入 Marketplace `getMongoModel()`，修正异步错误捕获。
- [ ] 后续增强：新增 Root 管理员 inspect/apply API 或等价脚本。
- [ ] 后续补充 `.mdx` 文档，并通过生成流程产出 `.yml` 部署文件。
- [x] 增加测试，覆盖 env 解析、`create/dryRun` 行为、客户自建索引不会被删除。
