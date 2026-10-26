# 系统升级任务目录

每个生产升级任务必须按发布版本归类放入独立目录，路径格式为 `tasks/<version>/<migration-id>/`（例如版本 4.17.0 对应 `4170`，4.17.1 对应 `4171`），由 `index.ts` 暴露任务入口，相关 service、数据转换和私有工具都放在该任务目录内。严禁在 `tasks/` 根目录下直接平铺创建迁移任务目录。版本级共享逻辑收纳在对应版本目录下。任务由上级 `registry.ts` 按发布顺序显式导入。迁移专属实现不得放入正常业务目录；确实被运行期业务复用的能力仍归业务模块所有。所有任务在后台执行，不参与节点 readiness 判定。

任务发布后必须遵守以下约束：

- 只能在注册表末尾追加，不得修改已有任务的 ID、顺序、调度模式、`onFailure` 或执行语义；
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
- `onFailure` 只控制所在队列：`stop` 暂停普通队列后续任务，`continue` 跳过失败项继续后续可执行任务。独立任务的失败只影响自身；依赖失败任务的普通任务仍须等待前置成功。
- 明确失败统一停止续租并保持 `failed`，由管理员在页面修复后重试；即使节点重启或 lease 过期也不会自动重试。进程异常退出时状态保持 `running`，lease 过期后自动接管。

## 执行模式

| 模式 | 注册配置 | 调度行为 |
| --- | --- | --- |
| 普通自动 | 不声明额外模式 | 进入普通队列，按注册顺序串行执行 |
| 延迟自动 | `delay: true` | 在普通队列获得 lease 后等待 `SYSTEM_MIGRATION_DELAY_SECONDS` 秒；默认 0，等待期间占用普通队列 |
| 手动触发 | `manual: true` | 初始 `waiting`，管理员触发后进入普通队列 |
| 独立执行 | `independent: true` | 自动竞争自己的 lease，不等待普通队列或其他独立任务，可与它们并发执行 |

独立任务不能同时声明 `manual`、`delay` 或非空 `dependsOn`。任务必须在数据与业务语义上独立，不能读写仍依赖其他迁移完成的结构。独立任务的 `onFailure` 仅作用于自己的单任务队列，不会暂停其他任务。普通任务可以通过 `dependsOn` 等待更早注册的独立任务成功。

启动阻塞模式已移除，注册项不再声明 `blockStartup`。原成员角色清理、旧系统模型迁移保留原 ID、顺序和 `stop` 策略，按普通自动任务执行；历史成功状态不重跑，历史失败状态通过管理员重试恢复。

## 手动触发任务

需要管理员确认升级前提的任务可声明 `manual: true`。存在执行依赖时，通过 `dependsOn` 声明注册表中更早的前置任务 ID；启动、重试和 runner 执行均要求前置任务已成功。默认自动任务不受影响。

- 首次原子初始化为 `waiting`，管理端显示“待手动执行”；runner 跳过该任务继续后续自动任务，不占用 lease、不阻塞 readiness。
- 管理员确认任务说明中的前提后点击“执行迁移”，API 原子把 `waiting` 改为 `pending` 并唤醒 runner。重复点击不会重置执行中的任务。
- 首次入队后复用标准 lease、checkpoint 和进度机制；进程中断自动接管，明确失败由管理员修复后使用“重试”。
- `manual` 不得与 `independent` 或 `delay` 同时启用。后续自动任务不得依赖尚未手动执行的任务。
- 手动触发不会自动检测集群升级完成；例如 chunk 迁移必须确认所有旧 App/Pro 生产者和 worker 已停止、旧租约过期后再执行。
- 重建状态迁移依赖 chunk 迁移成功，避免前置任务随后写出尚未转换的旧 `rebuild` 模式。
