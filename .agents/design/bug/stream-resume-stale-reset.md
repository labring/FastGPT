# 对话运行状态统一由 Redis lease 提供

## 职责

| 数据 | 职责 |
| --- | --- |
| Redis 会话 lease | 生成互斥、独立心跳、唯一运行状态来源 |
| Mongo chat / chat item | 标题、变量、已读、消息内容、错误信息、用量等持久数据 |
| Redis stream mirror | 按请求主动开启的 SSE 缓存和恢复 |
| Redis stop key | 会话级显式停止信号 |

Mongo 不再声明、读取或写入 `chatGenerateStatus`。API 保留同名兼容字段，由 lease 派生：`0=generating`（占用生成槽）、`1=done`（空闲），不再提供会话 `error` 状态。消息 `errorMsg/errorText` 和 SSE 错误事件继续用于展示具体错误；移除 Workflow Builder 依赖会话 error 的错误红点。

## 生成生命周期

1. `preChatRound` 确定最终 chatId，按 `sourceType/sourceId/chatId` 原子获取 Redis lease，沿用 DAL 默认 3 秒操作超时；仅在期限内明确返回已占用时拒绝重复生成。获取异常或超时时记录日志并降级放行，不启动未确认租约的续租或释放。超时仅结束等待，迟到结果不再改变本轮放行决定；若 Redis 迟到执行了获取命令，由 TTL 回收。不再查询 Mongo generating 门禁。不保存记录的请求保持跳过 lease。
2. 每 10 秒独立续租，TTL 60 秒；不依赖 SSE、恢复镜像、工具输出或浏览器在线。
3. 准备会话及消息；交互续跑复用原 AI 消息，仅刷新 Mongo 活动时间和未读信息。准备失败直接释放 lease。
4. 执行并保存结果、完成流缓存收尾，入口 finally 释放 lease。业务只拿到释放函数，不透传 runnerId。
5. 内部 token 仅用于原子续租和释放，释放幂等；失败由 TTL 回收，不覆盖业务结果。lease 值同时携带已有的 AI 消息 ID；交互续跑的最终 ID 在持锁后读取，因此仅标记恢复时复用最新 AI，不采用请求传入的新 ID。业务入口仍只持有释放回调。

logical key：

```text
chat:generation:lease:{sourceType}:{sourceId}:{chatId}
```

Mongo ObjectId 形式的 sourceId 统一为小写，保证大小写等价的资源参数使用同一 key。chatId 保持原值。

## 停止信号与迟到获取

- 每次写入 stop 都使用不同版本，TTL 仍为 60 秒；读取只检查 key 是否存在，兼容历史值 `1`。
- 获取 lease 的 Lua 只返回获取时的旧 stop 快照。调用方收到成功结果后，才通过比较值的 Lua 清理该旧版本；新写入的 stop 版本不同，不会被迟到清理删除。
- 获取超时后可能继续执行的 Lua 不删除 stop；其迟到响应不会启动旧 stop 清理。清理自身失败时只记录日志，保留已确认的 lease；停止控制器继续保留准备阶段收到的停止请求。
- Workflow、Helper 和 Builder 共用停止控制器，首次读取、串行轮询并锁存停止状态，在请求结束时清理。停止标记版本只用于比较清理，生成入口仍只返回 lease 释放回调。

## 批量查询与轮询

`getChatGenerationStatuses({ sourceType, sourceId, chatIds, fallbackOnError = true })` 是共享读取入口，返回 `Map<chatId, ChatGenerateStatusEnum>`。

- 去重后通过 DAL `getTokens` → adapter `getMany` 执行一次 MGET，保持 key 与返回值对应。
- 空列表不访问 Redis。仅读到非空 lease 时为运行中，缺失为空闲。返回值类型/长度不正确、读取失败或超时时，默认记录日志并返回空闲；`fallbackOnError: false` 向上抛错。
- 调用方先完成资源和会话权限过滤，列表及轮询仅查询 Mongo 过滤后实际可见的会话，不直接使用未经会话权限过滤的请求 chatIds。
- 历史列表、普通/外链初始化、恢复接口和停止响应使用默认回退；状态轮询接口显式传入 `fallbackOnError: false`，避免把读取未知当作空闲。
- Mongo 查询仍提供标题、hasBeenRead、updateTime 等信息；增加的是一次 Redis 批量读取，不是逐条网络往返。

侧栏在存在运行中会话或请求失败需要重试时，每 5 秒轮询；隐藏标签页暂停定时请求，切回可见时单次刷新。前端 `getChatHistoryStatus` 对长列表去重，每批最多 200 个 chatId，顺序读取后合并；任一批失败时静默保留整轮原状态和所有元数据，不提交部分结果。初始全空闲的列表请求失败后也会继续重试，成功确认全空闲后停止定时器。上一轮尚未完成时跳过新轮询，切换页面或卸载后忽略迟到响应（包括错误响应）。

## 进程退出与恢复连接

- 生成进程退出后停止续租，lease 在最后一次成功续租后最多 60 秒过期，状态查询直接返回空闲。
- 删除 Mongo 残留状态清理服务、App/Pro 定时任务及其 timerId，不再等待每 2 分钟扫描纠正 Mongo。
- 恢复接口在进入时检查 lease；空闲则返回持久化记录，不进入实时等待。
- 已建立的恢复连接每次 Redis Stream 阻塞读取超时后检查 lease；空闲则结束阻塞读取，由接口补充持久化记录与 done 事件，避免缺少终止事件时永久等待。
- lease 读取失败或超时由共享函数记录日志并返回空闲；列表、初始化和恢复统一消费这一结果，已建立的恢复连接在下一次空阻塞读取检查后结束等待。
- mirror 仍由接口能力与 `x-fastgpt-stream-resume` 请求头主动开启，执行端独立保活；其 TTL 与生成 lease 相互独立。

## Mongo 兼容与索引

旧数据中的状态字段不再被消费，不执行全表 unset。原 `chatGenerateStatus_1_updateTime_1` partial 索引由 FastGPT 明确创建，已在 ChatSchema 通过 `defineIndex(..., deprecated: true)` 登记，并覆盖实际清理行为；不删除其他未声明的客户索引。

## 被拦截发送的恢复

- 同会话已有生成 A 时，发送 B 在任何消息写入前被拒绝；Lua 原子返回占用快照，服务端将 A 的恢复信息放入 `chatIsGenerating` 错误的 `data`，JSON 和 SSE 均保留该信息。明确占用的业务错误不进入 Redis 获取异常的放行分支。
- 客户端撤销 B 的 Human/AI 乐观占位，将 B 的文字和附件按原草稿版本规则回填输入框，再刷新历史并恢复 A。恢复失败也不应把 B 当作已发送消息；用户在等待期间编辑或切换会话时，继续沿用现有草稿保护。
- 普通新轮按服务端 `responseChatItemId` 等待记录可见；A 已在页面中且被本地标为结束时，也接受相同 ID，不再等待不存在的 B。A 在恢复前已经结束时，由恢复接口返回持久化结果。
- 交互续跑的 lease 返回 `reusePreviousAi=true`，刷新后允许复用最新 AI；旧格式 lease/错误无恢复信息时，保留此前按旧 AI ID 变化判断的兼容路径。
- 获取异常降级放行、读取异常降级空闲及失租后的跨轮写入边界保持原约定；本次仅补齐被明确拦截后的恢复目标。

## 边界与发布

lease 过期不代表历史生成成功；本次会话运行状态只表达忙/闲。默认读取策略在未读到有效 lease 或读取异常时返回空闲，轮询接口异常时则保留客户端上次状态并重试。生成入口获取 lease 异常时优先保证可执行性并降级放行，此时无法保证故障期间同会话互斥或依靠 lease 准确追踪该次执行。保留已约定的简化边界：不提供失租后旧进程迟到写入的跨轮隔离，也不向工具链传播失租取消信号。

所有持久化生成入口继续持有 lease：v1/v2、chatTest、Skill Debug、OutLink、MCP、定时触发，以及 Pro ChatHome、ChatAgentHelper、Workflow Builder。混合版本发布前需停止旧版本接收新请求并等待其生成任务收尾，确保生成与状态读取均切换到新协议。不修改部署 YAML。

## 验证与任务

- [x] 拦截 B 不新增 Mongo 消息，JSON/SSE/客户端错误传递保留恢复目标；B 文字及附件回填后恢复已加载的 A，覆盖实时、已经结束、交互续跑及 placeholder 尚未可见的场景。
- [x] 批量读取、去重、空列表、资源隔离、ObjectId 大小写、过期与 Redis 异常。
- [x] 列表及轮询使用实时 lease，忽略 Mongo 历史值，并过滤未授权会话。
- [x] 长列表分批、轮询不重叠、卸载后忽略迟到响应。
- [x] 严格状态轮询的错误和超时上抛，前端保留 busy/idle 快照并在恢复后自动更新。
- [x] 超时获取及超时清理的迟到副作用均保留新 stop；源码 Lua 在真实 Redis 验证旧值清理、竞争、空快照及上述时序。
- [x] 恢复连接无终止事件且 lease 失效或读取失败时按空闲结束等待。
- [x] 生成准备失败释放、旧 Mongo generating 字段不再阻止新生成，各入口正确收尾。
- [x] 旧 Mongo 索引清理覆盖，移除相关 cron 与 error 状态消费。
- [x] 最终获取/读取异常降级策略及时间参数的 60 项相关局部测试通过；变更文件 lint、App/Service 类型检查通过。
- [x] DEV 的 67 项验收逐项完成，包含真实 API、浏览器轮询与恢复、双实例互斥、进程退出、Redis 故障、Mongo 保存失败和索引清理。
