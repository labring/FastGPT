# 流响应恢复实施方案

## 摘要

目标是在当前 FastGPT 聊天链路中增加“流响应恢复”能力，解决页面刷新、网络抖动、SSE 中断后无法续接正在生成中的回复的问题。

这版方案已经收敛为“按 chat 共享恢复状态”的模型，不引入 `clientId`，也不做 per-client 游标管理。

本期方案边界：

- 同一个 `chatId` 只有一份共享的恢复状态
- 不区分标签页、窗口、设备之间谁先看到、谁后看到
- 恢复的目标是“恢复这条对话当前的生成状态”，不是“重放某个页面实例错过的全部中间事件”
- Redis 负责进行态缓存和短期恢复，Mongo 负责最终态和会话状态
- 当前 `MongoChatItem` 仍保持“生成结束后再落库”，本期不改成边生成边持久化

当前代码里的关键事实：

- 正式聊天入口是 [projects/app/src/pages/api/v2/chat/completions.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/v2/chat/completions.ts)
- 初始化接口是 [projects/app/src/pages/api/core/chat/init.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/core/chat/init.ts)
- 历史消息接口是 [projects/app/src/pages/api/core/chat/record/getRecords_v2.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/core/chat/record/getRecords_v2.ts)
- 最终聊天落库逻辑在 [packages/service/core/chat/saveChat.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/core/chat/saveChat.ts)
- 前端流式消费在 [projects/app/src/web/common/api/fetch.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/common/api/fetch.ts)
- 前端聊天中间态维护在 [projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx)
- 当前 `chatId` 已经按 tab 维度存储在 [projects/app/src/web/core/chat/context/useChatStore.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/core/chat/context/useChatStore.ts)

## 设计结论

### 恢复对象与恢复范围

恢复的不是“某个页面实例错过了哪些 seq”，而是“这条 chat 当前整体生成到了什么状态”。

语义定义：

- 一个 `chatId` 对应一条正在生成的流
- 同一个 `chatId` 只有一份共享恢复状态
- 不再区分不同标签页各自的恢复进度
- 页面刷新后恢复的是“当前 chat 的直播画面”
- 新开窗口看到的也是“当前 chat 的直播画面”
- 不保证每个窗口都能补到自己错过的每一个中间事件

这个语义下：

- 不需要 `clientId`
- 不需要 per-client `last_seq`
- 不需要 ACK 接口
- 不需要 consumer group

### 为什么可以不需要 clientId

如果产品上接受下面这句话，那 `clientId` 就不是必须的：

> 同一个 `chatId` 的恢复进度是共享的，我们关心的是这条对话现在整体恢复到哪，而不是某个具体标签页看到哪。

这样做的代价是：

- 某个慢标签页刷新后，可能不会补到它自己没看到的每一个历史中间事件
- 但它会恢复到当前这条 chat 的最新聚合状态

这样做的收益是：

- 方案明显更简单
- 不需要服务端保存多份游标
- 不会有多标签页互相覆盖 `last_seq` 的问题，因为压根不再存在 per-client 游标
- 前后端状态模型更接近“直播画面恢复”，而不是“断点续传”

### 恢复模型改为“状态恢复 + 后续追流”

这版不把恢复设计成“从某个游标开始补事件”，而是设计成两段：

1. 恢复当前聚合状态
2. 接上后续新增流事件

也就是说，`/resume` 首先返回：

- 当前已经拼好的回答文本
- 当前 reasoning
- 当前 tool / step / interactive 状态
- 当前 `responseChatItemId`
- 当前 `chatStatus`

如果这条 chat 还在生成中，再继续接后续新增事件。

这样更符合“按 chat 共享恢复状态”的产品语义。

## 数据模型与 Redis 结构

### MongoChat 增加进行态字段

文件：

- [packages/service/core/chat/chatSchema.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/core/chat/chatSchema.ts)
- 对应全局 chat type/schema 文件也要同步补类型

新增字段建议：

- `chatStatus: 'generating' | 'done' | 'error'`
- `currentResponseChatItemId?: string`
- `streamLastSeq?: number`
- `hasUnreadResponse?: boolean`
- `lastStreamAt?: Date`
- `streamError?: string`

字段语义：

- `chatStatus`
  用于初始化接口、历史接口、前端 UI 判断当前 chat 是否仍在生成中
- `currentResponseChatItemId`
  用于把当前未完成的生成轮次绑定到前端占位 AI 消息
- `streamLastSeq`
  记录当前共享流已经推进到的最新 seq，主要用于观测和恢复衔接
- `hasUnreadResponse`
  仅在生成结束后才有意义
- `lastStreamAt`
  用于判断生成中但 Redis 已过期时是否可视为中断态
- `streamError`
  用于记录异常中止原因

状态约束：

- 开始生成前就 upsert `MongoChat`
- 进入流式生成时设为 `generating`
- 正常完成设为 `done`
- 异常结束设为 `error`
- Redis 丢失但 chat 仍是 `generating` 时，需要服务端修正状态

### Redis 结构

建议新增服务模块：

- `packages/service/core/chat/streamRecovery.ts`
- 或拆成 `streamRecovery/keys.ts`
- `streamRecovery/stream.ts`
- `streamRecovery/state.ts`
- `streamRecovery/types.ts`

Redis key 设计：

- Stream Key: `chat:stream:{tmbId}:{chatId}`
- State Key: `chat:state:{tmbId}:{chatId}`

说明：

- 一个 chat 一条 Stream
- 一个 chat 一份聚合状态
- Stream 负责短期回放和追流
- State 负责页面刷新后的当前状态恢复

### Stream event 结构

每条 Redis Stream event 至少包含：

- `seq`
- `event`
- `data`
- `chatId`
- `chatItemId`
- `createdAt`

按现有前端消费事件，建议扩展支持：

- `responseValueId`
- `stepId`
- `finishReason`
- `error`

事件类型建议覆盖：

- `answer_chunk`
- `fast_answer_chunk`
- `flow_node_response`
- `flow_node_status`
- `tool_call`
- `tool_params`
- `tool_response`
- `interactive`
- `plan`
- `step_title`
- `update_variables`
- `workflow_duration`
- `done`
- `error`

说明：

- 不要求 Redis 事件名字和前端 `SseResponseEventEnum` 完全同名
- 但恢复接口输出给前端时，必须能无损映射回现有 `generatingMessage` 消费结构

### State key 结构

`chat:state:{tmbId}:{chatId}` 负责保存当前聚合状态，建议至少包含：

- `chatStatus`
- `lastSeq`
- `responseChatItemId`
- `responseText`
- `reasoningText`
- `responseValues`
- `toolState`
- `interactiveState`
- `responseData`
- `durationSeconds`
- `updatedAt`
- `error`

说明：

- `responseText` / `reasoningText` 用于快速恢复最主要的 UI
- `responseValues` 用于保留更完整的消息结构，避免只恢复纯文本
- `toolState` / `interactiveState` 用于恢复工具调用和交互节点状态
- `responseData` 用于恢复引用、节点响应等展示数据

V1 可以优先保证：

- 文本
- reasoning
- tool / interactive
- responseData
- done / error 状态

如果某些细枝末节暂时不放进聚合状态，也要保证不会影响最终 UI 的主流程。

### TTL 策略

本期不把 `MAXLEN` 作为正确性保证。

原因：

- 当前系统不限制模型输出长度
- 如果用小 `MAXLEN`，可能直接截断还未落库的重要流内容
- `MAXLEN` 最多只能做保险丝，不能做核心恢复保证

采用滑动 TTL：

- 第一次写 Stream 或 State 时设置 `activeTtl`
- 每次写 Stream event 时刷新 `activeTtl`
- 每次更新 State 时刷新 `activeTtl`
- 写入 `done/error` 后，把 Stream TTL 和 State TTL 缩短为 `finalTtl`

建议默认值：

- `activeTtl = 1800s`
- `finalTtl = 300s`

这样即便服务崩溃、进程重启、收尾逻辑没跑到：

- 没有新的 `XADD`
- 没有新的 State 更新
- TTL 会自然倒计时回收
- 不会永久驻留 Redis

## 服务端改造

### 主聊天入口改造

主文件：

- [projects/app/src/pages/api/v2/chat/completions.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/v2/chat/completions.ts)

行为改造：

- 在 `dispatchWorkFlow` 之前，先初始化 chat 进行态
- 生成 `saveChatId`
- upsert `MongoChat`
- 设置 `chatStatus=generating`
- 设置 `currentResponseChatItemId`
- 设置 `lastStreamAt`
- 清理上轮遗留的 `streamError`

新增前置步骤建议封装成函数：

- `initGeneratingChatState(...)`

该函数职责：

- 确保 chat 文档在生成开始前存在
- 不依赖最终 `pushChatRecords`
- 让刷新后初始化接口能拿到这轮未完成 chat 的状态

### 包装 SSE 写出逻辑

当前 SSE 输出是通过 [packages/service/core/workflow/dispatch/utils.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/core/workflow/dispatch/utils.ts) 里的 `getWorkflowResponseWrite` 完成的。

需要新增一层包装，例如：

- `getRecoverableWorkflowResponseWrite`

职责：

- 保留原有 SSE 输出行为
- 同时把可恢复事件写入 Redis Stream
- 同时更新当前 chat 的聚合 State
- 维护当前生成轮次的 `seq`
- 每次写事件后刷新 Stream 和 State TTL
- 更新 `MongoChat.lastStreamAt`
- 只记录前端真正需要恢复的事件，不记录纯内部状态

落点：

- 不直接改散落逻辑
- 在 `v2/chat/completions.ts` 里替换 `workflowResponseWrite` 的创建方式
- 让 `dispatchWorkFlow` 无感知

### 聚合 State 的更新规则

每次流式事件写出时，同时更新 State：

- `answer_chunk`
  追加到 `responseText` 或对应 `responseValues`
- `fast_answer_chunk`
  追加到 `responseText` 或对应 `responseValues`
- `reasoning`
  追加到 `reasoningText`
- `tool_call/tool_params/tool_response`
  更新对应工具状态
- `interactive`
  更新当前交互状态
- `flow_node_response`
  追加到 `responseData`
- `workflow_duration`
  更新 `durationSeconds`
- `done`
  更新 `chatStatus=done`
- `error`
  更新 `chatStatus=error`

State 的目标不是保存所有实现细节，而是保证页面刷新后能恢复到“用户眼里当前应该看到的画面”。

### 正常完成后的状态收口

在 [projects/app/src/pages/api/v2/chat/completions.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/v2/chat/completions.ts) 的成功路径中，收尾顺序要固定：

1. 写最后一个 `done` Stream event
2. 更新 State 为 `done`
3. 缩短 Stream 和 State TTL
4. 更新 `MongoChat.chatStatus = done`
5. 更新 `streamLastSeq`
6. 继续执行现有 `pushChatRecords` 或 `updateInteractiveChat`
7. `currentResponseChatItemId` 可保留为最近一次进行态痕迹，也可在最终态稳定后清空，但文档里要统一口径

重点：

- 不能先 `pushChatRecords` 再补 `done`
- `done` 是恢复协议的一部分，不只是前端动画结束信号

### 异常结束路径

在 `catch` 路径里增加异常收口逻辑：

- 尽量写一条 `error` Stream event
- 更新 State 为 `error`
- 更新 `MongoChat.chatStatus = error`
- 写 `streamError`
- 缩短 Stream 和 State TTL
- 返回现有 SSE error 给前端

注意：

- 如果进程直接 crash，`catch` 跑不到
- 这种情况依赖 TTL 自动清理
- 所以初始化接口和恢复接口必须识别“DB 还在 generating，但 Redis 已不存在”的不一致状态

### 新增 Resume 接口

新增 API：

- `projects/app/src/pages/api/core/chat/resume.ts`

新增 schema：

- [packages/global/openapi/core/chat/controler/api.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/global/openapi/core/chat/controler/api.ts)

请求字段：

- `appId`
- `chatId`

响应方式：

- SSE

处理流程固定为两段：

1. 恢复当前聚合状态
2. Subscribe 后续新增事件

具体流程：

1. 鉴权
2. 查询 `MongoChat`
3. 如果 `chatStatus !== generating`
   返回一个终态事件，前端停止恢复，直接用 DB 历史
4. 如果 `chatStatus === generating`
   读取 `stateKey`
5. 把当前聚合状态一次性输出给前端
6. 读取 `streamLastSeq`
7. 如有必要，读取 `streamKey` 中 `seq > streamLastSeq` 的尾部事件做补齐
8. 获取当前边界 Stream ID
9. 用 `XREAD BLOCK` 短阻塞订阅边界之后的新事件
10. 收到 `done/error` 后结束 SSE

为什么不用 consumer group：

- 这里是共享状态恢复，不是消费者分摊任务
- 多个前端看到的是同一份共享状态
- consumer group 语义不匹配

为什么不再需要前端传 `last_seq`：

- 当前方案不再按客户端游标恢复
- 恢复依据是 chat 级别的共享 State
- 前端只要知道“这条对话现在整体处于什么状态”

### 初始化接口补状态

需要改造 [projects/app/src/pages/api/core/chat/init.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/core/chat/init.ts)

返回值新增：

- `chatStatus`
- `currentResponseChatItemId`
- `streamRecoverable`

作用：

- 前端进入 chat 页面时先知道这轮 chat 是不是仍在生成
- 前端决定是否自动发起 `/resume`
- 如果 Redis 已过期但 DB 还显示 `generating`，这里可以顺带做状态修正

建议策略：

- 如果 `chatStatus=generating` 且 Redis Stream 或 State 不存在
  - 服务端直接修正为 `error`
  - 返回 `streamRecoverable=false`

## 前端改造

### 不再维护 clientId

主文件：

- [projects/app/src/web/core/chat/context/useChatStore.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/core/chat/context/useChatStore.ts)

结论：

- 不新增 `clientId`
- 不新增 `last_seq`
- 不新增 tab 级恢复游标存储

当前 `chatId` 的 tab 级存储继续保留，但它只负责标识“当前打开的是哪条 chat”，不再承担恢复游标职责。

### streamFetch 不增加恢复身份字段

主文件：

- [projects/app/src/web/common/api/fetch.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/common/api/fetch.ts)
- [projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx)
- [projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx)

发送聊天请求时，不增加 `clientId`，保持请求体简洁。

这轮方案里，恢复身份就是 `chatId` 本身。

### 新增恢复控制 hook

建议新增：

- `projects/app/src/web/core/chat/hooks/useStreamRecovery.ts`

职责：

- 调用 `/resume`
- 读取恢复返回的聚合状态
- 把恢复状态映射成 `ChatBox` 可直接消费的结构
- 在 chat 仍处于 generating 时接续后续新增事件

与上一版不同的是，这个 hook 不再负责：

- 生成 `clientId`
- 持久化 `last_seq`
- 发送 ACK

它只负责“恢复当前直播画面”。

### ChatBox 接恢复

主文件：

- [projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx)

需要补的逻辑：

- 支持“用聚合状态恢复最后一条 AI 消息”
- 恢复中的 AI 消息要能和 `currentResponseChatItemId` 对齐
- 如果历史中不存在该 AI 消息，就插入一个占位 AI item
- 如果存在，就直接替换为恢复后的聚合内容
- 如果 `/resume` 继续返回后续流事件，再按现有 `generatingMessage` 逻辑往下续写

状态规则：

- 初始化恢复前，若 chat 仍在生成中，尾部 AI item 设为 `loading`
- 恢复到聚合内容后设为 `running`
- 收到 `done/error` 后设为 `finish`

重要约束：

- 恢复不能重新追加一条新的 Human 消息
- 恢复也不能重新生成一个新的 `responseChatItemId`
- 必须复用当前生成轮次的 `currentResponseChatItemId`

### 记录列表上下文补恢复态

主文件：

- [projects/app/src/web/core/chat/context/chatRecordContext.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/core/chat/context/chatRecordContext.tsx)
- [projects/app/src/components/core/chat/ChatContainer/ChatBox/Provider.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/Provider.tsx)

当前 `chatRecords` 从 DB 拉下后统一映射成 `finish`。

需要改造为：

- 如果 `init` 返回 `chatStatus=generating`
- 并且命中了 `currentResponseChatItemId`
- 则把最后一条对应 AI item 状态设为 `loading`
- `isChatting` 逻辑可继续沿用“最后一条非 finish 即 chatting”

### 初始化时自动恢复

主文件：

- [projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx)
- [projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx)
- [projects/app/src/web/core/chat/api.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/core/chat/api.ts)

初始化流程要改成：

1. `getInitChatInfo`
2. `getChatRecords`
3. 如果 `chatStatus=generating`
4. 发起 `/core/chat/resume`
5. 将恢复到的聚合状态写回当前 UI
6. 若 `/resume` 继续返回新增流事件，再续写当前 UI

降级逻辑：

- `chatStatus !== generating`
  不调 resume
- `streamRecoverable=false`
  不调 resume
- resume 失败
  显示 toast，保留 DB 历史，不无限重试

## 涉及文件清单

核心会修改的文件建议优先级如下。

后端主链路：

- [projects/app/src/pages/api/v2/chat/completions.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/v2/chat/completions.ts)
- [projects/app/src/pages/api/core/chat/init.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/core/chat/init.ts)
- [projects/app/src/pages/api/core/chat/record/getRecords_v2.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pages/api/core/chat/record/getRecords_v2.ts)
- `projects/app/src/pages/api/core/chat/resume.ts`

后端 service / schema：

- [packages/service/core/chat/chatSchema.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/core/chat/chatSchema.ts)
- [packages/service/core/chat/saveChat.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/core/chat/saveChat.ts)
- [packages/service/core/workflow/dispatch/utils.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/core/workflow/dispatch/utils.ts)
- `packages/service/core/chat/streamRecovery.ts`
- [packages/service/common/redis/index.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/service/common/redis/index.ts)

前端主链路：

- [projects/app/src/web/common/api/fetch.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/common/api/fetch.ts)
- [projects/app/src/web/core/chat/api.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/core/chat/api.ts)
- [projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx)
- [projects/app/src/web/core/chat/context/chatRecordContext.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/web/core/chat/context/chatRecordContext.tsx)
- [projects/app/src/components/core/chat/ChatContainer/ChatBox/Provider.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/Provider.tsx)
- [projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx)
- [projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx)
- `projects/app/src/web/core/chat/hooks/useStreamRecovery.ts`

协议与类型：

- [packages/global/openapi/core/chat/controler/api.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/packages/global/openapi/core/chat/controler/api.ts)
- [projects/app/src/components/core/chat/ChatContainer/type.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/type.ts)
- [projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts](/Users/chuanhu9/projects/fastgpt-pro/FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts)

## 测试方案

### 后端测试

建议新增：

- `projects/app/test/pages/api/core/chat/resume.test.ts`
- `projects/app/test/pages/api/core/chat/init.test.ts`
- `projects/app/test/pages/api/v2/chat/completions.test.ts`
- `test/cases/service/core/chat/streamRecovery.test.ts`

覆盖场景：

- 开始生成时提前创建 `MongoChat` 壳
- 生成中 `chatStatus=generating`
- 正常完成后写入 `done` 并更新为 `done`
- 异常时写入 `error` 并更新为 `error`
- Stream 首次写入即带 TTL
- State 首次写入即带 TTL
- 活跃写入会刷新 TTL
- `/resume` 能恢复当前聚合状态
- `/resume` 在 generating 状态下能继续接后续事件
- Redis 不存在但 DB 仍是 generating 时会修正状态

### 前端测试

建议新增或扩展：

- `projects/app/test/web/core/chat/hooks/useStreamRecovery.test.ts`
- 必要时新增 `ChatBox` 恢复行为测试

覆盖场景：

- 恢复时不会重复插入 Human 消息
- 恢复时 AI 占位消息能正确被聚合状态覆盖
- 收到 `done/error` 后状态切为 `finish`
- resume 失败时 UI 仍保留历史记录
- 新窗口或刷新页面时，看到的是同一份共享 chat 状态

## 默认实现选择

本方案已经固定以下默认决策，实施阶段不再重新讨论：

- 不引入 `clientId`
- 不维护 per-client `last_seq`
- 同一个 `chatId` 只有一份共享恢复状态
- 恢复目标是“恢复当前对话状态”，不是“重放某个页面实例错过的每个事件”
- Redis Stream 用于进行态回放和追流，不是长期可靠日志
- Redis State 用于当前聚合状态恢复
- TTL 是主回收手段
- `MAXLEN` 不作为正确性前提
- 不使用 consumer group
- 不把 `MongoChatItem` 改成边生成边落库

## 风险与注意事项

- 如果不在生成开始前创建 `MongoChat`，刷新后初始化接口仍拿不到这轮会话的进行态
- 如果 Stream 只在 `done` 时才设 TTL，异常退出会产生残留 key
- 如果 State 没有和 Stream 同步更新，刷新后会恢复到错误的中间状态
- 如果前端恢复时重新创建新的 `responseChatItemId`，会导致 UI 重复消息和服务端状态错位
- 如果恢复事件不能映射回现有 `generatingMessage`，就会造成恢复链路和实时链路两套渲染逻辑，后续维护成本会很高
- 由于不做 per-client 精确游标，慢标签页刷新后不保证补到它错过的每个中间事件，这个语义需要在产品上明确接受

## Review 重点

review 时建议重点看这几个问题：

- `MongoChat` 的进行态字段够不够，是否需要再加一个 `interrupted`
- `currentResponseChatItemId` 是否要长期保留，还是结束后清空
- `resume` 是否接受“先回当前状态，再短阻塞追流”的 V1 实现
- `State key` 里哪些字段是必须恢复的，哪些可以先不做
- `streamLastSeq` 是否只作观测，还是要参与恢复衔接
