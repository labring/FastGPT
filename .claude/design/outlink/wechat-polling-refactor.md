# 微信机器人轮询链路改造方案

## 背景

线上现象：微信机器人有时消息要 10+ 分钟才回复。

## 根因

`packages/service/support/outLink/wechat/mq.ts` 当前实现把"拉取消息"和"调用 agent 回复"放在**同一个 BullMQ job 里串行执行**，而且续链 `scheduleNextPoll` 放在回复发送之后：

```ts
// 当前流程（串行）
Poll Job:
  getUpdates                           // ~0-35s 长轮询
  → outlinkInvokeChat (slow LLM)       // ~可能几分钟
  → client.sendMessage                  // ~几秒
  → scheduleNextPoll                    // ← 回复完才续链
```

后果：

1. **同一渠道同时只有 1 条流水线**。A 用户消息的 agent 回复要 5 分钟，B 用户的新消息就在 ilink 服务器缓冲区里等 5 分钟才被拉下来。
2. **`lockDuration=120s` 可能触发 stalled 误判**。回复超过 2 分钟，BullMQ 认为 job stalled，重新入队给另一个 worker —— 同一批消息被处理两次，重复回复 + `syncBuf` 被旧响应覆盖导致消息回退。
3. **续链无 singleton 保证**。`jobId` 用 `Date.now()` 每次都不同，BullMQ 无法去重。重启时 `resumeAllWechatPolling` 直接加一条，不检查 Redis 里残留的旧链 → 多条链并发轮询同一渠道，争抢 `syncBuf`。
4. **无外层超时**。agent 卡死会无限期占住该 shareId 的轮询位。

## 关于 stalled 误判说明

BullMQ 的 worker 靠 **周期性续租 lock** 保活：

```
Worker 拿到 job → Redis 给 job 打一把锁 (lockDuration 有效期)
Worker 每 lockDuration/2 续一次锁
另一个 Worker 每 stalledInterval 扫一次：锁过期的 job 视为 stalled → 重新入队
```

- **续锁依赖 Node 事件循环**。只要 job 里是正常 `await`（fetch / LLM / sendMessage），无论跑多久都不会 stalled。
- **什么时候真 stalled**：worker 进程 kill -9、OOM、CPU 密集同步代码阻塞事件循环 >lockDuration、Redis 断连续锁失败。

我们的应对：

| 机制 | 作用 |
|---|---|
| `REPLY_LOCK_MS = 30min` + `stalledInterval = 60s` | 抗住 GC/网络抖动、长回复，理论上给足余量 |
| 幂等 `replyJobId = wechat-reply:{shareId}:{lastMsgId}` | 拦住队列层的重复入队 |
| `outlinkInvokeChat` 内部按 `messageId` 幂等（由被调用方保证） | 真发生 stalled retry / attempt 重试时，保证不重复回复 |

## 目标

1. 消除 10+ 分钟消息延迟：拉取与回复解耦，回复慢不阻塞摄入
2. 消除重复回复：续链幂等、stalled retry 不产生副作用
3. 消除僵尸链：重启、重复扫码不产生并发轮询

## 改造后架构

```
Poll Queue (wechatPoll)          concurrency=20, lockDuration=60s
  getUpdates → 写 syncBuf → dispatch reply jobs → scheduleNextPoll
  ※ 每 shareId 仅 1 条链（幂等 jobId）

Reply Queue (wechatReply)        concurrency=30, lockDuration=30min
  invokeChat → sendMessage
  ※ 每 (shareId, lastMsgId) 仅 1 个 job（幂等 jobId）
```

## 改动文件清单

1. `packages/service/common/bullmq/index.ts` — 新增 `QueueNames.wechatReply`
2. `packages/service/support/outLink/wechat/type.ts` — 新增 `WechatReplyJobData`
3. `packages/service/support/outLink/wechat/messageParser.ts` — `msgIds[]` → `lastMsgId`
4. `packages/service/support/outLink/wechat/mq.ts` — 拆分 poll / reply worker

---

## 一、`packages/service/common/bullmq/index.ts`

```ts
export enum QueueNames {
  // ...existing
  wechatPoll = 'wechatPoll',
  wechatReply = 'wechatReply' // 新增
}
```

## 二、`packages/service/support/outLink/wechat/type.ts`

```ts
export type WechatPollJobData = {
  shareId: string;
};

// 新增
export type WechatReplyJobData = {
  shareId: string;
  userId: string;
  text: string;
  contextToken: string;
  lastMsgId: string;
};
```

## 三、`packages/service/support/outLink/wechat/messageParser.ts`

```ts
import type { WeixinMessage } from './ilinkClient';

const MSG_TYPE_USER = 1;
const MSG_ITEM_TEXT = 1;
const MSG_ITEM_VOICE = 3;

export type ParsedMessageGroup = {
  userId: string;
  text: string;
  contextToken: string;
  lastMsgId: string;
};

export function extractTextFromItem(item: NonNullable<WeixinMessage['item_list']>[number]): string {
  if (item.type === MSG_ITEM_TEXT && item.text_item?.text) {
    const text = item.text_item.text;
    if (item.ref_msg?.title) {
      return `[引用: ${item.ref_msg.title}]\n${text}`;
    }
    return text;
  }
  if (item.type === MSG_ITEM_VOICE && item.voice_item?.text) {
    return item.voice_item.text;
  }
  return '';
}

export function groupMessagesByUser(msgs: WeixinMessage[]): ParsedMessageGroup[] {
  const groups = new Map<string, ParsedMessageGroup>();

  for (const msg of msgs) {
    if (msg.message_type !== MSG_TYPE_USER) continue;

    let text = '';
    for (const item of msg.item_list ?? []) {
      const t = extractTextFromItem(item);
      if (t) {
        text = t;
        break;
      }
    }
    if (!text) continue;

    const userId = msg.from_user_id ?? 'unknown';
    const existing = groups.get(userId);

    if (existing) {
      existing.text += '\n' + text;
      existing.lastMsgId = msg.msgid;
      if (msg.context_token) {
        existing.contextToken = msg.context_token;
      }
    } else {
      groups.set(userId, {
        userId,
        text,
        contextToken: msg.context_token ?? '',
        lastMsgId: msg.msgid
      });
    }
  }

  return Array.from(groups.values());
}
```

## 四、`packages/service/support/outLink/wechat/mq.ts`

```ts
import { getWorker, getQueue, QueueNames, type Job } from '../../../common/bullmq';
import { getLogger, LogCategories } from '../../../common/logger';
import { ILinkClient } from './ilinkClient';
import type { WechatPollJobData, WechatReplyJobData } from './type';
import type { OutLinkSchemaType, WechatAppType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '../../../support/outLink/schema';
import { outlinkInvokeChat } from '../../../support/outLink/runtime/utils';
import { setRedisCache, getRedisCache } from '../../../common/redis/cache';
import { groupMessagesByUser } from './messageParser';
import { getErrText } from '@fastgpt/global/common/error/utils';

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECHAT);

const POLL_JOB_NAME = 'wechatPublishPoll';
const REPLY_JOB_NAME = 'wechatPublishReply';

const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_BACKOFF_MS = 10_000;
const POLL_LOCK_MS = 60_000;
const REPLY_LOCK_MS = 30 * 60_000;
const REPLY_DEDUP_TTL = 24 * 60 * 60;

/* ============ 幂等键 ============ */

const pollJobId = (shareId: string) => `wechat-poll:${shareId}`;
const replyJobId = (shareId: string, lastMsgId: string) =>
  `wechat-reply:${shareId}:${lastMsgId}`;
const replyDedupKey = (shareId: string, lastMsgId: string) =>
  `wechat:reply:done:${shareId}:${lastMsgId}`;
const failKey = (shareId: string) => `wechat:publish:failures:${shareId}`;

/* ============ Poll Worker ============ */

async function processWechatPollJob(job: Job<WechatPollJobData>): Promise<void> {
  const { shareId } = job.data;

  const outLink = (await MongoOutLink.findOne({ shareId }).lean()) as unknown as
    | OutLinkSchemaType<WechatAppType>
    | null;

  if (!outLink || !outLink.app) {
    logger.warn('OutLink not found, stop polling', { shareId });
    return;
  }

  const app = outLink.app;
  if (app.status !== 'online') {
    logger.info('Channel not online, stop polling', { shareId, status: app.status });
    return;
  }
  if (!app.token) {
    logger.warn('No token, stop polling', { shareId });
    return;
  }

  const client = new ILinkClient(app.baseUrl, app.token);

  try {
    const resp = await client.getUpdates(app.syncBuf || '');

    const isError =
      (resp.ret !== undefined && resp.ret !== 0) ||
      (resp.errcode !== undefined && resp.errcode !== 0);

    if (isError) {
      logger.error('getUpdates API error', {
        shareId,
        ret: resp.ret,
        errcode: resp.errcode,
        errmsg: resp.errmsg
      });

      const failures = Number((await getRedisCache(failKey(shareId))) ?? '0') + 1;
      await setRedisCache(failKey(shareId), String(failures), 300);

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        await MongoOutLink.updateOne(
          { shareId },
          { $set: { 'app.status': 'error', 'app.lastError': resp.errmsg || 'Too many failures' } }
        );
        logger.error('Too many failures, stop polling', { shareId, failures });
        return;
      }

      await scheduleNextPoll(shareId, FAILURE_BACKOFF_MS);
      return;
    }

    await setRedisCache(failKey(shareId), '0', 300);

    // 1) 先分发回复任务（失败则 syncBuf 不推进，下次 poll 重拉；靠幂等键去重）
    if (resp.msgs && resp.msgs.length > 0) {
      const groups = groupMessagesByUser(resp.msgs);
      logger.debug('Dispatch reply jobs', {
        shareId,
        totalMsgs: resp.msgs.length,
        userGroups: groups.length
      });

      const replyQueue = getQueue<WechatReplyJobData>(QueueNames.wechatReply);
      await Promise.all(
        groups.map((g) =>
          replyQueue.add(
            REPLY_JOB_NAME,
            {
              shareId,
              userId: g.userId,
              text: g.text,
              contextToken: g.contextToken,
              lastMsgId: g.lastMsgId
            },
            {
              jobId: replyJobId(shareId, g.lastMsgId),
              attempts: 2,
              backoff: { type: 'fixed', delay: 2000 }
            }
          )
        )
      );
    }

    // 2) 全部入队成功后再推进 syncBuf
    if (resp.get_updates_buf) {
      await MongoOutLink.updateOne(
        { shareId },
        { $set: { 'app.syncBuf': resp.get_updates_buf } }
      );
    }
  } catch (error) {
    logger.error('Poll job error', { shareId, error: String(error) });
  }

  // 3) 立即续链
  await scheduleNextPoll(shareId);
}

/* ============ Reply Worker ============ */

async function processWechatReplyJob(job: Job<WechatReplyJobData>): Promise<void> {
  const { shareId, userId, text, contextToken, lastMsgId } = job.data;

  const dedupKey = replyDedupKey(shareId, lastMsgId);
  if (await getRedisCache(dedupKey)) {
    logger.info('Reply already processed, skip', { shareId, lastMsgId });
    return;
  }

  const outLink = (await MongoOutLink.findOne({ shareId }).lean()) as unknown as
    | OutLinkSchemaType<WechatAppType>
    | null;
  if (!outLink || !outLink.app || outLink.app.status !== 'online' || !outLink.app.token) {
    logger.warn('Channel not available, drop reply', { shareId, lastMsgId });
    return;
  }

  const app = outLink.app;
  const client = new ILinkClient(app.baseUrl, app.token);
  const chatId = `wechat_${shareId}_${userId}`;

  try {
    await outlinkInvokeChat({
      outLinkConfig: outLink,
      chatId,
      query: [{ text: { content: text } }],
      messageId: lastMsgId,
      chatUserId: userId,
      onReply: async (replyContent: string) => {
        await client.sendMessage({
          to_user_id: userId,
          text: replyContent,
          context_token: contextToken
        });
      }
    });

    await setRedisCache(dedupKey, '1', REPLY_DEDUP_TTL);
  } catch (error) {
    logger.error('Reply job failed', {
      shareId,
      userId,
      lastMsgId,
      attempt: job.attemptsMade + 1,
      error: String(error)
    });

    // 仅最后一次 attempt 失败才发 fallback，避免重试期间重复发
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      try {
        const errorText = outLink.defaultResponse || `Run agent error: ${getErrText(error)}`;
        await client.sendMessage({
          to_user_id: userId,
          text: errorText,
          context_token: contextToken
        });
        await setRedisCache(dedupKey, '1', REPLY_DEDUP_TTL);
      } catch {
        // 忽略
      }
    }
    throw error;
  }
}

/* ============ 续链 ============ */

async function scheduleNextPoll(shareId: string, delayMs?: number): Promise<void> {
  const queue = getQueue<WechatPollJobData>(QueueNames.wechatPoll);
  await queue.add(
    POLL_JOB_NAME,
    { shareId },
    {
      jobId: pollJobId(shareId),
      ...(delayMs ? { delay: delayMs } : {}),
      removeOnComplete: true,
      removeOnFail: { count: 50 }
    }
  );
}

/* ============ 对外接口 ============ */

export const initWechatPollWorker = async () => {
  getWorker<WechatPollJobData>(QueueNames.wechatPoll, processWechatPollJob, {
    concurrency: 20,
    lockDuration: POLL_LOCK_MS,
    stalledInterval: 30_000,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 100, age: 7 * 24 * 60 * 60 }
  });

  getWorker<WechatReplyJobData>(QueueNames.wechatReply, processWechatReplyJob, {
    concurrency: 30,
    lockDuration: REPLY_LOCK_MS,
    stalledInterval: 60_000,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 500, age: 7 * 24 * 60 * 60 }
  });

  await resumeAllWechatPolling();
  logger.info('Wechat poll/reply workers initialized');
};

async function resumeAllWechatPolling(): Promise<void> {
  const onlineChannels = await MongoOutLink.find(
    { type: 'wechat', 'app.status': 'online', 'app.token': { $exists: true, $ne: '' } },
    { shareId: 1 }
  ).lean();

  logger.info('Resuming wechat polling', { count: onlineChannels.length });
  for (const ch of onlineChannels) {
    await scheduleNextPoll(ch.shareId);
  }
}

export const startWechatPolling = async (shareId: string): Promise<void> => {
  await scheduleNextPoll(shareId);
  logger.info('Wechat polling started', { shareId });
};

export const stopWechatPolling = async (shareId: string): Promise<void> => {
  await MongoOutLink.updateOne(
    { shareId },
    { $set: { 'app.status': 'offline', 'app.token': '' } }
  );

  const queue = getQueue<WechatPollJobData>(QueueNames.wechatPoll);
  const existing = await queue.getJob(pollJobId(shareId));
  if (existing) {
    try {
      await existing.remove();
    } catch {
      // 忽略
    }
  }

  logger.info('Wechat polling stopped', { shareId });
};
```

---

## 关键设计要点

| 问题 | 解决手段 | 代码位置 |
|---|---|---|
| 回复阻塞拉取 | 拆 `wechatReply` 队列，poll dispatch 后立即续链 | `mq.ts` processWechatPollJob |
| 续链重复 | `pollJobId = wechat-poll:{shareId}` 幂等 | `scheduleNextPoll` |
| 回复重复（入队重复） | `replyJobId = wechat-reply:{shareId}:{lastMsgId}` 幂等 | `processWechatReplyJob` |
| 回复重复（stalled retry / attempt 重试） | 依赖 `outlinkInvokeChat` 按 `messageId` 自身幂等 | — |
| enqueue 失败丢消息 | 先 dispatch reply 成功后才推进 `syncBuf`；at-least-once + 幂等键去重 | poll worker 1) → 2) 顺序 |
| 重试时错误提示被重复发 | 仅最后一次 attempt 失败才发 defaultResponse | `processWechatReplyJob` catch |
| 长回复被 stalled 误判 | `REPLY_LOCK_MS = 30min` 足够长 + `outlinkInvokeChat` 幂等兜底 | worker 配置 |
| `stopWechatPolling` 残留链 | 主动 `queue.getJob().remove()` | `stopWechatPolling` |
| 服务重启多实例 | `resumeAllWechatPolling` 用幂等 jobId，BullMQ 自然去重 | `resumeAllWechatPolling` |

---

## 消息合并语义说明

- **同一 poll 周期内同一用户多条消息**：`groupMessagesByUser` 用 `Map<userId, Group>` 聚合，`text` 用 `\n` 拼接，`contextToken` 取最后一条，`lastMsgId` 取最后一条。**1 次 `invokeChat`，1 次合并回复**。
- **跨 poll 周期**：2 个独立 reply job，2 次回复，但共享 `chatId = wechat_{shareId}_{userId}` → 上下文连续。
- **多个用户**：每个用户 1 个 reply job，并行处理。

---

## 落地 TODO

- [ ] 1. `bullmq/index.ts` 加 `QueueNames.wechatReply`
- [ ] 2. `wechat/type.ts` 加 `WechatReplyJobData`
- [ ] 3. `wechat/messageParser.ts` 把 `msgIds[]` 改 `lastMsgId`
- [ ] 4. `wechat/mq.ts` 按上文全量替换
- [ ] 5. `pnpm lint` 过
- [ ] 6. 本地联调
  - 扫码登录，观察 poll job p99 <40s
  - 模拟 agent 慢回复（sleep 5 分钟），验证期间新消息在 35s 内被拉取
  - kill worker 进程，验证重启后无重复回复
  - 同一用户 10s 内连发 3 条，验证合并成 1 次回复（同 poll 周期内）
- [ ] 7. 灰度发布，监控
  - `wechatPoll` waiting/active/failed
  - `wechatReply` waiting/active/failed
  - `wechat:reply:done:*` key 命中率
  - Mongo `app.syncBuf` 写入频率

---

## 风险 & 回滚

- **风险 1**：reply worker 堆积 → 加监控告警，必要时提高 `concurrency`
- **风险 2**：`REPLY_DEDUP_TTL=24h` 内如果 `lastMsgId` 被 ilink 服务端复用，会漏回复。需要确认 ilink 的 msgid 是否全局唯一 —— 从现网抓取样本验证
- **回滚**：保留旧 `mq.ts` 为 `mq.legacy.ts`，通过环境变量 `USE_LEGACY_WECHAT_MQ=1` 切换
