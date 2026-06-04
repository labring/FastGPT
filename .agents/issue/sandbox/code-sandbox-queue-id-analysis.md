# 代码沙盒 queueId 排队能力问题分析

## 背景

代码沙盒当前通过 `ProcessPool` / `PythonProcessPool` 维护每种语言的 worker 池。请求进入 `/sandbox/js` 或 `/sandbox/python` 后，会直接调用对应进程池的 `execute()`：

- 有空闲 worker 时立即执行；
- 没有空闲 worker 时进入进程池内部 `waitQueue`，等待 worker 释放；
- 所有请求共享同一个语言池队列，无法按业务维度限制某一类请求的并发。

当某个业务方在短时间内提交大量代码执行请求时，会占用同语言 worker 和池内等待队列，影响其他业务方的请求延迟。

## 需求

为代码沙盒运行接口增加 `queueId`：

- `POST /sandbox/js`
- `POST /sandbox/python`

新增环境变量控制同一个 `queueId` 同时允许多少个请求进入执行流程。环境变量为空时认为不启用排队能力，保持现有行为。

## 现状分析

### 可复用能力

- `projects/code-sandbox/src/pool/base-process-pool.ts` 已有 worker 维度等待队列 `waitQueue`，负责“待运行/待分配 worker”的队列。
- `projects/code-sandbox/src/utils/semaphore.ts` 已提供简单 FIFO 信号量，语义可用于单个 `queueId` 的并发控制。

### 插入位置

排队控制应放在 HTTP API 边界和进程池之间：

```
HTTP request -> queueId limiter -> process pool waitQueue -> worker execution
```

这样可以保持进程池只关心 worker 生命周期，不把业务 queueId 概念扩散到 worker 管理层。

## 边界语义

- 环境变量为空：不创建 queueId 队列，所有请求走现有进程池逻辑。
- 环境变量有值但请求未传 `queueId`：不按 queueId 排队，避免把所有未标识请求挤到同一个匿名队列。
- 同一个 `queueId` 内按 FIFO 唤醒。
- 不同 `queueId` 之间不做额外公平调度，仍由进程池 worker 队列决定实际执行顺序。
- `queueId` 队列在无运行请求且无等待请求后清理，避免高基数 id 导致内存长期增长。

## 实现约定

- 环境变量名称采用 `SANDBOX_QUEUE_ID_CONCURRENCY`。
- FastGPT 主应用如果要对工作流代码节点启用业务排队，需要在调用 `codeSandbox.runCode()` 时显式传入 queueId。本次先实现代码沙盒运行接口和 SDK 方法的可选参数，不替业务侧猜测默认 queueId。
