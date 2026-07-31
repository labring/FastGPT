# Redis DAL OCR Review

## Review 命令

OCR 面向 agent 的基本命令：

    ocr review --audience agent --format json

本分支基线 review 使用：

    ocr review --from origin/main --to HEAD --audience agent --format json --background 'This branch completes the FastGPT Redis DAL migration. Review runtime connection lifecycle, cache semantics, BullMQ queue/worker ownership, shutdown and error handling, compatibility of service callers, security boundaries, and test coverage. Report only actionable correctness or regression risks with file/line evidence.' --exclude '**/node_modules/**,**/coverage/**,**/dist/**' --timeout 10

当前工作区复审使用同样的 --audience agent --format json，并通过 --background、--exclude 和 --max-tokens-budget 缩小范围。OCR 帮助中确认的关键参数为 --from/--to、--audience agent、--format json、--background/--background-file、--exclude、--resume 和 --timeout。

## Review 结果

| Session | 范围 | 结果 | 处理 |
| --- | --- | --- | --- |
| 9881f62d-018c-44cb-92bf-f32f06d81335 | origin/main...HEAD | 分析 26 个文件后因范围过大停止；21 条评论、111 条候选 issue（含重复） | 归并为本轮可行动 tasks |
| 65a228d4-a250-4e54-9cf0-72fed76982ea | 当前工作区，15 个文件 | 3 条 finding | 全部修复 |
| 856191e8-7669-4c3d-b970-7a3176e49d29 | DAL 实现，8 个文件 | 2 条 finding | 全部修复 |
| cf03a161-774a-4263-94aa-0dfd856b12ec | adapter/cache，3 个文件 | 2 条 finding | 全部修复 |
| 387c46f9-fedb-4c63-87c7-1db845f8a5a6 | adapter/cache，3 个文件 | 3 条 finding | 全部修复 |
| bd5f3ff3-dde0-4043-9a3e-1e8438e2c630 | adapter/cache，3 个文件 | 1 条 finding | 已修复；修复后未再运行 OCR |

一次 max-tokens-budget 过低的窄范围命令返回了 budget_exceeded 且没有实际 dispatch（session a9662b57-225a-4dff-8261-dbc773a11778），不作为“无问题”结论。

## 已修复 Tasks

### CollectionUpdate

- 在 queue default options 中增加 attempts: 3 和 exponential backoff。
- 投递前清理历史遗留的 completed/failed 固定 jobId，释放旧版本保留策略造成的阻塞。
- 最终失败使用 removeOnFail: { count: 0 }，避免固定 jobId 长期占用。
- enqueue 失败记录日志并重新抛出；并发 duplicate job 在活动态按幂等成功处理，终态则清理后重试。
- 在 packages/dal/test/redis/bullmq-services.test.ts 覆盖重试配置、终态清理、enqueue 失败和并发 duplicate。

### TeamVectorCountCache

- "0" 返回数字 0，不再被当作 cache miss。
- 只接受十进制非负安全整数，NaN、Infinity、负数、小数、十六进制、二进制和指数形式均按 miss 处理。

### LeaseCache

- 防止续租请求重叠。
- 续租和 acquisition 使用请求开始时间计算保守 deadline。
- 增加独立 expiry watchdog；续租挂起或响应过慢时会 abort 并 fail closed。
- callback 进入前、成功返回前和异常路径均校验 lease 有效性。
- 短 TTL 默认续租间隔至少为 1ms；expiry 和 renewal timer 对超长 delay 分段调度，避免 Node timer 溢出或被截断为 1ms。
- 覆盖挂起续租、慢 acquisition、短 TTL 和不重叠续租测试。

### BullMQ Runtime

- worker restart 期间增加名称 reservation，避免 registry 删除到重建之间并发创建同名 worker。
- runtime close 即使 worker manager 报错也继续关闭 queue，并保留首个错误。
- 增加 restart reservation 和 queue close fallback 测试。

### S3 Delete 与 Adapter

- S3 单对象和 prefix jobId 现在包含 bucket、操作类型，并使用 encodeURIComponent 加 | 分隔，避免 bucket/key 碰撞和 BullMQ : 限制。
- RedisCacheAdapter.evalScript 拒绝 NaN、Infinity 等非有限数值参数。
- 增加 jobId 碰撞边界和 Lua 参数顺序/校验测试。

## 未纳入本次范围

OCR 还提出了部分需要独立设计或缺少当前调用方证据的建议，例如所有 cache 的全面补测、queue option 全局策略、stream/session key 编码、blocking reader 遗弃连接回收、多个 runtime hook 命名以及旧 Redis 版本兼容性。这些没有直接纳入本次 Redis DAL checks 修复，避免把泛化建议扩展成未经验证的行为变更。

## 验证记录

- pnpm --filter @fastgpt/dal typecheck：通过。
- pnpm --filter @fastgpt/dal test：30 个文件、385 个测试通过。
- DAL 相关定向测试：最终 4 个文件、58 个测试通过。
- sandbox service 定向测试：4 个文件、25 个测试通过。
- pnpm --filter @fastgpt/app typecheck：通过。
- 初始 app lint 为既有基线问题：107 errors、304 warnings；本轮未将全局 lint 基线混入 Redis DAL 修复。
