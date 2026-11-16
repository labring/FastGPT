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

同一个任务、同一个 lease/runId，依次执行以下阶段，任一阶段失败均不能放行 App 业务：

1. `inspect`：检查旧 Mongo 配置与历史 ENV；仅当实例集合为空时读取 App 工作目录下可选的 `defaultConfig.json`。异常配置只记录字段路径，保留脱敏跳过项统计。
2. `migrate`：按域创建缺失文档或补充缺失叶子，保留管理员已有值和显式默认意图。文件使用当前实例配置域格式，仅参与首次初始化。
3. `cleanup`：清理当前 Schema 明确废弃的字段及相应默认值标记。现行字段不得登记为废弃项。
4. `backfill`：补齐外链检查、模型下架短信、Code Sandbox/MCP SSE、Agent Sandbox 代理及超卖系数、文件域名、HTTP/Cookie 策略、自定义域名部署参数。先校验再按 revision CAS 写入，保留已有值与显式清空。
5. `validate`：重新检查全部域、旧值缺口、废弃字段及各补齐目标的持久化依据。Schema 默认值本身不等于迁移完成。

旧配置中的数值字段先通过 `NumSchema` 兼容数字字符串（如 `"4"` → `4`），再执行目标域的整数、范围等校验；空值、非数字类型与非有限值不强制转成 `0`。已有实例值和显式默认意图仍优先。

Pro 可先使用 Schema 默认值启动，等待本任务状态为 `succeeded` 后自动加载真实配置并同步 ENV；等待期间不读取半成品或写回旧配置。首次刷新失败会重试，成功后转回常规热更新。旧 Mongo 配置统一按类型筛选、`_id` 倒序选取，不以 `createTime` 决定迁移来源。

旧 `EVAL_CONCURRENCY` 不导入，评估并发的新配置默认 `3`；Cookie Secure、共享 HTTP 响应上限和 Sandbox 两个超卖系数只从 App 进程 ENV 导入，Pro 同名 ENV 不参与。已有实例值和显式默认意图仍优先。

采用幂等全量重跑，不保存 checkpoint。失败后由框架使用新 runId 从检查阶段重试；成功步骤可安全重复执行，已写入配置不被重放覆盖。成功后 Runner 跳过整个任务，不在后续启动重新导入旧 ENV，也不保留开发期拆分任务的注册或状态兼容层。未来已发布后的变更应追加新任务。

实现均归属同一目录：`index.ts` 编排五阶段，`service.ts` 处理旧值转换与域迁移，`cleanup.ts` 清理废弃字段，`subservices.ts` / `backfill.ts` 处理域内补缺，`env.ts` 读取历史环境变量，`defaultConfig.ts` 负责首次文件初始化。对应测试在 `projects/app/test/migration/tasks/4180/20261116_migrate_system_configs/`。

配置权威边界与字段说明见 [Admin 实例配置与环境变量边界](../../../../../.agents/design/common/admin-instance-config-env-boundary.md)。状态、进度和错误数据由 Runner/Context 管理，开发约定见[系统升级脚本技能](../../../../../.agents/skills/system/system-migration-development/SKILL.md)。

`proEnv` 是同集合中的特殊 scope，仅由 Pro 启动根据 ENV 发布；不属于 11 个可配置业务域，defaultConfig.json 和管理 API 不允许写入。Pro 先发布不会影响 App 业务域的首次初始化或迁移完成判断。

辅助 scope 也统一迁入 `system_instance_configs`：subPlans、langfuse、license、instanceId、modelStatusProbe、moderationPolicy、systemMsgModal、operationalAd、activityAd。proEnv 仍只由 ENV 发布。旧 systemconfigs 仅保留迁移来源；配置更新只轮询 `domain/_id/revision`，不保留配置 Change Stream 监听。
