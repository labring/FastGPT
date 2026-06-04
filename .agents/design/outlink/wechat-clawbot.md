# 微信个人号(ClawBot) - 设计文档

## 1. 架构概览

```
┌──────────────────── BullMQ ────────────────────────────┐
│                                                         │
│  Queue: wechatPoll                                      │
│  ┌──────┐   ┌──────┐   ┌──────┐                       │
│  │ poll │   │ poll │   │ poll │   ...                   │
│  │ ch_1 │   │ ch_2 │   │ ch_3 │                        │
│  └──┬───┘   └──┬───┘   └──┬───┘                       │
│     │          │          │                             │
│     └──────────┴──────────┘                             │
│                │                                        │
│         Worker (concurrency: 10)                        │
│                │                                        │
│     ┌──────────┴──────────┐                             │
│     │  1. getUpdates()    │                             │
│     │  2. 按用户分组合并   │                             │
│     │  3. outlinkInvokeChat│                            │
│     │  4. sendMessage()   │                             │
│     │  5. 更新 buf        │                             │
│     │  6. 自链: queue.add │  ←── 完成后立刻创建下一个    │
│     └─────────────────────┘                             │
│                                                         │
└─────────────────────────────────────────────────────────┘

多节点部署:
  Node A ──┐
  Node B ──┼── 同一个 Redis ── 同一个 Queue
  Node C ──┘    BullMQ 自动保证同一个 Job 只被一个 Worker 消费
```

## 2. 核心流程

### 2.1 Job 生命周期

```
渠道上线（扫码登录成功）
    │
    ▼
queue.add('poll', { shareId }, { jobId: `wechat-poll-${shareId}-${ts}` })
    │
    ▼
Worker 消费 Job
    │
    ├── 1. 从数据库读取 buf 和 token
    ├── 2. 检查渠道状态（离线 → 不续链，轮询自然停止）
    ├── 3. 调用 ilink getUpdates(buf)（长轮询，最多 35 秒）
    ├── 4. 收到消息 → groupMessagesByUser → 合并文本
    ├── 5. 对每组调用 outlinkInvokeChat → sendMessage 回复
    ├── 6. 更新 buf 到数据库
    └── 7. 自链: queue.add 创建下一个 Job
```

### 2.2 渠道上下线控制

```
上线: 扫码成功 → status='online' → queue.add(首个 Job)
下线: 用户登出/删除 → status='offline' → Worker 检测后不续链
异常: 连续失败 ≥5 次 → status='error' → 不续链
重连: 用户重新扫码 → 清空 syncBuf → 同上线流程
```

## 3. 类型定义

### 3.1 WechatAppType

```typescript
// packages/global/support/outLink/type.ts
export const WechatAppSchema = z.object({
  token: z.string().default(''),
  baseUrl: z.string().default('https://ilinkai.weixin.qq.com'),
  accountId: z.string().default(''),
  userId: z.string().optional(),
  syncBuf: z.string().default(''),
  status: z.enum(['online', 'offline', 'error']).default('offline'),
  loginTime: z.string().optional(),
  lastError: z.string().optional()
});
export type WechatAppType = z.infer<typeof WechatAppSchema>;
```

### 3.2 BullMQ Job 数据

```typescript
// packages/service/support/outLink/wechat/type.ts
export type WechatPollJobData = { shareId: string };
```

## 4. 关键设计决策

### 4.1 为什么用自链式而不是 Repeatable

| | Repeatable | 自链式 |
|--|-----------|--------|
| 消息延迟 | 固定间隔（如 30s） | 实时（ilink 长轮询） |
| Job 重叠 | 会（定时无脑创建） | 不会（处理完才创建下一个） |
| 停止方式 | 需要删除 repeatable key | 不续链即可，天然停止 |
| 多节点安全 | BullMQ 保证 | BullMQ 保证 |

### 4.2 Worker 参数

| 参数 | 值 | 说明 |
|------|-----|------|
| concurrency | 10 | 单实例同时处理 10 个渠道（I/O 密集，不占 CPU） |
| lockDuration | 120s | getUpdates 35s + 工作流 60s + sendMessage = ~100s，留余量 |
| stalledInterval | 60s | 检测 stalled Job |
| removeOnComplete | count: 0 | 完成即删 |
| removeOnFail | count: 100, age: 7d | 保留最近 100 条失败记录 |

### 4.3 错误处理策略

| 错误类型 | 处理 |
|---------|------|
| 网络超时 | 正常（getUpdates 35s 超时），续链 |
| API 返回错误 | 记录失败计数，延迟 10s 续链 |
| 连续失败 ≥ 5 次 | 标记 status='error'，停止续链 |
| 渠道被删除 | outLink 查不到，不续链 |
| 工作流处理失败 | 发送 defaultResponse 给用户，续链继续 |

### 4.4 重连时 buf 清空

重连时清空 `syncBuf` 是正确的。新 token 对应新 session，旧 buf 在 ilink 服务端已失效。清空后首次 getUpdates 会返回新的 buf。

## 5. 数据库索引

```typescript
// packages/service/support/outLink/schema.ts
OutLinkSchemaType.index({ shareId: -1 });
OutLinkSchemaType.index({ teamId: 1, tmbId: 1, appId: 1 });
// 条件索引: 仅索引 wechat online 渠道，用于服务重启恢复
OutLinkSchemaType.index(
  { type: 1, 'app.status': 1 },
  { partialFilterExpression: { type: 'wechat', 'app.status': 'online' } }
);
```

## 6. Redis Key 清单

| Key | 用途 | TTL |
|-----|------|-----|
| `publish:wechat:qrcode:${shareId}` | 二维码临时存储 | 480s |
| `publish:wechat:failures:${shareId}` | 连续失败计数 | 300s |

## 7. 文件清单

### 修改现有文件

| 文件 | 改动 |
|------|------|
| `packages/global/support/outLink/constant.ts` | `PublishChannelEnum` 新增 `wechat` |
| `packages/global/support/outLink/type.ts` | 新增 `WechatAppSchema` / `WechatAppType` |
| `packages/global/core/chat/constants.ts` | `ChatSourceEnum` / `ChatSourceMap` 新增 wechat |
| `packages/global/support/wallet/usage/constants.ts` | `UsageSourceEnum` / `UsageSourceMap` 新增 wechat |
| `packages/global/support/wallet/usage/tools.ts` | `getUsageSourceByPublishChannel` 新增 case |
| `packages/global/core/chat/utils.ts` | `getChatSourceByPublishChannel` 新增 case |
| `packages/web/i18n/zh-CN/publish.json` | wechat 相关 i18n |
| `packages/web/i18n/en/publish.json` | wechat 相关 i18n |
| `packages/web/i18n/zh-Hant/publish.json` | wechat 相关 i18n |
| `packages/service/common/bullmq/index.ts` | `QueueNames` 新增 `wechatPoll` |
| `packages/service/support/outLink/schema.ts` | 新增条件索引 |
| `projects/app/src/pageComponents/app/detail/Publish/index.tsx` | 注册 wechat 渠道入口 |
| `projects/app/src/service/common/bullmq/index.ts` | 注册 `initWechatPollWorker` + `resumeAllWechatPolling` |

### 新建文件

| 文件 | 说明 |
|------|------|
| `projects/app/src/pageComponents/app/detail/Publish/Wechat/index.tsx` | 渠道列表（含状态、扫码登录入口） |
| `projects/app/src/pageComponents/app/detail/Publish/Wechat/WechatEditModal.tsx` | 创建/编辑弹窗（name + maxUsagePoints） |
| `projects/app/src/pageComponents/app/detail/Publish/Wechat/QRLoginModal.tsx` | 扫码登录弹窗（二维码展示 + 状态轮询） |
| `packages/service/support/outLink/wechat/ilinkClient.ts` | ilink API 客户端（QR 登录 + 消息收发） |
| `packages/service/support/outLink/wechat/type.ts` | `WechatPollJobData` 类型 |
| `packages/service/support/outLink/wechat/messageParser.ts` | 消息解析纯函数（extractTextFromItem + groupMessagesByUser） |
| `packages/service/support/outLink/wechat/mq.ts` | BullMQ Worker + 轮询调度 |
| `projects/app/src/pages/api/support/outLink/wechat/qrcode/generate.ts` | 二维码生成 API |
| `projects/app/src/pages/api/support/outLink/wechat/qrcode/status.ts` | 扫码状态查询 API（confirmed 时保存 token + 启动轮询） |
| `projects/app/src/pages/api/support/outLink/wechat/logout.ts` | 登出 API（status → offline，清空 token） |
| `test/cases/service/support/outLink/wechat/messageParser.test.ts` | 消息解析单元测试（16 cases） |
