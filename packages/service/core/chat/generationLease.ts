import {
  ChatGenerationLeaseCache,
  type ChatGenerationLeaseParams as DalChatGenerationLeaseParams
} from '@fastgpt/dal/redis/caches';
import {
  ChatGenerateStatusEnum,
  type ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../common/logger';
import { MongoChat } from './chatSchema';
import { buildChatSourceQuery } from './source';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);
const generationLeaseCache = new ChatGenerationLeaseCache();

/** lease 必须显著短于 cleaner 判定周期，给 Redis/Mongo 瞬时失败保留续租窗口。 */
export const CHAT_GENERATION_LEASE_TTL_MS = 90 * 1000;
export const CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS = 30 * 1000;

export type ChatGenerationLeaseParams = Omit<DalChatGenerationLeaseParams, 'sourceType'> & {
  sourceType: ChatSourceTypeEnum;
};

export type ChatGenerationLeaseStartParams = ChatGenerationLeaseParams & {
  generationRunId: string;
};

export type ChatGenerationLease = {
  generationRunId: string;
  signal: AbortSignal;
  assertValid: () => void;
  abort: (reason?: unknown) => void;
  stop: () => Promise<void>;
};

class ChatGenerationLostError extends Error {
  constructor(message = 'Chat generation lease was lost') {
    super(message);
    this.name = 'ChatGenerationLostError';
  }
}

type ActiveLease = ChatGenerationLease & {
  params: ChatGenerationLeaseParams;
  timer: ReturnType<typeof setInterval>;
};

const activeLeases = new Map<string, ActiveLease>();

const getLeaseMapKey = (params: ChatGenerationLeaseParams) =>
  `${params.sourceType}:${params.sourceId}:${params.chatId}`;

/**
 * 启动当前生成 run 的独立 lease heartbeat。
 *
 * 该 heartbeat 只代表执行任务是否存活，不依赖 HTTP response、SSE 或 resume mirror。
 * Redis token 负责跨节点 fencing，Mongo heartbeat 用于 Redis 异常时保留持久判据。
 */
export const startChatGenerationLease = async ({
  generationRunId,
  ...params
}: ChatGenerationLeaseStartParams): Promise<ChatGenerationLease> => {
  const mapKey = getLeaseMapKey(params);
  const previousLease = activeLeases.get(mapKey);
  if (previousLease?.generationRunId === generationRunId) {
    return previousLease;
  }
  if (previousLease && previousLease.generationRunId !== generationRunId) {
    previousLease.abort(new ChatGenerationLostError('Chat generation lease was replaced'));
    await previousLease.stop();
  }

  await generationLeaseCache.start({
    params,
    token: generationRunId,
    ttlMs: CHAT_GENERATION_LEASE_TTL_MS
  });

  const abortController = new AbortController();
  let stopped = false;
  let renewing = false;
  let lost = false;

  const abort = (error?: unknown) => {
    if (lost) return;
    lost = true;
    clearInterval(timer);
    if (!abortController.signal.aborted) {
      abortController.abort(
        error instanceof Error ? error : new ChatGenerationLostError(String(error || ''))
      );
    }
  };

  const markLost = (error: unknown) => {
    abort(error);
  };

  const assertValid = () => {
    if (lost) throw new ChatGenerationLostError();
  };

  const renew = async () => {
    if (stopped || lost || renewing) return;
    renewing = true;
    const heartbeatAt = new Date();

    try {
      const [redisResult, mongoResult] = await Promise.allSettled([
        generationLeaseCache.renew({
          params,
          token: generationRunId,
          ttlMs: CHAT_GENERATION_LEASE_TTL_MS
        }),
        MongoChat.updateOne(
          {
            ...buildChatSourceQuery(params),
            chatId: params.chatId,
            chatGenerateStatus: ChatGenerateStatusEnum.generating,
            generationRunId
          },
          {
            $set: {
              generationHeartbeatAt: heartbeatAt,
              generationLeaseExpiresAt: new Date(
                heartbeatAt.getTime() + CHAT_GENERATION_LEASE_TTL_MS
              )
            }
          }
        )
      ]);

      if (mongoResult.status === 'rejected') {
        logger.warn('Chat generation Mongo heartbeat failed', {
          ...params,
          generationRunId,
          error: mongoResult.reason
        });
      } else if ((mongoResult.value.matchedCount ?? 0) === 0) {
        markLost(new ChatGenerationLostError());
        logger.warn('Chat generation Mongo heartbeat lost ownership', {
          ...params,
          generationRunId
        });
        return;
      }

      if (redisResult.status === 'rejected') {
        logger.warn('Chat generation Redis lease renew failed', {
          ...params,
          generationRunId,
          error: redisResult.reason
        });
      } else if (!redisResult.value) {
        // Redis key 丢失/重启但 Mongo runId 仍属于当前执行体时，重建 token 而不是中断任务。
        await generationLeaseCache.start({
          params,
          token: generationRunId,
          ttlMs: CHAT_GENERATION_LEASE_TTL_MS
        });
        logger.warn('Chat generation Redis lease was recreated after token loss', {
          ...params,
          generationRunId
        });
      }
    } catch (error) {
      // Redis/Mongo 瞬时失败不能立即判死；只要任意一侧仍保留有效期，cleaner 就不会清理。
      logger.warn('Chat generation lease heartbeat failed', {
        ...params,
        generationRunId,
        error
      });
    } finally {
      renewing = false;
    }
  };

  const timer = setInterval(() => void renew(), CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS);
  timer.unref?.();

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);

    const currentLease = activeLeases.get(mapKey);
    if (currentLease?.generationRunId === generationRunId) {
      activeLeases.delete(mapKey);
    }

    try {
      await generationLeaseCache.release({ params, token: generationRunId });
    } catch (error) {
      logger.warn('Chat generation lease release failed', {
        ...params,
        generationRunId,
        error
      });
    }
  };

  const lease: ActiveLease = {
    params,
    generationRunId,
    signal: abortController.signal,
    assertValid,
    abort,
    stop,
    timer
  };
  activeLeases.set(mapKey, lease);

  return lease;
};

/**
 * 终止指定 run 的本地 heartbeat，并按 token 尝试释放 Redis lease。
 *
 * 旧 run 在新 run 启动后调用时，本地 map 和 Redis token 都不会影响新 run。
 */
export const stopChatGenerationLease = async ({
  generationRunId,
  ...params
}: ChatGenerationLeaseStartParams) => {
  const mapKey = getLeaseMapKey(params);
  const currentLease = activeLeases.get(mapKey);

  if (currentLease?.generationRunId === generationRunId) {
    await currentLease.stop();
    return;
  }

  try {
    await generationLeaseCache.release({ params, token: generationRunId });
  } catch (error) {
    logger.warn('Chat generation orphan lease release failed', {
      ...params,
      generationRunId,
      error
    });
  }
};

/** 返回当前进程内匹配 chat 的活动 lease；传入 runId 时必须精确匹配。 */
export const getActiveChatGenerationLease = (
  params: ChatGenerationLeaseParams,
  generationRunId?: string
) => {
  const lease = activeLeases.get(getLeaseMapKey(params));
  if (generationRunId && lease?.generationRunId !== generationRunId) return;
  return lease;
};

/** 返回当前 token；cleaner 用其确认 Redis lease 是否仍然有效。 */
export const getChatGenerationLeaseToken = (params: ChatGenerationLeaseParams) =>
  generationLeaseCache.getToken(params);
