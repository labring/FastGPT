# MongoDB 索引安全同步设计

## 文档状态

- 状态：已演进至 **Step 0 + Phase 0.5.4 收敛架构**（详见 [multi-db-repository-architecture.md](./dal/multi-db-repository-architecture.md#5-九大异构数据库深水区与标准解法)）
- 适用范围：主 Service、日志库、Marketplace 和 `pro/admin` 中由 FastGPT 管理的 MongoDB Schema
- 当前基线结论：
  1. Step 0 4 项现网隐患已全部修复（连接级 `autoIndex: false`、复合 `text` 索引 `_fts/_ftsx` 精确匹配、`MONGO_DEPRECATE_INDEX` 门控与独立 `withMongoDdlConnection` 无 60s 超时 DDL 连接）；
  2. `@fastgpt/dal/db/mongo/indexSync.ts` 已落地**启动期只增补建**（`syncMongoCollectionIndexes`：全候选 `name + key + options` 双向等价比对防受限索引掩盖、Error `285` 退避重试、支持动态条件索引与可选 `collMod` TTL 原地更新）、**只读巡检**（`inspectMongoIndexes`）与**显式一次性安全清理**（`dropManagedMongoIndexIfExists`）；
  3. 历史旧版 Schema 中的 **18 条** `deprecated: true` 废弃索引已全部清零并收口至 `packages/service/common/mongo/legacyDeprecatedIndexCleanup.ts` 显式一次性清理目录（`LEGACY_DEPRECATED_MONGO_INDEXES`）。后续**严禁**在任何业务 `schema.ts` 中新增 `deprecated: true`，所有新增 Mongo 索引统一使用 `fg_<table_short>_<purpose>[_vN]` 命名（<= 63B），客户自建与存量未带前缀索引 100% 保留。
  4. 新增 DAL Mongo 集合（`coreMongoCollections`）在 `connectMongo` 成功后通过 `withMongoDdlConnection`（`socketTimeoutMS: 0`）后台只增补建；存量尚未迁入 DAL 的旧 `getMongoModel` / `getMongoLogModel` 维持既有 `MongoIndexManager` 路径，随后续业务域迁入 DAL 自然收敛。

## 问题与根因

私有化部署客户可能通过 `mongosh`、运维脚本或数据库管理平台添加自定义索引。原实现会在 Mongoose model 加载时调用 `model.syncIndexes()`，其语义是：

1. 比较 Schema 与数据库已有索引。
2. 删除 Schema 中不存在的索引。
3. 创建 Schema 中缺失的索引。

因此，客户自建索引在服务重启时被删除是 `syncIndexes()` 的确定性行为，并非异常分支。原先关闭索引同步虽然可以阻止删除，但也会阻止 FastGPT 新版本补建必需索引，无法作为默认解决方案。

该问题同时影响主业务库、日志库和 Marketplace；多实例启动还会放大重复执行和错误日志问题。

## 当前收敛架构（Phase 0.5.4 起生效，权威口径）

> 本节覆盖下方历史 Phase 背景描述中的旧版「Schema 内登记 `deprecated: true`」与「启动阶段忽略 `options` 自动清理」策略，作为当前代码与运维的唯一权威口径。

### 1. 声明与零墓碑原则
- 业务 Schema（`packages/dal/db/repos/*/mongo/schema.ts` 与存量未迁移 Schema）只声明当前有效索引，**严禁**再使用 `deprecated: true` 或字段内联 `index: true` / `unique: true`（由 `schema-drift-guard.test.ts` 在 CI 中强制回归拦截）。
- 新增 Mongo 索引统一命名为 `fg_<table_short>_<purpose>[_vN]`（<= 63 ASCII 字节）；存量未带 `fg_` 前缀索引原地冻结保留，不做破坏性重命名。

### 2. 启动期只增同步与多候选等价比对
- 连接层（`connectMongo`、`getSharedMongoConnection`）默认关闭 Mongoose `autoIndex`；测试环境由共享测试装配层对隔离测试库显式建索引并等待就绪。
- `connectMongo` 成功后对 `coreMongoCollections`（如 `app_registrations`）通过 `withMongoDdlConnection`（`socketTimeoutMS: 0`）在后台只增补建。
- `syncMongoCollectionIndexes` 与 `inspectMongoIndexes` 对同 key 的全部现网候选索引逐一比对完整定义（`unique`、`sparse`、`expireAfterSeconds`、`partialFilterExpression`、归一化 `collation`、`weights`、`default_language`、`language_override` 与 `_fts`/`_ftsx` 文本骨架），防止受限的 partial/unique 索引掩盖全量索引缺失。

### 3. 显式一次性历史索引退役与运维操作条件
- 历史上原登记于旧版 Schema 的 **18 条** 废弃索引（如 `chats.appId_1_updateTime_-1`、`chats.chatGenerateStatus_1_updateTime_1`、`agent_sandbox_instances_v2.*` 等）统一收口至 [legacyDeprecatedIndexCleanup.ts](../../../packages/service/common/mongo/legacyDeprecatedIndexCleanup.ts) 的 `LEGACY_DEPRECATED_MONGO_INDEXES`。
- **绝对不在应用启动索引同步热路径自动删除索引**；所有版本的废弃 Mongo 索引删除统一收口至系统升级迁移框架（`projects/app/src/migration/tasks/<version>/<YYYYMMDD>_cleanup_mongo_indexes/`，复用 `createMongoIndexCleanupMigration`；v4.18.0 为 `20261123_cleanup_mongo_indexes`，`independent: true` 后台集群互斥只执行一次）：
  1. 清理前需确保替代索引已在上一版本或当前启动同步就绪；
  2. 清理器按 **`name + key + 完整显式历史 options`** 严格匹配；若客户库中同名索引带有意外的 `unique`、`sparse`、`partialFilterExpression`、`expireAfterSeconds` 或 `collation`，一律返回 `skipped_mismatch` 并保守保留；
  3. 手动运维排查时仍可直接干跑预览 `runLegacyDeprecatedMongoIndexCleanup({ apply: false })` 或执行 `runLegacyDeprecatedMongoIndexCleanup({ apply: true })`。
- **环境变量 `MONGO_DEPRECATE_INDEX` 边界**：
  - 默认 `true`，同时控制存量 `MongoIndexManager.cleanupModelDeprecatedIndexes()` 与按版本执行的 `*_cleanup_mongo_indexes` 系统升级迁移任务；设为 `false` / `0` 时只检查不删除，不影响缺失索引的自动补建。
  - 运维手工直接调用 `runLegacyDeprecatedMongoIndexCleanup({ apply: true })` 时不受该变量拦截。

---

## 历史演进背景（旧版 MongoIndexManager 基线，仅作历史参考）

> 注意：以下小节记录早期 Step 0 引入 `MongoIndexManager` 时的过渡方案；凡涉及「在 Schema 登记 `deprecated: true`」「忽略 `options`」「启动阶段自动删除」的表述均已被上方 **Phase 0.5.4 当前收敛架构** 取代。

### 最终决策（历史过渡期）

1. 禁止在启动索引管理中调用 `syncIndexes()` 或 `cleanIndexes()`。
2. 移除旧索引同步开关；启动时固定检查差异并补建当前 Schema 缺失的索引。
3. `MONGO_DEPRECATE_INDEX` 仅控制旧版 `MongoIndexManager.cleanupModelDeprecatedIndexes()` 是否在本地 `deprecated: true` 测试/过渡场景执行删除，默认值为 `true`；设置为 `false` 不影响缺失索引的创建（当前业务 Schema 已零墓碑）。
4. 不提供可切换回全量删除的启动模式。
5. （历史已演进）早先通过 `defineIndex(..., { deprecated: true })` 在 Schema 上登记元数据；Phase 0.5.4 起已全面禁用，历史 18 条索引已迁移至 `legacyDeprecatedIndexCleanup.ts`。
6. Schema 外且未被显式声明为废弃的索引只告警、不删除。
7. 删除废弃索引前必须先成功创建并就绪替代索引；创建失败时不进入删除阶段。
8. 存量未迁移 Service/Marketplace 模型继续沿用 `MongoIndexManager`，新迁入 `@fastgpt/dal` 的模型统一由 `@fastgpt/dal/db/mongo/indexSync` 接管。

## 索引声明

`packages/service/common/mongo/schemaIndexes.ts` 提供统一入口：

```ts
defineIndex(ChatSchema, {
  key: { appId: 1, chatId: 1 },
  options: { unique: true }
});

defineIndex(ChatSchema, {
  key: { legacyField: 1 },
  options: { name: 'legacyField_1' },
  deprecated: true
});
```

声明规则：

- 未设置 `deprecated` 时，`defineIndex()` 代理 `Schema.index()`，该索引属于当前 Schema。
- 显式设置 `deprecated: true` 时，只在 Schema 实例上登记清理元数据，不再把索引加入 Mongoose Schema。
- 废弃索引元数据包含索引名、key，以及可选的 options 快照（仅供阅读/排查，不参与删除匹配）；不包含 collection name，collection 由 model 推导。
- 未显式提供索引名时，按 MongoDB 默认规则由 key 推导。
- 同一 Schema 内重复登记同名废弃索引属于配置错误，应立即抛错。
- FastGPT 管理的索引不再使用字段级 `index: true` 或 `unique: true` 隐式声明，避免绕开统一入口。

废弃索引元数据使用私有 symbol 挂在 Schema 实例上，使当前索引与历史清理声明在同一业务文件中完成 review，并避免中心清单与 Schema 演进脱节。

## 启动同步流程（历史旧版 Schema 机制，当前业务 Schema 已零墓碑）

每个尚未迁入 `@fastgpt/dal` 的存量 model 在模块初始化时执行以下流程（新建 DAL 集合改为连接成功后由 `withMongoDdlConnection` 触发 `syncMongoCollectionIndexes`）：

1. `diffIndexes({ indexOptionsToCreate: true })` 生成 `toCreate` 和 `toDrop`。
2. `toDrop` 仅表示数据库中存在但当前 Schema 未声明的索引，记录 `warn` 后保留。
3. `createIndexes({ background: true })` 创建当前 Schema 索引。
4. 当 `MONGO_DEPRECATE_INDEX=true` 时，从 `model.schema` 读取废弃索引声明。
5. 在 model 对应 collection 中按 name 查找废弃索引。
6. 仅删除 name 与 key 匹配的索引；options 不参与匹配。

key 匹配规则：

- 普通索引：`listIndexes` 的 key 与声明 key 按字段顺序精确相等。
- text 索引：MongoDB 会把 key 改写为 `{ _fts: "text", _ftsx: 1 }`，因此改为比较声明中的 text 字段集合与 `weights` 字段集合。
- options（`unique` / `sparse` / TTL / partial / collation）故意不参与匹配，减少重复声明成本；声明方需自行确认同名同 key 的索引确实可删。

清理结果分为：

- `drop`：定义匹配，已删除或在 dry-run 中可删除。
- `skip_missing`：索引不存在或已被其他实例删除。
- `skip_mismatch`：同名索引的 key 不匹配，保留并告警。
- `error`：查询或删除失败，保留错误信息。

同一进程内同一 model 的并发调用复用正在执行的任务；任务完成后移除缓存，允许热加载或重连再次检查。多实例重复清理时，`IndexNotFound` 视为幂等跳过。

## 模块职责

- `packages/service/common/mongo/indexManager.ts`
  - `inspectModelIndexes()`：只计算差异，不创建或删除索引。
  - `syncModelIndexes()`：执行安全同步并复用同一 model 的进行中任务。
  - `cleanupModelDeprecatedIndexes()`：按 Schema 本地声明检查或清理废弃索引。
  - `summarizeCleanupReport()` / `formatCleanupReport()`：提供结构化结果与可读报告。
- `packages/service/common/mongo/schemaIndexes.ts`
  - `defineIndex()`：声明当前索引或登记废弃索引。
  - `getDeprecatedIndexes()`：读取当前 Schema 自身的废弃索引元数据。
- `packages/service/common/mongo/index.ts`
  - 主 Service 和日志库的 model 注册入口，只负责按环境条件触发 manager。
- `projects/marketplace/src/service/mongo/index.ts`
  - Marketplace 的 model 注册入口，复用同一 manager 并完整捕获异步错误。

原中心废弃索引清单已删除。当前 chat、sandbox instance 和 Agent Skill 均未登记废弃索引，因此启动同步不会自动删除任何历史索引；manager 仅保留显式清理能力供后续经过单独确认的迁移使用。

## 日志与失败处理

- 无差异且无清理动作时不输出同步摘要。
- `info`：实际创建或删除索引时输出 collection 级摘要。
- `warn`：发现 Schema 外索引，或废弃声明与数据库同名索引不匹配。
- `error`：当前索引创建失败，或废弃索引检查、删除失败。

索引任务失败不阻止 model 注册，但必须记录 model、collection 和错误信息。`createIndexes()` 的同名、同 key 或 options 冲突由 MongoDB/Mongoose 抛错并进入错误日志，不自动修正。

## 安全边界

1. 未登记的 Schema 外索引不会被删除，包括客户自建索引和无法确认所有权的历史索引。
2. `createIndexes()` 不会修改已存在索引的 options。TTL、唯一约束、partial filter 等变化必须通过明确迁移处理。
3. 错误的 Schema 本地废弃声明会在启动时触发清理，因此 name + key 匹配和代码 review 是必须保留的防线。
4. 启动流程不暴露 Mongoose 全量同步能力；需要诊断时复用 manager 的 inspect/dry-run 能力。
5. `MONGO_DEPRECATE_INDEX=false` 只关闭废弃索引清理，当前 Schema 缺失的索引仍会创建。
6. 客户自建索引应显式设置自定义名称，不使用 MongoDB 按 key 生成的默认名称，避免与 FastGPT 系统内置索引重名。

## 已知暂不处理的历史索引

### `llm_request_records.requestId_1`

- `76d6234de V4.14.7 features (#6406)` 首次在 `requestId` path 上声明 `unique: true`，MongoDB 创建 `requestId_1`。
- `f008ea971 feat: teamId in reacord llm` 将约束调整为 `{ teamId: 1, requestId: 1 }` 复合唯一索引。
- 旧索引对当前 Schema 已无必要，并可能继续施加跨团队全局唯一约束。
- 本次不新增其废弃声明。后续如需清理，必须在 `packages/service/core/ai/record/schema.ts` 单独声明并补充回归测试。

## 验收标准

1. 启动时只增补建当前 Schema 缺失索引，并 100% 保留所有未登记的 Schema 外与客户自定义索引。
2. 业务 Schema 零 `deprecated: true` 墓碑；启动热路径不自动删除历史索引。
3. 显式历史清理（`runLegacyDeprecatedMongoIndexCleanup`）支持 `apply: false` 预览与 `apply: true` 执行，仅删除 `name + key + 完整历史 options`（含 `unique`/`sparse`/`expireAfterSeconds`/`partialFilterExpression`/`collation`）完全匹配的项；同名不同配置返回 `skipped_mismatch` 保守保留。
4. 当前/替代索引创建就绪前不执行任何废弃清理。
5. 多实例并发重复补建或清理保持幂等，已不存在的索引按缺失跳过。
6. `MONGO_DEPRECATE_INDEX` 仅门控存量 `MongoIndexManager`，不影响缺失索引补建，也不触发显式迁移清单删除。
7. `coreMongoCollections` 通过 `withMongoDdlConnection`（`socketTimeoutMS: 0`）补建，未迁入 DAL 的存量模型保持 `MongoIndexManager` 直到分批迁出。

## 后续事项

以下事项不影响当前方案交付：

1. 增加 Root 管理员 inspect/apply API 或等价脚本，提供启动日志之外的诊断入口；apply 仍只允许执行 manager 定义的安全动作。
2. 单独评估并迁移 `llm_request_records.requestId_1`。
3. 为新索引逐步采用 `fg_<collection>_<purpose>` 显式命名规范；旧索引不做批量改名。
