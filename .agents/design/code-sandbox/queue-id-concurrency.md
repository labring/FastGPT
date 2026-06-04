# 代码沙盒 queueId 并发排队设计

## 目标

在代码沙盒运行接口中新增可选 `queueId`，并通过环境变量控制同一个 `queueId` 同时可进入执行流程的请求数。

目标行为：

- 默认不启用，完全兼容现有调用；
- 启用后仅对带 `queueId` 的请求生效；
- 同一 `queueId` 超出并发上限时 FIFO 等待；
- 进程池原有 worker 等待队列继续负责真实 worker 分配。

## 接口设计

### 请求体

`POST /sandbox/js` 和 `POST /sandbox/python` 增加字段：

```json
{
  "code": "async function main() { return {} }",
  "variables": {},
  "queueId": "team-xxx"
}
```

字段约束：

- `queueId` 可选；
- 空字符串会按未传处理；
- 非字符串返回 400；
- 最大长度限制为 128，避免异常请求造成队列 key 膨胀。

### 环境变量

新增：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `SANDBOX_QUEUE_ID_CONCURRENCY` | 同一 `queueId` 同时可进入执行流程的请求数；为空时不启用 queueId 排队 | 空 |

## 实现方案

新增 `QueueIdLimiter`：

- 内部维护 `Map<string, QueueState>`；
- 每个 `queueId` 有独立 FIFO 等待队列、运行计数和上限；
- `run(queueId, task)` 在未启用或无 queueId 时直接执行 task；
- 同一 queueId 运行数达到上限时，把请求放入对应等待队列；
- task 完成后释放许可，唤醒同 queueId 的下一个等待请求；
- 队列空且运行数为 0 时删除对应 Map entry。

与进程池组合：

```ts
await queueIdLimiter.run(queueId, () => pool.execute(options));
```

这形成两层队列：

- queueId 队列：限制同一个业务 id 的并发进入执行流程；
- process pool 队列：限制真实 worker 数量，并复用已有 worker 生命周期管理。

## 测试设计

- 单元测试 `QueueIdLimiter`：
  - 未启用时不排队；
  - 同 queueId 按上限限制并发；
  - 不同 queueId 互不阻塞；
  - 空 queueId 不排队；
  - 队列空后清理状态。
- API 集成测试：
  - 接口接受 `queueId` 并正常执行；
  - `queueId` 非字符串返回 400。
- 真实 HTTP 集成测试：
  - 启动本地 Hono server；
  - 通过 `fetch` 并发请求 `/sandbox/js`；
  - 验证同一 `queueId` 串行、不同 `queueId` 并行、未传 `queueId` 不受限。

## TODO

- [x] 梳理现有接口、env、进程池和测试结构。
- [x] 新增 `SANDBOX_QUEUE_ID_CONCURRENCY` 环境变量。
- [x] 新增 `QueueIdLimiter` 并补单元测试。
- [x] 在 JS/Python API 执行入口接入 queueId limiter。
- [x] 更新 `ExecuteOptions`、`CodeSandbox.runCode()` 类型和 README。
- [x] 运行代码沙盒局部测试。
- [x] 运行真实 HTTP 集成测试。
- [x] 运行代码沙盒全量测试。
