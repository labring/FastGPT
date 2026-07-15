# MongoDB 启动索引同步删除客户自建索引问题分析

## 问题描述

私有化部署客户可能会直接在 MongoDB 中添加自定义索引，用于客户自己的查询、报表、审计或集成任务。FastGPT 服务重启时会加载 Mongoose model，并执行索引同步。当前同步使用 Mongoose `model.syncIndexes()`，会删除 schema 中未声明的索引，导致客户自建索引被清理。

`SYNC_INDEX=false` 可以阻止启动同步，但它同时阻止 FastGPT 新版本缺失索引的创建，升级时可能留下性能问题或唯一约束缺失。因此它只能算临时开关，不是长期索引治理方案。当前决策是不再保留该布尔变量，改为 `MONGO_INDEX_SYNC_MODE` 表达更明确的索引处理模式。

## 证据

当前主应用代码：

- `packages/service/common/mongo/index.ts`
  - `getMongoModel()` / `getMongoLogModel()` 创建 model 后调用 `syncMongoIndex(model)`。
  - `syncMongoIndex()` 在 `SYNC_INDEX=true` 时执行 `await model.syncIndexes({ background: true })`。

当前 Marketplace 代码：

- `projects/marketplace/src/service/mongo/index.ts`
  - model 创建后也调用 `model.syncIndexes({ background: true })`。
  - 该调用未 `await`，异步错误无法被当前 `try/catch` 捕获。

Mongoose `syncIndexes()` 的语义是：

1. 对比 schema 索引与数据库已有索引。
2. 删除 schema 中不存在的索引。
3. 创建 schema 中缺失的索引。

所以删除客户自建索引是当前 API 语义导致的确定性风险。

## 影响范围

- 私有化部署环境：风险最高，因为客户可能对数据库有直接运维权。
- 多实例部署：多个服务重启时会重复触发索引同步，日志与冲突更难排查。
- 版本升级：如果关闭 `SYNC_INDEX`，新索引可能不会创建；如果打开 `SYNC_INDEX`，客户自建索引可能被删。
- 日志库：`getMongoLogModel()` 也会同步索引，日志集合里的客户索引同样受影响。
- Marketplace：存在同类 destructive sync，并且异步错误处理不完整。

## 方案取舍

### 不推荐：继续依赖 `SYNC_INDEX`

优点是改动小。缺点是它只有开/关两种状态，无法表达“只创建 FastGPT 缺失索引，但保留客户索引”。

### 不推荐：直接全量改成 `createIndexes()`

能保留客户索引，但无法发现和治理 FastGPT 历史旧索引。比如唯一索引或 TTL 索引的 options 发生变化时，旧索引可能继续影响业务。

当前最终方案仍以 `createIndexes()` 作为安全创建动作，但通过统一的 index manager 包装差异检查、日志和启动入口，历史旧索引清理不放在服务启动路径中。

### 推荐：引入索引同步模式

将索引同步拆成不同意图：

- `off`：完全跳过。
- `create`：只创建缺失索引，不删除未知索引。
- `dryRun`：只检查差异。
常规启动不再暴露旧 `syncIndexes()` 全量同步行为，避免重新引入删除客户索引的风险。

私有化默认推荐 `create`。

## 已确认方向

1. 默认行为从破坏性全量同步改为 safe create。
2. 直接移除 `SYNC_INDEX`，不做长期兼容映射。
3. 启动索引处理不提供删除索引能力，旧索引清理后续通过独立迁移脚本或 Root 管理工具处理。
4. `llm_request_records.requestId_1` 已确认不再需要，但不在本次启动索引同步中清理。

## 已知旧索引样例

`llm_request_records.requestId_1` 来源：

- `76d6234de V4.14.7 features (#6406)` 在 `2026-02-12 16:37:50 +0800` 引入 LLM 请求追踪记录，`requestId` path 声明 `unique: true`，MongoDB 因此创建 `requestId_1`。
- `f008ea971 feat: teamId in reacord llm` 在 `2026-06-25 12:27:57 +0800` 将 schema 改为 `teamId + requestId` 复合唯一索引。

当前判断：旧 `requestId_1` 对现在的团队隔离查询已无必要，且可能继续施加跨团队全局唯一约束。但 `requestId` 由 `getNanoid(12)` 生成，实际碰撞概率很低；请求追踪记录保存失败只记录错误，不阻塞主流程。因此本次不在启动索引同步中清理它。

## 已确认边界

1. 常规启动默认只执行 `create`，不会删除未知索引。
2. `dryRun` 只检查差异，不创建、不删除。
3. 不保留旧式全量同步入口；Root 管理员 inspect/apply API 或等价脚本作为后续增强，不阻塞本次修复。
4. 历史旧索引清理不进入启动路径，后续如需要再做独立迁移工具。
