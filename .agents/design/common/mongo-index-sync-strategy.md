# MongoDB 索引安全同步设计

## 文档状态

- 状态：已落地
- 适用范围：主 Service、日志库、Marketplace 和 `pro/admin` 中由 FastGPT 管理的 MongoDB Schema
- 最终结论：启动时只补建当前 Schema 索引；仅当业务 Schema 明确登记废弃索引时才执行精确清理，任何未知索引一律保留。当前没有业务 Schema 登记废弃索引

## 问题与根因

私有化部署客户可能通过 `mongosh`、运维脚本或数据库管理平台添加自定义索引。原实现会在 Mongoose model 加载时调用 `model.syncIndexes()`，其语义是：

1. 比较 Schema 与数据库已有索引。
2. 删除 Schema 中不存在的索引。
3. 创建 Schema 中缺失的索引。

因此，客户自建索引在服务重启时被删除是 `syncIndexes()` 的确定性行为，并非异常分支。原有 `SYNC_INDEX=false` 虽然可以阻止删除，但也会阻止 FastGPT 新版本补建必需索引，无法作为默认解决方案。

该问题同时影响主业务库、日志库和 Marketplace；多实例启动还会放大重复执行和错误日志问题。

## 最终决策

1. 禁止在启动索引管理中调用 `syncIndexes()` 或 `cleanIndexes()`。
2. `SYNC_INDEX` 是唯一启动开关，默认值为 `true`：
   - `true`：执行固定的安全同步链路。
   - `false`：跳过差异检查、索引创建和废弃索引清理，由部署方自行维护索引。
3. 不提供 `MONGO_INDEX_SYNC_MODE`，也不提供可切换回全量删除的启动模式。
4. 当前索引和废弃索引统一通过 `defineIndex()` 声明；废弃索引必须声明在所属 Schema 文件中。
5. Schema 外且未被显式声明为废弃的索引只告警、不删除。
6. 删除废弃索引前必须先成功创建当前 Schema 索引；创建失败时不进入删除阶段。
7. 主 Service、日志库和 Marketplace 统一复用 `MongoIndexManager`，保持同步语义与错误处理一致。

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
- 废弃索引元数据包含索引名、key 和参与精确匹配的关键 options；不包含 collection name，collection 由 model 推导。
- 未显式提供索引名时，按 MongoDB 默认规则由 key 推导。
- 同一 Schema 内重复登记同名废弃索引属于配置错误，应立即抛错。
- FastGPT 管理的索引不再使用字段级 `index: true` 或 `unique: true` 隐式声明，避免绕开统一入口。

废弃索引元数据使用私有 symbol 挂在 Schema 实例上，使当前索引与历史清理声明在同一业务文件中完成 review，并避免中心清单与 Schema 演进脱节。

## 启动同步流程

当环境允许且 `SYNC_INDEX=true` 时，每个 model 执行以下流程：

1. `diffIndexes({ indexOptionsToCreate: true })` 生成 `toCreate` 和 `toDrop`。
2. `toDrop` 仅表示数据库中存在但当前 Schema 未声明的索引，记录 `warn` 后保留。
3. `createIndexes({ background: true })` 创建当前 Schema 索引。
4. 从 `model.schema` 读取废弃索引声明。
5. 在 model 对应 collection 中逐项查询并精确匹配。
6. 仅删除 name、key 和关键 options 全部匹配的索引。

关键 options 包括：

- `unique`
- `sparse`
- `expireAfterSeconds`
- `partialFilterExpression`
- `collation`

清理结果分为：

- `drop`：定义匹配，已删除或在 dry-run 中可删除。
- `skip_missing`：索引不存在或已被其他实例删除。
- `skip_mismatch`：同名索引的 key 或 options 不匹配，保留并告警。
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
3. 错误的 Schema 本地废弃声明会在启动时触发清理，因此精确匹配和代码 review 是必须保留的防线。
4. 启动流程不暴露 Mongoose 全量同步能力；需要诊断时复用 manager 的 inspect/dry-run 能力。
5. `SYNC_INDEX=false` 会关闭整条链路，部署方必须自行承担缺失索引和历史索引的维护责任。

## 已知暂不处理的历史索引

### `llm_request_records.requestId_1`

- `76d6234de V4.14.7 features (#6406)` 首次在 `requestId` path 上声明 `unique: true`，MongoDB 创建 `requestId_1`。
- `f008ea971 feat: teamId in reacord llm` 将约束调整为 `{ teamId: 1, requestId: 1 }` 复合唯一索引。
- 旧索引对当前 Schema 已无必要，并可能继续施加跨团队全局唯一约束。
- 本次不新增其废弃声明。后续如需清理，必须在 `packages/service/core/ai/record/schema.ts` 单独声明并补充回归测试。

## 验收标准

1. 开启同步时创建当前 Schema 缺失索引，并保留所有未登记的 Schema 外索引。
2. Schema 未登记废弃索引时不执行删除。
3. 只有 name、key 和关键 options 精确匹配的废弃索引会被删除。
4. 当前索引创建失败时不删除废弃索引。
5. 同名但定义不同的索引保留并告警。
6. 已不存在的废弃索引和多实例并发重复清理保持幂等。
7. 当前所有业务 Schema 均未登记废弃索引，启动同步不会自动删除历史索引。
8. 主 Service、日志库和 Marketplace 在 `SYNC_INDEX=true` 时调用同一 manager，关闭时均跳过同步。

## 后续事项

以下事项不影响当前方案交付：

1. 增加 Root 管理员 inspect/apply API 或等价脚本，提供启动日志之外的诊断入口；apply 仍只允许执行 manager 定义的安全动作。
2. 单独评估并迁移 `llm_request_records.requestId_1`。
3. 为新索引逐步采用 `fg_<collection>_<purpose>` 显式命名规范；旧索引不做批量改名。
