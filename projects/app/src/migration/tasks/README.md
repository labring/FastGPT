# 系统升级任务

任务按首次发布版本与稳定任务 ID 组织。4.18 配置相关任务尚未发布，已统一为 `4180/20261116_migrate_system_configs`（系统配置迁移），注册表中仅保留一个配置任务。

| 任务 | 调度 | 职责 |
| --- | --- | --- |
| `20261022_initialize_dataset_vector_indexes` | 普通自动 | 初始化知识库向量索引 |
| `20261104_backfill_chat_publish_source` | 独立执行 | 回填聊天发布来源 |
| `20261104_backfill_openapi_key_type` | 独立执行 | 回填 OpenAPI Key 类型 |
| `20261112_backfill_stt_pricing_type` | 普通自动 | 回填 STT 计价类型 |
| `20261116_migrate_system_configs` | 启动阻塞 | 统一导入、清理、补齐并校验系统配置 |

## 系统配置迁移

本任务追加在 v4.18.0 注册表末尾，由启动计划按 `blockStartup` 提取并优先执行，不依赖注册项排在首位。所有 App 节点等待迁移成功后重新加载配置与模型，再启动业务和其他后台迁移。迁移失败时不放行业务启动，修复原因并重启迁移 owner 后接管重试。

同一个任务、同一个 lease/runId，依次执行以下阶段，任一阶段失败均不得标记任务成功：

1. `inspect`：检查旧 Mongo 配置与历史 ENV；仅当实例集合为空时读取 App 工作目录下可选的 `defaultConfig.json`。不满足新保存规则的历史值保留并按字段路径告警，不因校验失败丢弃字段。
2. `migrate`：按域创建缺失文档或补充缺失叶子，保留管理员已有值和显式默认意图。文件使用当前实例配置域格式，仅参与首次初始化。
3. `cleanup`：清理当前 Schema 明确废弃的字段及相应默认值标记。现行字段不得登记为废弃项。
4. `backfill`：先将旧套餐合入 `commercial.subPlans`，公告及两类广告合入 `operations`，迁入其他辅助 scope；再补齐外链检查、Agent Sandbox 代理、Code Sandbox/MCP SSE、模型下架短信、超卖系数、文件域名、HTTP/Cookie 策略、自定义域名部署参数。配置约束仅告警，按 revision CAS 写入并保留已有值与显式清空。
   最后按 secret 注册表将已有非空明文加密为 `{ secret: 密文 }`，所有回填读写统一通过解密/加密边界；revision CAS 保留并发修改，已有密文复用，重复执行不改变 revision。
5. `validate`：重新检查全部域、旧值缺口、废弃字段及各补齐目标的持久化依据。Schema 默认值本身不等于迁移完成；不满足新保存规则的历史值仅告警，数据库错误、CAS 冲突或目标缺失仍失败。

旧配置中的数值字段通过 `NumSchema` 兼容数字字符串（如 `"4"` → `4`）；不符合目标域整数、范围等保存约束的旧值保留并告警，不强制转成 `0`。已有实例值和显式默认意图仍优先。正常管理保存继续严格校验合并后的完整域，并返回带域前缀的字段错误，供管理员修复。

Pro 启动及轮询始终按已有 scope 与 Schema 默认值合成完整快照，不以迁移状态阻塞读取；本任务写入后由版本变化驱动刷新。Pro ENV 独立按差异发布，实例 ID 首建及授权变更等写入保留必要迁移检查。刷新失败保留上一有效快照并重试。旧 Mongo 配置统一按类型筛选、`_id` 倒序选取，不以 `createTime` 决定迁移来源。

旧 `EVAL_CONCURRENCY` 不导入，评估并发的新配置默认 `3`；Cookie Secure、共享 HTTP 响应上限和 Sandbox 两个超卖系数只从 App 进程 ENV 导入，Pro 同名 ENV 不参与。已有实例值和显式默认意图仍优先。

采用幂等全量重跑，不保存 checkpoint。失败后由框架使用新 runId 从检查阶段重试；成功步骤可安全重复执行，已写入配置不被重放覆盖。开发期已有成功记录不会自动重跑新增的加密步骤，需在备份后重跑本任务。成功后 Runner 跳过整个任务，不在后续启动重新导入旧 ENV，也不保留开发期拆分任务的注册或状态兼容层。未来已发布后的变更应追加新任务。

实现均归属同一目录：`index.ts` 编排五阶段，`service.ts` 处理旧值转换与域迁移，`cleanup.ts` 清理废弃字段，`subservices.ts` / `backfill.ts` 处理域内补缺，`env.ts` 读取历史环境变量，`defaultConfig.ts` 负责首次文件初始化。对应测试在 `projects/app/test/migration/tasks/4180/20261116_migrate_system_configs/`。

配置权威边界与字段说明见 [Admin 实例配置与环境变量边界](../../../../../.agents/design/common/admin-instance-config-env-boundary.md)。状态、进度和错误数据由 Runner/Context 管理，开发约定见[系统升级脚本技能](../../../../../.agents/skills/system/system-migration-development/SKILL.md)。

`proEnv` 是同集合中的特殊 scope，仅由 Pro 启动根据 ENV 发布；不属于 11 个可配置业务域，defaultConfig.json 和管理 API 不允许写入。Pro 先发布不会影响 App 业务域的首次初始化或迁移完成判断。

`system_instance_configs` 共 17 个 scope：上述 11 个业务域，以及 proEnv、license、instanceId、modelStatusProbe、moderationPolicy、operations 六个辅助 scope。套餐保存为 `commercial.subPlans`，与商业配置共用 revision；`operations` 包含 systemMsgModal、operationalAd、activityAd 三个子对象，局部保存不会覆盖其他子项。license 保持独立，proEnv 仍只由 ENV 发布。

合并迁移优先保留新目标，其次读取开发期旧 `system_instance_configs` scope，最后读取旧 `systemconfigs`；诊断配置约束后，在同一事务中迁入、复验承接结果并删除四个开发期旧 scope，保留原始 `systemconfigs` 作为迁移来源。配置更新只轮询 `domain/_id/revision`，不保留配置 Change Stream 监听。
