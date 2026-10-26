# 系统升级任务目录

每个生产升级任务必须按发布版本归类放入独立目录，路径格式为 `tasks/<version>/<migration-id>/`（例如版本 4.17.0 对应 `4170`，4.17.1 对应 `4171`），由 `index.ts` 暴露任务入口，相关 service、数据转换和私有工具都放在该任务目录内。严禁在 `tasks/` 根目录下直接平铺创建迁移任务目录。版本级共享逻辑收纳在对应版本目录下。任务由上级 `registry.ts` 按发布顺序显式导入。迁移专属实现不得放入正常业务目录；确实被运行期业务复用的能力仍归业务模块所有。任务分为启动链和后台阶段：启动链成功且本节点模型重载完成后，才放行业务与后台任务。

任务发布后必须遵守以下约束：

- 只能在注册表末尾追加，不得修改已有任务的 ID、顺序、调度模式、依赖或执行语义；
- 业务写入必须幂等，优先使用唯一键、`$setOnInsert`、确定性目标值或 compare-and-set；
- 每个任务必须明确选择一种恢复策略：数据量较大或无法原子完成时使用“分批断点续跑”；数据量确定较小且整次写入可以保持原子、确定、幂等时允许使用“全量重跑”；
- 分批任务统一从 `@/migration/constants` 导入 `systemMigrationBatchSize`，由环境变量 `SYSTEM_MIGRATION_BATCH_SIZE` 控制；允许范围为 50～1000，默认 100，任务内不得另行硬编码读取批大小；
- 分批任务在每批开始前调用 `context.assertActive()`；业务提交后若错误快照发生变化，先通过 `context.reportFailedRecords()` 替换当前完整未解决错误快照，再保存 checkpoint。重试时先通过 `context.getFailedRecords()` 处理上次已跳过的坏数据，再从 checkpoint 继续；
- 全量任务不保存伪 checkpoint，每次管理员重试或 lease 接管都重新读取、校验并处理完整数据集；如果需要清空目标数据，目标必须是完全由权威源重建的派生数据，且清空与重建必须位于同一事务；
- 任务默认只追加或回填数据，不删除旧字段、旧集合或不可恢复的数据；
- 注册项使用 `i18nT(...)` 声明 `nameKey`、`descriptionKey`、`resultKey` 以及全部 `progressSteps: [{ key, labelKey }]`；阶段 `key` 是永久稳定的机器标识，所有展示文案位于 client-only `system_migration` namespace；
- i18n key 只存在于静态注册表和列表接口的展示 DTO，不写入 Mongo。任务状态只保存进度数值和成功结果参数；错误状态与错误明细只保存原始 `message`；
- 任务进入阶段时通过 `reportProgress` 上报 `running`，完成后上报 `succeeded`；框架按 key 更新对应阶段并要求全部阶段完成后才能成功，脚本不得主动上报 `failed`；
- 任务成功时可以返回有限标量的业务参数对象；Runner 校验后与 `succeeded` 原子写入。列表接口再使用注册表 `resultKey` 组装客户端展示结果。不要从任务返回 i18n key，也不要把最终结果伪装成最后一条 progress；
- 任务可跳过的坏数据应按批维护“完整未解决错误快照”，每批业务提交后立即通过 `context.reportFailedRecords()` 覆盖持久化，再推进 checkpoint；扫描结束仍有错误时通过 `context.fail({ failedRecords })` 写入相同最终快照并结束。每条记录必须包含所属的 `stageKey`，且只保存定位字段及对应原因，不保存正文、凭证或完整错误栈；
- 已上报错误快照后又发生普通异常时，Runner 保留该快照；只有脚本通过 `context.fail` 显式携带 `failedRecords`（包括空数组）时才替换或清空。
- 后台失败只影响当前任务及其显式依赖，不提供 onFailure 配置；启动链失败则所有新版本 App 节点保持未就绪，后台任务不得开始。
- 后台明确失败停止续租并等待管理员重试；启动链明确失败持续续租并通过日志排障，修复后重启持有租约的 App 节点，租约过期后由一个节点接管。两类任务的 running 过期均可接管，恢复保留断点与失败快照。

## 执行模式

| 模式 | 注册配置 | 调度行为 |
| --- | --- | --- |
| 启动阻塞 | `blockStartup: true` | 自身及完整依赖链在业务启动前优先串行执行 |
| 普通自动 | 不声明额外模式 | 启动链完成后进入普通队列，按注册顺序串行执行 |
| 延迟自动 | `delay: true` | 在普通队列获得 lease 后等待 `SYSTEM_MIGRATION_DELAY_SECONDS` 秒；默认 0，等待期间占用普通队列 |
| 手动触发 | `manual: true` | 初始 `waiting`，管理员触发后进入普通队列 |
| 独立执行 | `independent: true` | 不受普通队列顺序约束；先竞争集群共享的 3 个并发名额，再领取任务 lease |

独立任务不能同时声明 `blockStartup`、`manual`、`delay` 或非空 `dependsOn`。任务必须在数据与业务语义上独立，不能读写仍依赖其他迁移完成的结构。独立任务失败不会暂停其他任务。普通任务可以通过 `dependsOn` 等待更早注册的独立任务成功。

启动阻塞目前仅由 `20260903_migrate_legacy_system_models` 声明，成员角色清理继续使用独立模式。历史成功状态不重跑；启动链失败通过重启 owner 恢复，后台失败通过管理员重试恢复。

### 启动链优先级

`plan.ts` 递归收集所有阻塞任务及其依赖，排除无关任务。注册表只允许引用更早的任务，因此筛选后的注册顺序就是稳定拓扑顺序。原本独立的前置也会提升为启动任务，串行执行且不占后台 Redis 并发名额；启动链禁止包含手动或延迟任务。

每个节点都等待整个启动链持久化为 succeeded，随后由 `startup.ts` 先重载该节点模型缓存，再启动 HTTP 对应的业务初始化、worker/cron/watch，最后启用后台迁移。共享状态成功不等于跟随节点的内存缓存已刷新，不能省略本地重载。启动链失败时页面不可用，查看日志并重启失败的 lease owner；其他存活节点不能越过有效租约重试。

例如注册顺序为普通 A、前置 B、独立 C、阻塞 D（依赖 B）：实际启动顺序为 B → D，之后才启动 A 与 C。

## 独立任务并发上限

启动链完成后，所有 App 节点通过同一个 Redis 并发租约 key `system-migration:independent` 共享 3 个名额。普通串行队列不占这些名额。共享租约复用 LeaseCache.withConcurrency 的原子获取、续租和释放机制，默认 90 秒过期、15 秒续租；计时与任务 lease 使用相同的 Runner timing。

- 先取得共享名额，再竞争该任务的 Mongo lease；等待期间不领取新的任务 lease；首次执行保持 pending，待接管的 running 保留原状态和断点。
- 成功、明确失败或领取不到任务 lease 时释放名额，其他等待任务继续竞争。
- 等待超过一轮扫描周期不标记失败，下轮扫描继续；Redis 故障时不绕过上限、不开始任务。
- 共享租约失效时中止任务信号并停止 Mongo heartbeat；任务保留 running 和 checkpoint，待任务 lease 过期后接管。
- Runner 停止时取消等待并中止活跃执行；节点异常退出后，共享名额由 TTL 回收。脚本仍须响应 signal，并在每批业务写入前调用 assertActive。

## 当前独立任务

以下七个任务声明 `independent: true`，启动链成功后在集群共享的 3 个名额内分别竞争自己的 lease，可与普通队列并发执行；成功后不因切换模式重新执行，失败仍通过统一页面重试：

| 脚本 ID | 任务 |
| --- | --- |
| 20260907_cleanup_team_member_roles | 清理历史团队成员角色 |
| 20260903_backfill_resource_create_time | 回填资源创建时间 |
| 20260905_backfill_bill_metadata | 回填历史订单缺失字段 |
| 20260907_migrate_dataset_tags_v2 | 升级知识库标签数据 |
| 20260928_backfill_member_name_set | 回填团队成员名设置标记 |
| 20261009_backfill_agent_sandbox_team_id | 回填沙箱实例团队归属 |
| 20261022_backfill_folder_ancestor_ids | 回填目录祖先路径 |

系统模型迁移为启动阻塞任务；权限补齐、历史邀请成员清理仍在后台普通队列；带前置依赖、延迟或手动确认要求的任务不会因此提前执行。

## 手动触发任务

需要管理员确认升级前提的任务可声明 `manual: true`。存在执行依赖时，通过 `dependsOn` 声明注册表中更早的前置任务 ID；启动、重试和 runner 执行均要求前置任务已成功。默认自动任务不受影响。

- 首次原子初始化为 `waiting`，管理端显示“待手动执行”；runner 跳过该任务继续后续自动任务，不占用 lease、不阻塞 readiness。
- 管理员确认任务说明中的前提后点击“执行迁移”，API 原子把 `waiting` 改为 `pending` 并唤醒 runner。重复点击不会重置执行中的任务。
- 首次入队后复用标准 lease、checkpoint 和进度机制；进程中断自动接管，明确失败由管理员修复后使用“重试”。
- `manual` 不得与 `independent` 或 `delay` 同时启用。后续自动任务不得依赖尚未手动执行的任务。
- 手动触发不会自动检测集群升级完成；例如 chunk 迁移必须确认所有旧 App/Pro 生产者和 worker 已停止、旧租约过期后再执行。
- 重建状态迁移依赖 chunk 迁移成功，避免前置任务随后写出尚未转换的旧 `rebuild` 模式。

## 前置依赖

`dependsOn` 是成功前提，不是额外的执行模式。任务可以声明多个更早注册的任务 ID，只有它们全部 succeeded 才能执行。前置为 waiting、pending、running、failed 或状态缺失时都不能越过；后台前置修复并重试成功后，等待的自动任务会继续执行；启动链前置失败则需修复并重启 owner。

当前依赖关系：

- 模型权限、知识库模型引用、评测模型引用、应用模型引用回填，都依赖 `20260903_migrate_legacy_system_models` 成功。四个任务都会从 ai_models 和系统默认配置加载模型目录；在目录迁移完成前执行可能误判模型引用，权限回填还可能删除仍有效的旧名称权限。
- `20260916_backfill_app_resource_snapshots` 依赖 `20260903_backfill_app_model_references` 成功。
- `20261009_migrate_dataset_rebuild_status` 依赖 `20261008_migrate_chunk_training` 成功。

不要用数组中的相邻位置代替业务成功依赖，也不要把所有任务链式关联来模拟旧的全队列暂停。普通队列仍按注册顺序串行选择可执行任务，独立模式仍与非空 dependsOn 互斥。
