import { getWorker, getQueue, QueueNames, type Job } from '../../../common/bullmq';
import { getLogger, LogCategories } from '../../../common/logger';
import { ILinkClient } from './ilinkClient';
import type { WechatPollJobData, WechatReplyJobData } from './type';
import type { OutLinkSchemaType, WechatAppType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '../../../support/outLink/schema';
import { outlinkInvokeChat } from '../../../support/outLink/runtime/utils';
import { delRedisCache, getRedisCache, setRedisCache } from '../../../common/redis/cache';
import { groupMessagesByUser } from './messageParser';
import { env } from '../../../env';
import { batchRun, retryFn } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECHAT);

const POLL_JOB_NAME = 'wechatPublishPoll';
const REPLY_JOB_NAME = 'wechatPublishReply';

const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_BACKOFF_MS = 10_000;
const POLL_LOCK_MS = 120_000;
const REPLY_LOCK_MS = 30 * 60_000;
// Poll processor 硬超时：防止 worker 活着但 processor hang 导致确定 jobId 永远阻塞
// 应 > LONG_POLL_TIMEOUT_MS(35s) + Mongo/Redis 操作余量
const POLL_HARD_TIMEOUT_MS = 120_000;

/* ============ 幂等键 ============ */

// 确定 jobId → BullMQ 自动保证同 shareId 同一时刻只存在一个 poll job（singleton）
// 续链在 worker 'completed' / 'failed' 事件里发起，此时 job 已从 Redis 删除，add 不会冲突
const pollJobId = (shareId: string) => `wechat-poll:${shareId}`;
const replyJobId = (shareId: string, lastMsgId: string) => `wechat-reply:${shareId}:${lastMsgId}`;
const failKey = (shareId: string) => `wechat:publish:failures:${shareId}`;

/* ============ Poll Worker 处理器 ============ */
// 设计约定：
//  - 正常完成 → return → 'completed' 事件 → 续链（立即）
//  - 任何异常/停止条件 → throw → 'failed' 事件 → shouldContinuePolling 决定是否续链
//  - 外层 Promise.race 兜底：processor 最多 POLL_HARD_TIMEOUT_MS 就必须终止，
//    防止 worker 活着但 processor hang 导致确定 jobId 永远阻塞
async function processWechatPollJob(job: Job<WechatPollJobData>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Poll job hard timeout after ${POLL_HARD_TIMEOUT_MS}ms`)),
      POLL_HARD_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([pollImpl(job), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pollImpl(job: Job<WechatPollJobData>): Promise<void> {
  const { shareId } = job.data;

  const outLink = (await MongoOutLink.findOne({
    shareId
  }).lean()) as unknown as OutLinkSchemaType<WechatAppType> | null;

  if (!outLink || !outLink.app) {
    logger.warn('OutLink not found, stop polling', { shareId });
    throw new Error('OutLink not found');
  }

  const app = outLink.app;
  if (app.status !== 'online') {
    logger.info('Channel not online, stop polling', { shareId, status: app.status });
    throw new Error('Channel not online');
  }
  if (!app.token) {
    logger.warn('No token, stop polling', { shareId });
    throw new Error('No token');
  }

  const client = new ILinkClient(app.baseUrl, app.token);
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
      await delRedisCache(failKey(shareId));
    }

    // 抛错走 'failed' 事件 → 续链带退避
    throw new Error(`getUpdates API error: ret=${resp.ret} errcode=${resp.errcode}`);
  }

  await setRedisCache(failKey(shareId), '0', 300);

  // 1) 先分发回复任务（失败则 syncBuf 不推进，下次 poll 重拉；靠 replyJobId 幂等去重）
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
            backoff: { type: 'fixed', delay: 2000 }
          }
        )
      )
    );
  }

  // 2) 全部入队成功后再推进 syncBuf
  if (resp.get_updates_buf) {
    await MongoOutLink.updateOne({ shareId }, { $set: { 'app.syncBuf': resp.get_updates_buf } });
  }

  // 3) 不在这里续链，交给 worker 'completed' 事件处理器
}

/* ============ Reply Worker ============ */
async function processWechatReplyJob(job: Job<WechatReplyJobData>): Promise<void> {
  const { shareId, userId, text, contextToken, lastMsgId } = job.data;

  const outLink = (await MongoOutLink.findOne({
    shareId
  }).lean()) as unknown as OutLinkSchemaType<WechatAppType> | null;
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
  } catch (error) {
    logger.error('Reply job failed', {
      shareId,
      userId,
      lastMsgId,
      error: String(error)
    });
    throw error;
  }
}

/* ============ 续链调度 ============ */
// 在 worker 'completed' / 'failed' 事件里调用，此时 job hash 已从 Redis 删除
// startWechatPolling / resumeAllWechatPolling 也调用本函数：
//   - 如果链正在运行（job 处于 active），add 会因 jobId 冲突被 BullMQ 静默忽略（幂等）
//   - 如果链已死（无 job），add 正常入队
async function scheduleNextPoll(shareId: string, delayMs?: number): Promise<void> {
  const queue = getQueue<WechatPollJobData>(QueueNames.wechatPoll);
  await queue.add(
    POLL_JOB_NAME,
    { shareId },
    {
      jobId: pollJobId(shareId),
      ...(delayMs ? { delay: delayMs } : {}),
      removeOnComplete: true,
      removeOnFail: true
    }
  );
}

/**
 * 判断渠道是否仍应继续轮询。
 * 用于 'completed' 事件处理器 —— 渠道已被停用时不再续链。
 */
async function shouldContinuePolling(shareId: string): Promise<boolean> {
  const outLink = await MongoOutLink.findOne(
    {
      shareId,
      type: 'wechat',
      'app.status': 'online',
      'app.token': { $exists: true, $ne: '' }
    },
    { _id: 1 }
  ).lean();
  return Boolean(outLink);
}

/* ============ 对外接口 ============ */

/**
 * 初始化微信轮询 / 回复 Worker
 */
export const initWechatPollWorker = async () => {
  const pollWorker = getWorker<WechatPollJobData>(QueueNames.wechatPoll, processWechatPollJob, {
    // poll job 主要阻塞在 getUpdates 长轮询 I/O（~30s），不吃 CPU
    concurrency: env.WECHAT_CHANNEL_CONCURRENCY,
    lockDuration: POLL_LOCK_MS, // 120s 防止 job 被误判为 stalled
    stalledInterval: 30_000, // 30s 检查下是否活跃
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 0 }
  });

  // 成功完成：续链（立即）。事件内 add 因 job 已被移除，不会冲突
  pollWorker.on('completed', async (job) => {
    if (job.name !== POLL_JOB_NAME) return;
    const { shareId } = job.data as WechatPollJobData;
    try {
      await scheduleNextPoll(shareId);
    } catch (error) {
      logger.error('Schedule next poll (completed) failed', { shareId, error: String(error) });
    }
  });

  // 失败：续链（带退避）。渠道仍 online 时尝试恢复
  pollWorker.on('failed', async (job) => {
    if (!job || job.name !== POLL_JOB_NAME) return;
    const { shareId } = job.data as WechatPollJobData;
    try {
      await retryFn(async () => {
        if (!(await shouldContinuePolling(shareId))) return;
        await scheduleNextPoll(shareId, FAILURE_BACKOFF_MS);
      });
    } catch (error) {
      logger.error('Schedule next poll (failed) failed', { shareId, error: String(error) });
    }
  });

  getWorker<WechatReplyJobData>(QueueNames.wechatReply, processWechatReplyJob, {
    concurrency: env.WECHAT_CHANNEL_CONCURRENCY,
    lockDuration: REPLY_LOCK_MS,
    stalledInterval: 60_000,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 500, age: 7 * 24 * 60 * 60 }
  });

  await resumeAllWechatPolling();
  logger.info('Wechat poll/reply workers initialized');
};

/**
 * 服务启动时恢复所有 online 渠道的轮询
 */
async function resumeAllWechatPolling(): Promise<void> {
  const onlineChannels = await MongoOutLink.find(
    {
      type: 'wechat',
      'app.status': 'online',
      'app.token': { $exists: true, $ne: '' }
    },
    { shareId: 1 }
  ).lean();

  logger.info('Resuming wechat polling', { count: onlineChannels.length });

  await batchRun(
    onlineChannels,
    async (ch) => {
      await scheduleNextPoll(ch.shareId);
    },
    100
  );
}

/**
 * 启动某个渠道的轮询
 */
export const startWechatPolling = async (shareId: string): Promise<void> => {
  await scheduleNextPoll(shareId);
  logger.info('Wechat polling started', { shareId });
};

/**
 * 停止某个渠道的轮询
 */
export const stopWechatPolling = async (shareId: string): Promise<void> => {
  await MongoOutLink.updateOne({ shareId }, { $set: { 'app.status': 'offline', 'app.token': '' } });

  // Delete job from queue
  const queue = getQueue<WechatPollJobData>(QueueNames.wechatPoll);
  await queue.remove(pollJobId(shareId)).catch((error) => {
    logger.warn('Remove poll job failed (job may be active)', { shareId, error: String(error) });
  });

  logger.info('Wechat polling stopped', { shareId });
};
