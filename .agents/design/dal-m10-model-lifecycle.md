# M10：DAL Model 生命周期（慢查询日志 + MongoIndexManager 索引管理）

关联任务：Kaneo M#10「DAL 独立连接生命周期：索引同步、慢查询日志、MongoIndexManager 管理」。
前置设计：[dal-basic-architecture.md](./dal-basic-architecture.md)、
[dal-m9-user-call-migration.md](./dal-m9-user-call-migration.md)。

## 目标

在删除旧 User Model 前，补齐 DAL Model 的两个生命周期能力：
接入慢查询日志（对齐业务侧 `addCommonMiddleware`）与纳入 `MongoIndexManager`
统一索引管理。部署侧的第二连接池观测与连接数上限验证（M11）不在本任务内。

## 慢查询日志

- 新增 `packages/dal/mongodb/middleware.ts` 的 `addDalCommonMiddleware(schema)`：
  与业务侧 `addCommonMiddleware` 相同的慢查询计时（>2s / >500ms 两档），
  **不做 post-find 的 `_id` → string 转换**——DAL mapper 依赖 ObjectId 做
  `toEntityId`/`getTimestamp`，转换会破坏映射层。
- 新增 `packages/dal/mongodb/logger.ts`：`setDalLogger` / `getDalLogger`。
  service 侧 composition root（`common/dal/mongo/index.ts`）在模块加载时注入业务
  logger（pino），避免 DAL 包反向依赖 service 日志实现；未注入时退回 console。
- 新增 `packages/dal/mongodb/model.ts` 的 `getDalModel`：DAL Model 统一注册
  入口，注册前挂慢查询中间件；User Model 重构为同一入口。

## 索引管理

- 新增 `packages/service/common/dal/mongo/lifecycle.ts` 的
  `syncDalModelIndexes(client)`：对 DAL 全部 Model（User/Team/TeamMember/
  MemberGroup/Org/TmpData）调用 `MongoIndexManager.syncModelIndexes`，与旧 Model 的
  `syncMongoIndex` 同一套语义（补建当前索引 + 清理登记的废弃索引）；测试与构建阶段跳过。
- `connection.connect()` 成功后异步触发 `syncDalModelIndexes`（失败只记录日志，
  与旧 Model 的异步补偿一致）。
- DAL Model 与旧 Model 指向同一集合，索引创建幂等；`defineIndex` 两侧共享
  `Symbol.for('fastgpt.mongo.deprecatedIndexes')`，清理语义一致。

## 验证边界

- 本任务验证到「代码接入 + 单测」：middleware 计时钩子、模型注册复用、索引声明与生产
  一致（models 测试断言 indexes()）。
- 「独立 DAL 连接与主连接索引同步」的运行时验证依赖 M11 的部署观测（同一副本集下
  diffIndexes 幂等），不在本任务。
