# 系统升级任务目录

每个生产升级任务使用一个以任务 ID 命名的独立目录，由 `index.ts` 暴露任务入口，相关 service、数据转换和私有工具都放在该目录内，并由上级 `registry.ts` 按发布顺序显式导入。迁移专属实现不得放入正常业务目录；确实被运行期业务复用的能力仍归业务模块所有。首个任务是阻塞型旧系统模型迁移；后续只有真实业务升级需要时才新增任务。

任务发布后必须遵守以下约束：

- 只能在注册表末尾追加，不得修改已有任务的 ID、顺序、`blockStartup`、`onFailure` 或执行语义；
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
- 阻塞任务发生明确错误时直接抛出异常，并在抛出前按需通过 `context.logger` 输出诊断信息。Runner 只在状态表保存多节点协调所需的最小 `failed + lastError`；Context 会拒绝阻塞任务读取或写入错误明细。阻塞期间管理页面不可用，排障以终端日志为准；
- 非阻塞任务可跳过的坏数据应按批维护“完整未解决错误快照”，每批业务提交后立即通过 `context.reportFailedRecords()` 覆盖持久化，再推进 checkpoint；扫描结束仍有错误时通过 `context.fail({ failedRecords })` 写入相同最终快照并结束。每条记录必须包含所属的 `stageKey`，且只保存定位字段及对应原因，不保存正文、凭证或完整错误栈；
- 已上报错误快照后又发生普通异常时，Runner 保留该快照；只有脚本通过 `context.fail` 显式携带 `failedRecords`（包括空数组）时才替换或清空。
- `blockStartup` 只控制节点 ready，`onFailure` 只控制失败后是否暂停后续任务；阻塞任务必须使用 `stop`，相互独立的非阻塞任务才可使用 `continue`；
- 阻塞任务普通异常会暂停队列并永久等待，修复后必须重启 App 节点；非阻塞任务保持 `failed`，修复后由管理员在页面重试；`continue` 只跳过失败项，不会自动重试它；节点异常退出仍由 lease 过期后自动接管。
