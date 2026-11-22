import {
  defaultWorkerOptions,
  wechatMQService,
  WECHAT_POLL_JOB_NAME,
  type Job,
  type WechatPollJobData,
  type WechatReplyJobData
} from '@fastgpt/dal/redis/bullmq';
import { getLogger, LogCategories } from '../../../common/logger';
import { ILinkClient } from './ilinkClient';
import { WechatRequestPolicyError } from './request';
import type {
  OutLinkSchemaType,
  WechatAppType,
  WechatConnectionErrorType
} from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '../schema';
import { wechatPollingFailureCache } from '@fastgpt/dal/redis/caches';
import { groupMessagesByUser } from './messageParser';
import { batchRun, retryFn, withTimeout } from '@fastgpt/global/common/system/utils';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { wechatOutlinkProvider } from './provider';
import { getWechatBindingIdentity, isActiveWechatConnection } from './utils';

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECHAT);

const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_BACKOFF_MS = 10_000;
// 空响应（无消息）时的续链延迟：getUpdates 秒回空包时避免 completed→立即续链 退化成热循环
const EMPTY_POLL_DELAY_MS = 10_000;
const POLL_LOCK_MS = 120_000;
const REPLY_LOCK_MS = 30 * 60_000;
const WECHAT_WORKER_CONCURRENCY = 1000;
// Poll processor 硬超时：防止 worker 活着但 processor hang 导致确定 jobId 永远阻塞
// 应覆盖响应头（35 秒）和响应体（15 秒）时限，并为 Mongo/Redis 操作留余量
const POLL_HARD_TIMEOUT_MS = 120_000;

/* ============ 幂等键 ============ */

// 确定 jobId → BullMQ 自动保证同 shareId 同一时刻只存在一个 poll job（singleton）
// 续链在 worker 'completed' / 'failed' 事件里发起，此时 job 已从 Redis 删除，add 不会冲突
const pollJobId = (shareId: string) => `wechat-poll:${shareId}`;
const activeChannelFilter = {
  type: PublishChannelEnum.wechat,
  'app.status': 'online',
  'app.token': { $type: 'string', $ne: '', $not: { $type: 'array' } }
} as const;
type PollResult = 'messages' | 'idle' | 'stopped';

/* ============ Poll Worker 处理器 ============ */
// 设计约定：
// 任务结束后由 worker 事件按结果续链。硬超时避免固定 jobId 被卡住，绑定和游标比较保护迟到的写入。
function processWechatPollJob(job: Job<WechatPollJobData>): Promise<PollResult> {
  const controller = new AbortController();
  return withTimeout(
    pollImpl(job, controller.signal),
    POLL_HARD_TIMEOUT_MS,
    `Poll job hard timeout after ${POLL_HARD_TIMEOUT_MS}ms`
  ).finally(() => controller.abort());
}

async function pollImpl(job: Job<WechatPollJobData>, signal: AbortSignal): Promise<PollResult> {
  const { shareId } = job.data;
  logger.debug('Wechat poll job started', { shareId, jobId: job.id });

  const outLink = await MongoOutLink.findOne({
    ...activeChannelFilter,
    shareId
  }).lean<OutLinkSchemaType<WechatAppType> | null>();
  signal.throwIfAborted();
  const app = outLink?.app;
  if (!isActiveWechatConnection(app)) {
    logger.debug('No active Wechat binding, stop polling', { shareId });
    return 'stopped';
  }

  // Redis 使用有效绑定身份，Mongo 比较本轮读取的原始登录快照。
  const { key: bindingKey } = getWechatBindingIdentity(app);
  const bindingFilter = {
    shareId,
    'app.status': 'online',
    'app.bindingId': app.bindingId ?? null,
    'app.baseUrl': app.baseUrl ?? null,
    'app.token': app.token,
    'app.loginTime': app.loginTime ?? null
  };

  const stopPollingWithError = async (lastError: WechatConnectionErrorType) => {
    signal.throwIfAborted();
    const result = await MongoOutLink.updateOne(bindingFilter, {
      $set: { 'app.status': 'error', 'app.lastError': lastError }
    });
    signal.throwIfAborted();
    await wechatPollingFailureCache.clear(shareId, bindingKey);
    return result.modifiedCount > 0;
  };

  const recordPollingFailure = async () => {
    const failures = await wechatPollingFailureCache.increment(shareId, bindingKey);
    if (failures < MAX_CONSECUTIVE_FAILURES) return;
    if (await stopPollingWithError('request_failed')) {
      logger.error('Too many failures, stop polling', { shareId, failures });
    }
  };

  const resp = await (async () => {
    try {
      const client = new ILinkClient(app.baseUrl, app.token);
      return await client.getUpdates(app.syncBuf || '');
    } catch (error) {
      signal.throwIfAborted();
      logger.error('Wechat getUpdates request failed', { shareId, error: String(error) });
      if (error instanceof WechatRequestPolicyError) {
        await stopPollingWithError(error.reason);
      } else {
        await recordPollingFailure();
      }
      throw error;
    }
  })();
  signal.throwIfAborted();
  if (resp === undefined) {
    logger.debug('Wechat getUpdates reached the local long-poll timeout', { shareId });
    return 'idle';
  }

  logger.debug('Wechat getUpdates returned', {
    shareId,
    msgCount: resp.msgs?.length ?? 0,
    hasNextBuf: Boolean(resp.get_updates_buf),
    ret: resp.ret,
    errcode: resp.errcode
  });

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

    await recordPollingFailure();

    // 抛错走 'failed' 事件 → 续链带退避
    throw new Error(`getUpdates API error: ret=${resp.ret} errcode=${resp.errcode}`);
  }

  await wechatPollingFailureCache.clear(shareId, bindingKey);
  signal.throwIfAborted();

  const messages = resp.msgs ?? [];

  const cursorFilter = { ...bindingFilter, 'app.syncBuf': app.syncBuf ?? null };

  // 1) 先分发回复任务。长轮询期间已变更的连接不再分发旧消息。
  if (messages.length > 0) {
    const current = await MongoOutLink.exists(cursorFilter);
    signal.throwIfAborted();
    if (!current) return 'stopped';

    const groups = groupMessagesByUser(messages);
    logger.debug('Dispatch reply jobs', {
      shareId,
      totalMsgs: messages.length,
      userGroups: groups.length
    });

    await Promise.all(
      groups.map((group) => wechatMQService.addReplyJob({ shareId, bindingKey, ...group }))
    );
  }

  // 2) 全部入队成功后再推进 syncBuf
  signal.throwIfAborted();
  if (resp.get_updates_buf) {
    const result = await MongoOutLink.updateOne(cursorFilter, {
      $set: { 'app.syncBuf': resp.get_updates_buf }
    });
    if (result.matchedCount === 0) return 'stopped';
    logger.debug('Wechat poll cursor saved', { shareId, jobId: job.id });
  }

  // 3) 不在这里续链，交给 worker 'completed' 事件处理器
  return messages.length > 0 ? 'messages' : 'idle';
}

/* ============ Reply Worker ============ */
async function processWechatReplyJob(job: Job<WechatReplyJobData>): Promise<void> {
  try {
    await wechatOutlinkProvider(job.data);
  } catch (error) {
    logger.error('Reply job failed', {
      shareId: job.data.shareId,
      userId: job.data.userId,
      lastMsgId: job.data.lastMsgId,
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
  const job = await wechatMQService.addPollJob(
    { shareId },
    {
      jobId: pollJobId(shareId),
      delay: delayMs
    }
  );
  logger.debug('Wechat poll job scheduled', {
    shareId,
    jobId: job.id,
    delayMs
  });
}

/** 渠道停止或失败后重新读取当前绑定，避免停用后续链，也能接上期间完成的重绑。 */
async function continuePolling(shareId: string, result: PollResult | 'failed') {
  try {
    const recheckBinding = result === 'failed' || result === 'stopped';
    const delayMs =
      result === 'failed'
        ? FAILURE_BACKOFF_MS
        : result === 'idle'
          ? EMPTY_POLL_DELAY_MS
          : undefined;
    await retryFn(async () => {
      if (recheckBinding && !(await MongoOutLink.exists({ ...activeChannelFilter, shareId })))
        return;
      await scheduleNextPoll(shareId, delayMs);
    });
  } catch (error) {
    logger.error('Schedule next Wechat poll failed', { shareId, result, error: String(error) });
  }
}

/* ============ 对外接口 ============ */

/**
 * 初始化微信轮询 / 回复 Worker
 */
export const initWechatPollWorker = async () => {
  const pollWorker = wechatMQService.getPollWorker(processWechatPollJob, {
    // poll job 主要阻塞在 getUpdates 长轮询 I/O（~30s），不吃 CPU
    concurrency: WECHAT_WORKER_CONCURRENCY,
    lockDuration: POLL_LOCK_MS, // 120s 防止 job 被误判为 stalled
    stalledInterval: 30_000 // 30s 检查下是否活跃
  });

  // 成功完成：续链。事件内 add 因 job 已被移除，不会冲突。
  // 有消息立即续链清空积压；无消息（空响应）延迟 EMPTY_POLL_DELAY_MS，避免服务端秒回空包时退化成热循环。
  pollWorker.on('completed', async (job, result) => {
    if (job.name !== WECHAT_POLL_JOB_NAME) return;
    await continuePolling(job.data.shareId, result);
  });

  // 失败：续链（带退避）。渠道仍 online 时尝试恢复
  pollWorker.on('failed', async (job) => {
    if (!job || job.name !== WECHAT_POLL_JOB_NAME) return;
    const { shareId } = job.data;
    logger.warn('Wechat poll job failed', {
      shareId,
      jobId: job.id,
      failedReason: job.failedReason
    });
    await continuePolling(shareId, 'failed');
  });

  wechatMQService.getReplyWorker(processWechatReplyJob, {
    concurrency: WECHAT_WORKER_CONCURRENCY,
    lockDuration: REPLY_LOCK_MS,
    stalledInterval: 60_000,
    removeOnComplete: { count: 0 },
    ...defaultWorkerOptions
  });

  await resumeAllWechatPolling();
  logger.info('Wechat poll/reply workers initialized');
};

/**
 * 服务启动时恢复所有 online 渠道的轮询
 */
async function resumeAllWechatPolling(): Promise<void> {
  const onlineChannels = await MongoOutLink.find(activeChannelFilter, { shareId: 1 }).lean();

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
 * 幂等启动轮询。已在队列中的任务会读取执行时的最新绑定。
 */
export const startWechatPolling = async (shareId: string): Promise<void> => {
  await scheduleNextPoll(shareId);
  logger.info('Wechat polling started', { shareId });
};

/**
 * 渠道已删除后清理待运行的轮询。在途任务由绑定条件和后续状态读取收尾。
 */
export const removeWechatPollJob = async (shareId: string): Promise<void> => {
  await wechatMQService.removePollJob(pollJobId(shareId)).catch((error) => {
    logger.warn('Remove poll job failed (job may be active)', { shareId, error: String(error) });
  });
};
