import { getWorker, getQueue, QueueNames, type Job } from '../../../common/bullmq';
import { getLogger, LogCategories } from '../../../common/logger';
import { ILinkClient } from './ilinkClient';
import type { WechatPollJobData } from './type';
import type { OutLinkSchema, WechatAppType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '../../../support/outLink/schema';
import { outlinkInvokeChat } from '../../../support/outLink/runtime/utils';
import { setRedisCache, getRedisCache } from '../../../common/redis/cache';
import { groupMessagesByUser, type ParsedMessageGroup } from './messageParser';
import { getErrText } from '@fastgpt/global/common/error/utils';

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECHAT);

const queueName = 'wechatPublishPoll';
const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_BACKOFF_MS = 10_000;

/* ============ Worker 处理逻辑 ============ */

async function processWechatPollJob(job: Job<WechatPollJobData>): Promise<void> {
  const { shareId } = job.data;

  // 1. 获取渠道配置
  const outLink = (await MongoOutLink.findOne({
    shareId
  }).lean()) as unknown as OutLinkSchema<WechatAppType>;
  if (!outLink || !outLink.app) {
    logger.warn('OutLink not found, stop polling', { shareId });
    return;
  }

  const app = outLink.app;

  // 2. 检查状态
  if (app.status !== 'online') {
    logger.info('Channel not online, stop polling', { shareId, status: app.status });
    return;
  }

  if (!app.token) {
    logger.warn('No token, stop polling', { shareId });
    return;
  }

  const client = new ILinkClient(app.baseUrl, app.token);
  const failKey = `publish:wechat:failures:${shareId}`;

  try {
    // 3. 长轮询拉取消息
    const resp = await client.getUpdates(app.syncBuf || '');

    // 检查 API 错误
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

      const failures = Number((await getRedisCache(failKey)) ?? '0') + 1;
      await setRedisCache(failKey, String(failures), 300);

      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        await MongoOutLink.updateOne(
          { shareId },
          { $set: { 'app.status': 'error', 'app.lastError': resp.errmsg || 'Too many failures' } }
        );
        logger.error('Too many failures, stop polling', { shareId, failures });
        return;
      }

      // 延迟续链
      await scheduleNextPoll(shareId, FAILURE_BACKOFF_MS);
      return;
    }

    // 清除失败计数
    await setRedisCache(failKey, '0', 300);

    // 4. 处理消息
    if (resp.msgs && resp.msgs.length > 0) {
      const groups = groupMessagesByUser(resp.msgs);

      logger.debug('Processing messages', {
        shareId,
        totalMsgs: resp.msgs.length,
        userGroups: groups.length
      });

      // 并发处理各用户分组
      await Promise.allSettled(groups.map((group) => processUserGroup(outLink, group)));
    }

    // 5. 更新 buf
    if (resp.get_updates_buf) {
      await MongoOutLink.updateOne({ shareId }, { $set: { 'app.syncBuf': resp.get_updates_buf } });
    }
  } catch (error) {
    logger.error('Poll job error', { shareId, error: String(error) });
  }

  // 6. 续链
  await scheduleNextPoll(shareId);
}

/* ============ 处理单个用户分组 ============ */

async function processUserGroup(
  outLink: OutLinkSchema<WechatAppType>,
  group: ParsedMessageGroup
): Promise<void> {
  const app = outLink.app;
  const chatId = `wechat_${outLink.shareId}_${group.userId}`;

  const client = new ILinkClient(app.baseUrl, app.token);

  try {
    await outlinkInvokeChat({
      outLinkConfig: outLink,
      chatId,
      query: [{ text: { content: group.text } }],
      messageId: group.msgIds[group.msgIds.length - 1],
      chatUserId: group.userId,
      onReply: async (replyContent: string) => {
        await client.sendMessage({
          to_user_id: group.userId,
          text: replyContent,
          context_token: group.contextToken
        });
      }
    });
  } catch (error) {
    logger.error('Process user group failed', {
      shareId: outLink.shareId,
      userId: group.userId,
      error: String(error)
    });

    // 尝试发送错误提示
    try {
      const errorText = outLink.defaultResponse || `Run agent error: ${getErrText(error)}`;
      await client.sendMessage({
        to_user_id: group.userId,
        text: errorText,
        context_token: group.contextToken
      });
    } catch {
      // 忽略发送失败
    }
  }
}

/* ============ 续链调度 ============ */

async function scheduleNextPoll(shareId: string, delayMs?: number): Promise<void> {
  const queue = getQueue<WechatPollJobData>(QueueNames.wechatPoll);

  await queue.add(
    queueName,
    { shareId },
    {
      jobId: `wechat-poll-${shareId}-${Date.now()}`,
      ...(delayMs ? { delay: delayMs } : {})
    }
  );
}

/* ============ 对外接口 ============ */

/**
 * 初始化微信轮询 Worker
 */
export const initWechatPollWorker = async () => {
  /**
   * 服务启动时恢复所有 online 渠道的轮询
   */
  const resumeAllWechatPolling = async (): Promise<void> => {
    const onlineChannels = await MongoOutLink.find(
      {
        type: 'wechat',
        'app.status': 'online',
        'app.token': { $exists: true, $ne: '' }
      },
      { shareId: 1 }
    ).lean();

    logger.info('Resuming wechat polling', { count: onlineChannels.length });

    for (const ch of onlineChannels) {
      await startWechatPolling(ch.shareId);
    }
  };

  getWorker<WechatPollJobData>(QueueNames.wechatPoll, processWechatPollJob, {
    concurrency: 10,
    lockDuration: 120_000,
    stalledInterval: 60_000,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 100, age: 7 * 24 * 60 * 60 }
  });

  await resumeAllWechatPolling();

  logger.info('Wechat poll worker initialized');
};

/**
 * 启动某个渠道的轮询（扫码登录成功后调用）
 */
export const startWechatPolling = async (shareId: string): Promise<void> => {
  const queue = getQueue<WechatPollJobData>(QueueNames.wechatPoll);

  await queue.add(
    queueName,
    { shareId },
    {
      jobId: `wechat-poll-${shareId}-${Date.now()}`
    }
  );

  logger.info('Wechat polling started', { shareId });
};

/**
 * 停止某个渠道的轮询
 */
export const stopWechatPolling = async (shareId: string): Promise<void> => {
  await MongoOutLink.updateOne({ shareId }, { $set: { 'app.status': 'offline', 'app.token': '' } });

  logger.info('Wechat polling stopped', { shareId });
};
