# 错误与日志

用于异步调用、异常分支和日志改动。错误处理负责决定流程如何结束或恢复，日志负责保留可定位的证据，两者不要求在每一层重复执行。

## 错误传播与兜底

- 从失败点追到实际负责处理的边界：API 的统一封装、worker 或任务入口已兜底时，内部 service 可以直接抛出，不要求每层加 try-catch 或重复记日志。
- 独立异步任务及不等待结果的 Promise 必须有有效的失败处理；`void promise` 本身不能捕获 rejection。确认兜底不会再次抛出无人处理的错误。
- 保留原始 Error、堆栈和必要的 cause；重新包装错误不能只剩泛化消息，向外暴露的内容仍需遵守 [敏感信息规则](security.md#敏感信息)。
- 区分业务拒绝和系统故障，核对当前错误封装与响应映射，不假定某个 Error 构造方式必然返回特定 HTTP 状态。重复键（11000）、连接异常等按实际业务语义处理。
- 主流程失败不能静默吞掉；明确不影响主流程的清理可按 [代码规范](../../../../code/syntax.md) 使用 `.catch()` 忽略，按排障需要记录原因或上下文，不能把所有空 catch 一律判为缺陷。

## 日志与链路上下文

- 服务端统一使用 `@fastgpt/service/common/logger`；启动入口避免重复初始化 `configureLogger()`，业务代码使用 `getLogger(LogCategories.XXX)`，不自行散落 `console.log` 或任意 category 字符串。
- 分类沿用 `SYSTEM`、`INFRA.*`、`HTTP.*`、`MODULE.*` 的业务归属；确有分类缺口时在 `packages/service/common/logger/categories.ts` 中维护。
- 消息短且稳定，ID、状态、耗时、数量放在结构化字段中，不用 `JSON.stringify` 或大段用户文本拼接消息。
- 错误通过 `error` 字段记录 Error 对象，结合实际路径带上 teamId、datasetId、jobId 等必要上下文。负责记录的边界应清楚，避免各层重复输出同一失败。
- HTTP 链路保留 requestId，优先使用 `withContext`；队列和定时任务保留 jobId、queueName 等上下文，跨模块字段命名一致。
- `info` 用于阶段开始/完成，`warn` 用于可恢复异常，`error` 用于影响流程的失败；高频循环日志使用 debug/trace，结合频率检查日志成本。
- 需要阻止 OTEL 导出时显式使用 `otel: false`；允许记录哪些数据及如何脱敏，统一按 [安全与权限](security.md#敏感信息) 检查。

```ts
logger.error('Vector queue task failed', { error, taskId, teamId });
```
