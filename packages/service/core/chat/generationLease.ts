import {
  ChatGenerationLeaseCache,
  type ChatGenerationLeaseParams as DalChatGenerationLeaseParams
} from '@fastgpt/dal/redis/caches/chatGenerationLease';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../common/logger';
import { touchLegacyStreamResumeActive } from './resume';

const logger = getLogger(LogCategories.MODULE.CHAT.HISTORY);
const generationLeaseCache = new ChatGenerationLeaseCache();

/** runner 心跳间隔必须显著短于 lease TTL，给 Redis 瞬时失败保留重试窗口。 */
export const CHAT_GENERATION_LEASE_TTL_MS = 90 * 1000;
export const CHAT_GENERATION_LEASE_RENEW_INTERVAL_MS = 30 * 1000;

export type ChatGenerationLeaseParams = Omit<DalChatGenerationLeaseParams, 'sourceType'> & {
  sourceType: ChatSourceTypeEnum;
  /** 只用于滚动升级时刷新旧 cleaner 的 legacy active key。 */
  teamId?: string;
};

export type ChatGenerationLeaseStartParams = ChatGenerationLeaseParams & {
  generationRunnerId: string;
};

export type ChatGenerationLease = {
  generationRunnerId: string;
  signal: AbortSignal;
  assertValid: () => void;
  stop: () => Promise<void>;
};

export class ChatGenerationLeaseLostError extends Error {
  constructor(message = 'Chat generation runner lease was lost') {
    super(message);
    this.name = 'ChatGenerationLeaseLostError';
  }
}

type ActiveLease = ChatGenerationLease & {
  params: ChatGenerationLeaseParams;
  timer: ReturnType<typeof setInterval>;
  expiresAt: number;
};

const activeLeases = new Map<string, ActiveLease>();

const getLeaseMapKey = (params: ChatGenerationLeaseParams) =>
  `${params.sourceType}:${params.sourceId}:${params.chatId}`;

const getLeaseCacheParams = ({ teamId: _teamId, ...params }: ChatGenerationLeaseParams) => params;

/**
 * 尝试启动一个 chat generation runner lease。
 *
 * Redis key 是跨实例互斥真源；同一个 chat 已有 runner 时直接返回 undefined，
 * 不会中止或覆盖已有执行体。
 */
export const tryStartChatGenerationLease = async ({
  generationRunnerId,
  ...params
}: ChatGenerationLeaseStartParams): Promise<ChatGenerationLease | undefined> => {
  const mapKey = getLeaseMapKey(params);
  const leaseCacheParams = getLeaseCacheParams(params);
  const existingLease = activeLeases.get(mapKey);
  if (existingLease) {
    return existingLease.generationRunnerId === generationRunnerId ? existingLease : undefined;
  }

  const acquired = await generationLeaseCache.tryAcquire({
    params: leaseCacheParams,
    token: generationRunnerId,
    ttlMs: CHAT_GENERATION_LEASE_TTL_MS
  });
  if (!acquired) return;

  const abortController = new AbortController();
  let stopped = false;
  let renewing = false;
  let lost = false;
  let expiresAt = Date.now() + CHAT_GENERATION_LEASE_TTL_MS;

  function markLost(error?: unknown) {
    if (lost) return;
    lost = true;
    clearInterval(timer);
    if (!abortController.signal.aborted) {
      abortController.abort(
        error instanceof Error ? error : new ChatGenerationLeaseLostError(String(error || ''))
      );
    }
  }

  const assertValid = () => {
    if (!lost && Date.now() >= expiresAt) {
      markLost(new ChatGenerationLeaseLostError('Chat generation runner lease expired'));
    }
    if (lost) throw new ChatGenerationLeaseLostError();
  };

  const renew = async () => {
    if (stopped || lost || renewing) return;
    renewing = true;

    try {
      const renewed = await generationLeaseCache.renew({
        params: leaseCacheParams,
        token: generationRunnerId,
        ttlMs: CHAT_GENERATION_LEASE_TTL_MS
      });
      if (!renewed) {
        markLost();
        logger.warn('Chat generation runner lease token no longer matches', {
          ...params,
          generationRunnerId
        });
        return;
      }

      expiresAt = Date.now() + CHAT_GENERATION_LEASE_TTL_MS;
      if (params.teamId) {
        await touchLegacyStreamResumeActive({
          teamId: params.teamId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          chatId: params.chatId
        }).catch((error) => {
          logger.warn('Chat generation legacy active heartbeat failed', {
            ...params,
            generationRunnerId,
            error
          });
        });
      }
    } catch (error) {
      logger.warn('Chat generation runner lease renew failed', {
        ...params,
        generationRunnerId,
        error
      });
      if (Date.now() >= expiresAt) {
        markLost(error);
      }
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
    if (currentLease?.generationRunnerId === generationRunnerId) {
      activeLeases.delete(mapKey);
    }

    try {
      await generationLeaseCache.release({ params: leaseCacheParams, token: generationRunnerId });
    } catch (error) {
      logger.warn('Chat generation runner lease release failed', {
        ...params,
        generationRunnerId,
        error
      });
    }
  };

  const lease: ActiveLease = {
    params,
    generationRunnerId,
    signal: abortController.signal,
    assertValid,
    stop,
    timer,
    expiresAt
  };
  activeLeases.set(mapKey, lease);

  if (params.teamId) {
    await touchLegacyStreamResumeActive({
      teamId: params.teamId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      chatId: params.chatId
    }).catch((error) => {
      logger.warn('Chat generation legacy active heartbeat failed', {
        ...params,
        generationRunnerId,
        error
      });
    });
  }

  return lease;
};

/**
 * 终止指定 runner 的本地心跳，并按 token 尝试释放 Redis lease。
 * 旧 runner 调用时不会影响已经接管的新 runner。
 */
export const stopChatGenerationLease = async ({
  generationRunnerId,
  ...params
}: ChatGenerationLeaseStartParams) => {
  const leaseCacheParams = getLeaseCacheParams(params);
  const currentLease = activeLeases.get(getLeaseMapKey(params));
  if (currentLease?.generationRunnerId === generationRunnerId) {
    await currentLease.stop();
    return;
  }

  try {
    await generationLeaseCache.release({ params: leaseCacheParams, token: generationRunnerId });
  } catch (error) {
    logger.warn('Chat generation runner orphan lease release failed', {
      ...params,
      generationRunnerId,
      error
    });
  }
};

/** 返回当前进程内匹配 chat 的活动 lease；传入 runnerId 时必须精确匹配。 */
export const getActiveChatGenerationLease = (
  params: ChatGenerationLeaseParams,
  generationRunnerId?: string
) => {
  const lease = activeLeases.get(getLeaseMapKey(params));
  if (generationRunnerId && lease?.generationRunnerId !== generationRunnerId) return;
  return lease;
};

/** 返回 Redis 中的当前 runner token；cleaner 和 resume 用它判断真实运行状态。 */
export const getChatGenerationLeaseToken = (params: ChatGenerationLeaseParams) =>
  generationLeaseCache.getToken(getLeaseCacheParams(params));
