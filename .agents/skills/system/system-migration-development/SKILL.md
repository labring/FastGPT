---
name: system-migration-development
description: 为 FastGPT 新增、修改或审查自动系统升级脚本及其注册信息。涉及系统迁移、升级任务、启动迁移、migration registry、checkpoint、全量重跑、阻塞升级、进度或失败数据时使用；普通业务更新和未接入自动升级框架的一次性手工清洗不使用。
---

# FastGPT 系统升级脚本开发规范

## 目标与边界

系统升级任务属于 App 部署生命周期能力。框架负责顺序、状态、lease、并发互斥、重试入口和最终状态；脚本只负责可重复执行的业务迁移、进度、checkpoint，以及与阻塞类型匹配的错误报告方式。

开始前先查看当前实现，不能凭本 Skill 猜测已经变化的 Context 或目录结构：

- `projects/app/src/migration/registry.ts`
- `projects/app/src/migration/runner.ts`
- `packages/global/migration/constants.ts`
- `packages/global/migration/schema.ts`
- `projects/app/src/migration/tasks/README.md`
- 注册表中最近一个任务及其测试

如果这些路径正在迁移，以仓库中 `systemMigrations` 和 `SystemMigrationContext` 的实际定义为准。迁移执行框架和任务实现收敛到 `projects/app/src/migration`；需要被 App 前后端共同使用的状态枚举、Zod Schema 和 API 类型放在 `packages/global/migration`。

## 编写前必须确认

先明确以下契约；存在会改变数据安全或启动行为的缺失信息时，向用户确认后再编码：

1. 永久稳定的任务 ID，格式为 `YYYYMMDD_short_semantic_name`，以及首次发布版本。
2. 源数据、目标数据、权威数据源和迁移完成条件。
3. 该任务为什么必须排在当前注册表末尾，以及它依赖哪些前置任务。
4. 是否阻塞启动，以及失败后应停止还是继续后续任务；只有相互独立的非阻塞任务才能使用继续策略。
5. 恢复策略是“分批断点续跑”还是“幂等全量重跑”。该策略发布后不能切换。
6. 重复执行的幂等依据：唯一键、确定性覆盖、`$setOnInsert`、compare-and-set 或事务性全量重建。
7. 数据规模、预期耗时、批次大小和内存上界。
8. 坏数据是立即终止，还是跳过、汇总后由管理员修复再重试。
9. 滚动升级期间，旧版本节点是否仍能安全读写迁移中的结构。
10. 成功校验、失败回滚方式，以及需要展示给管理员的进度和错误定位数据。

不要用“目标表存在”“目标表非空”或当前数据形态替代任务状态。是否需要执行只能由静态注册表和迁移状态决定。

## 基本要求

- 注册表只允许在数组尾部追加。已发布任务的 ID、顺序、`blockStartup`、`onFailure` 和函数语义不得修改、删除或复用；修复已发布迁移时追加新任务。
- 完整任务及其可能重放的最小单元必须幂等。Lease 只保证同一时刻的执行权，不提供 exactly-once。
- 默认追加或回填，不删除旧字段、旧集合、回滚依据或用户数据。破坏性清理应放到后续兼容窗口结束后的独立任务。
- 自动迁移必须兼容滚动升级；要求全站停机或会立即破坏旧版本的变更不能直接进入该注册表。
- 禁止不可重放的外部副作用，例如无幂等键的消息、扣费或第三方写入。
- 所有业务写入必须有确定性，不能根据不稳定排序、offset 分页或随机值决定结果。
- 修改目标前验证源数据；返回前校验完成条件。不能仅因函数没有抛错就假设迁移完成。
- 日志、进度、最终结果、checkpoint 和错误数据不得包含凭证、完整业务正文、超大对象或完整错误栈。
- 迁移专属实现不得放入业务 DDD 模块。业务模块可以被迁移单向依赖，但不能反向依赖迁移目录。

## 状态与 Context

### 状态所有权

| 状态 | 谁负责写入 | 触发条件 |
| --- | --- | --- |
| `pending` | 框架 | 首次初始化，或管理员将非阻塞失败任务恢复为待执行 |
| `running` | Runner | 原子获得 lease，并生成新的 `runId` |
| `failed` | Runner / `context.fail` | 脚本明确报告失败，或普通异常被 Runner 捕获 |
| `succeeded` | Runner | 脚本正常返回且当前 `runId` 仍持有有效 lease |

脚本禁止直接操作迁移状态表和错误数据表，也不得主动设置 `pending`、`running`、`failed` 或 `succeeded`。所有运行状态写入必须经过 Context，让框架统一执行 runId fencing 和输入校验。

### 脚本可使用的状态能力

- `context.reportProgress(...)`：按注册表声明的阶段 `key` 更新该阶段快照。进入阶段时上报 `running`，完成后上报 `succeeded`；分批任务按合理频率更新 `current/total`，不要每条数据写一次。脚本不得主动上报 `failed`。
- `context.getCheckpoint(schema)`：读取并用任务自有 Zod Schema 校验断点。仅分批任务使用。
- `context.getFailedRecords()`：仅供非阻塞任务读取上次失败留下的坏数据。若任务曾跳过坏数据并把 checkpoint 推进到其后，重试时必须先处理这些记录；阻塞任务调用会被 Context 拒绝。
- `context.reportFailedRecords(records)`：仅供非阻塞任务按批替换“当前完整未解决错误快照”。业务批次提交后应先上报错误快照，再推进 checkpoint；替换语义保证批次重放不会重复追加同一错误。阻塞任务调用会被 Context 拒绝。
- `context.saveCheckpoint(value)`：只在一个幂等批次的业务事务完整提交、错误快照成功持久化并校验后保存。禁止先保存 checkpoint 再写业务数据或上报该批错误。
- `context.assertActive()`：确认当前 `runId` 仍持有 lease。每个业务写入批次前必须调用；全量任务至少在关键事务前及事务后的后续阶段前调用。
- `context.fail(...)`：保存可预期的结构化错误及最终错误快照，并终止本次执行。主要供需要在管理页面排障和重试的非阻塞任务使用；不要在调用后继续业务逻辑。阻塞任务通过该方法携带 `failedRecords` 会被拒绝。
- `context.logger`：记录诊断信息，框架会附加 migrationId、runId 和 runnerId。日志不能替代进度或结构化失败。
- `context.signal`：长计算或可取消 I/O 应响应中止信号。

正常返回表示脚本认为业务迁移和完成校验均已成功，由 Runner 标记 `succeeded` 并清理该任务的错误明细。任务可以返回有限标量的业务参数对象；Runner 校验后把参数与 `succeeded` 原子写入，列表接口再从静态注册表取得 `resultKey` 组装展示结果。`nameKey`、`descriptionKey`、`resultKey` 和阶段 `labelKey` 必须在注册表中使用 `i18nT(...)` 声明，禁止把 i18n key 写入 Mongo。不要自行调用完成状态更新，也不要用最后一条 progress 代替最终结果。

普通 `throw` 也会进入 `failed`，Runner 会把错误归属到当前 `running` 阶段，并保留任务之前通过 `reportFailedRecords` 上报的最新快照。只有 `context.fail` 显式携带 `failedRecords`（包括空数组）时才替换或清空旧快照。非阻塞任务的已知数据问题应维护完整未解决错误快照：处理中按批调用 `context.reportFailedRecords`，扫描结束仍有异常时再调用 `context.fail` 写入相同最终快照。错误对象只保存原始 `message`，不得携带 i18n key 或模板参数；每条错误数据必须包含已声明的 `stageKey`，只保存必要 ID 和原因，不复制原文档。框架按阶段记录异常数量，管理员从对应阶段按需打开详情。阻塞任务失败时管理页面本身不可用，应通过 `context.logger` 输出必要诊断后抛出异常；Context 会拒绝其读写错误明细，Runner 只把多节点协调所需的最小 `lastError` 写入状态表。

## 选择恢复策略

任务一旦获得新 runId，无论入口是管理员重置还是过期 lease 接管，都使用同一恢复策略：保留 checkpoint、progress 和最近错误；非阻塞任务还会保留供修复使用的错误明细。但触发条件不同：`running` 的 lease 过期可自动接管，阻塞 `failed` 在 owner 重启、lease 过期后可接管，非阻塞 `failed` 必须由管理员重置为 `pending`。脚本如何恢复由发布时选定的策略决定。

### 分批断点续跑

适用于数据量较大、执行时间不可控、无法在一个短事务内完成，或需要跳过坏数据继续扫描的任务。

每次执行必须覆盖三种输入状态：

1. 无 checkpoint、无错误数据：从稳定排序的起点开始。
2. 有 checkpoint、无错误数据：从最后完整提交的批次之后继续。
3. 有 checkpoint、有错误数据：先重新处理已跳过的错误记录，再从 checkpoint 继续扫描新数据。

推荐循环：

```text
读取并校验 checkpoint
读取 failedRecords，建立完整未解决错误快照并优先重试
while 还有数据:
  assertActive
  按稳定游标读取下一批
  在业务事务中执行幂等写入
  校验该批结果并提交事务
  如果错误快照变化，reportFailedRecords(完整未解决错误快照)
  saveCheckpoint
  reportProgress
执行全局完成校验
如果仍有错误，fail(包含相同最终错误快照)
reportProgress(completed)
return
```

关键约束：

- 使用 `_id` 或其他不可变、唯一且有索引的游标；不要使用 offset。
- 进程可能在业务提交后、checkpoint 保存前退出，因此整个批次必须可重复执行。
- checkpoint 只记录恢复所需的最小游标，不保存业务正文或不断增长的数组。
- `reportFailedRecords` 接收的是完整快照而不是新增项；不得逐条 append，也不得只上报当前批次，否则会覆盖之前仍未解决的错误。
- 错误快照必须先于对应 checkpoint 持久化。若进程在两者之间退出，接管节点会从旧 checkpoint 重放该批，并能读取已经保存的错误；禁止反向调用造成坏数据被 checkpoint 永久跳过。
- 错误快照已上报后又发生未预期异常时，Runner 会保留该快照；任务不得为了上报新异常而传入不完整的错误数组。
- 扫描结束仍有失败项时调用 `context.fail({ failedRecords })`，其中 `failedRecords` 与最近一次上报的完整快照一致。
- 重试后再次失败会替换旧错误明细；完整成功后由框架删除。

### 幂等全量重跑

仅适用于数据量确定较小、资源消耗有上界、结果由权威源确定，且整次写入可以保持原子或安全幂等的任务。

推荐流程：

```text
reportProgress(started)
读取完整权威源
在修改目标前完成全部转换、去重和校验
assertActive
原子写入或确定性覆盖完整结果
assertActive
刷新缓存并执行完成校验
reportProgress(completed)
return
```

关键约束：

- 不保存没有恢复意义的伪 checkpoint。每次管理员重试或 lease 接管都重新执行完整流程。
- 如果需要清空目标，目标必须完全由权威源派生，不包含用户增量；权威源必须保留。
- 清空和完整重建必须在同一事务中，失败时不能暴露空表或半成品。
- 源数据必须在清空目标前完成校验；重复执行和源数据修复后再执行都应产生确定结果。
- 如果全量操作无法在 lease 内稳定完成，改用分批策略，而不是单纯调大 lease。

## 阻塞与非阻塞

`blockStartup` 只决定节点 readiness，`onFailure` 只决定失败后是否暂停后续队列；所有任务仍严格按注册表顺序单线程执行。

- 选择阻塞任务：目标 Schema、配置或数据是新版本处理流量的必要前提。任一阻塞任务未成功，节点不能 ready。
- 选择非阻塞任务：新旧数据均可被业务兼容读取，迁移可在节点 ready 后后台完成。
- 阻塞任务的阶段进度仍通过 `reportProgress` 保存最新快照并同步输出阶段日志；具体错误诊断写终端日志，不写 `failedRecords`。状态表中的最小 `lastError` 仅用于跨节点观察失败事实，不承担错误日志存储职责。
- 阻塞任务明确失败后，owner 持续持有 lease 并等待；修复后需要重启 owner，lease 过期后由一个节点接管。
- 非阻塞任务明确失败后不自动重试；管理员查看错误、修复数据后点击重试，任务重新竞争 lease。
- `onFailure: 'continue'` 只允许相互独立的非阻塞任务使用：当前任务保持 `failed` 且等待管理员重试，Runner 可以跳过它继续后续任务；`stop` 则暂停后续队列。
- 位于后续阻塞任务之前且使用 `onFailure: 'stop'` 的非阻塞任务仍是启动前置条件；`continue` 任务失败后允许后续阻塞任务推进，因此必须确认二者没有成功依赖。

## 文件位置

迁移执行框架、静态注册表、Mongo Schema、服务端执行逻辑和任务集中在 App；前后端公共契约位于 global：

```text
packages/global/migration/
├── constants.ts
└── schema.ts

projects/app/src/migration/
├── constants.ts
├── registry.ts
├── runner.ts
├── entity.ts
├── service.ts
├── mongoSchema.ts
├── utils.ts
└── tasks/
    ├── README.md
    └── <migration-id>/
        ├── index.ts
        ├── service.ts
        └── utils.ts
```

- `index.ts` 只负责任务编排、Context 调用和进度阶段。
- `packages/global/migration` 只保存前后端共享的状态枚举、有限输入 Schema 和 API 类型，不放任务实现、Mongo Model 或 Runner。
- 注册项必须按执行顺序声明完整的 `progressSteps: [{ key, labelKey }]`；`key` 是永久稳定的机器标识，`labelKey` 放在 client-only `system_migration` i18n namespace，不写入 Mongo。
- 该任务专属的数据访问、转换和工具函数全部放在同名目录，不要散落到 `packages/global` 或 `packages/service`。
- 真正被正常运行期业务复用的能力保留在业务模块；迁移通过单向依赖调用它。
- Next.js API 路由和页面受框架目录约束，可以保留在 `pages/api`、`pages/config`，但必须是调用 migration service 的薄入口，不承载迁移逻辑。
- i18n 文案按项目现有机制放入所有语言文件；任务注册项使用 `i18nT(...)` 保存稳定的 name、description、result 和 progress label key。
- i18n key 只属于静态注册表和 API 展示 DTO，禁止写入状态表或错误明细表。成功结果只持久化有限标量参数，错误只持久化原始 `message`。
- 测试放在 `projects/app/test/migration/` 下并镜像源码子路径。

## 测试与验证

新增任务至少验证与其恢复策略相关的真实不变量，不写只匹配文案的测试。

通用场景：

- 首次执行成功，完成条件真实成立。
- 重复执行不会产生重复、覆盖错误数据或改变不应变化的结果。
- 源数据无效时不会留下部分目标数据，并能给出可定位错误。
- 业务写入或完成校验失败时不会被标记成功。
- 进度阶段、失败记录和日志不包含敏感或无界数据。
- 每个阶段均按 `running -> succeeded` 上报；任务返回前所有声明阶段都已成功，阶段异常和错误数据使用正确的 `stageKey`。
- 最终结果只在任务成功后存在；Mongo 只含参数，列表接口从注册表补入 key 后能渲染出预期业务结果。
- 任务注册在数组尾部，ID 唯一，`blockStartup` 和 `onFailure` 符合数据依赖。

分批任务额外验证：

- 从 checkpoint 恢复，不重扫已完成范围。
- 业务提交后、checkpoint 前退出时，重复批次仍然正确。
- checkpoint 与错误记录同时存在时，错误记录会被重新处理。
- 错误快照会在每批后替换持久化，且崩溃发生在错误上报与 checkpoint 之间时不会丢失或重复追加坏数据。
- 错误快照之后发生普通异常时，已保存的坏数据不会被空数组覆盖。
- 中途丢失 lease 后不再开始新的业务批次或保存状态。
- 阻塞任务调用 `getFailedRecords`、`reportFailedRecords` 或通过 `fail` 携带 `failedRecords` 时会被 Context 拒绝。

全量任务额外验证：

- 目标已有旧数据时仍能完整覆盖为权威结果。
- 写入失败会回滚清空和部分写入。
- 修改权威源后再次运行会产生对应的新结果。
- 空源数据的行为经过明确设计和测试，不能默认为安全。

只运行覆盖改动范围的局部测试、App typecheck、相关 ESLint 和 `git diff --check`。用户最终验收前不主动运行全量测试。若修改 API 路由或入参，继续遵守 `api-development` Skill；若新增单元测试，继续遵守 `test-case` Skill。

## 交付前检查

- [ ] 已确认恢复策略，并在任务函数注释中说明选择原因。
- [ ] 已证明任务整体及重放单元幂等。
- [ ] 只在注册表末尾追加，未修改已发布任务语义。
- [ ] 脚本未直接操作迁移状态表或错误数据表。
- [ ] 必需进度、lease 检查、完成校验和与阻塞类型匹配的失败出口均已实现。
- [ ] 需要展示最终产出时已由任务返回有限的 i18n 结果，并由 Runner 随成功终态提交。
- [ ] checkpoint 保存时机正确，或全量任务明确不使用 checkpoint。
- [ ] 分批任务在 checkpoint 前及时替换完整错误快照，没有只在任务末尾一次性保存坏数据。
- [ ] 阻塞任务只写终端诊断和最小 `lastError`，没有调用错误明细能力。
- [ ] 启动阻塞、失败调度策略、滚动升级兼容性和破坏性操作均已审查。
- [ ] 任务代码与测试位于 App migration 目录，不污染业务模块。
- [ ] 局部测试、类型检查、lint 和差异检查通过。
