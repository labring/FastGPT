import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getChatGenerationStatuses } from './generationLease';
import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/runtime';
import { getLogger, LogCategories } from '../../common/logger';
import {
  StreamResumeCache,
  type StreamResumeParams,
  type StreamResumeUnavailableState as DalStreamResumeUnavailableState
} from '@fastgpt/dal/redis/lease/chat/streamResume';
import type { NodeHttpResponse } from '../../types/http';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { StreamResumeUnavailableReasonEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const logger = getLogger(LogCategories.MODULE.CHAT.RESUME);

/** 流恢复配置以实例配置 performance.streamResume 为唯一运行时来源，ENV 只在启动迁移时 seed。 */
const getStreamResumeConfig = () => getSystemInstanceConfig().performance.streamResume;

/** 生成中：定期续期的 TTL 秒数。 */
export const getStreamResumeTtlSeconds = () => getStreamResumeConfig().ttlSeconds;

/** 流结束后短 TTL 秒数。 */
export const getStreamResumePostCompleteTtlSeconds = () =>
  getStreamResumeConfig().postCompleteTtlSeconds;

/** 当 Redis 已用内存 / maxmemory 达到该阈值时，停止为新请求创建镜像。 */
export const getStreamResumeRedisMaxmemoryRatio = () => getStreamResumeConfig().redisMaxmemoryRatio;

/** Redis 内存检测缓存时间，避免每个流请求都去调用 INFO MEMORY。 */
const getStreamResumeRedisMemoryCheckIntervalMs = () =>
  getStreamResumeConfig().redisMemoryCheckIntervalMs;
/**
 * One active resume request keeps one dedicated blocking Redis connection alive for at most this
 * long before the XREAD call returns and the loop re-checks the HTTP socket state.
 */
export const STREAM_RESUME_BLOCK_MS = 30000;
export const STREAM_RESUME_TTL_TOUCH_INTERVAL_MS = 1000;
export const STREAM_RESUME_MIRROR_KEEPALIVE_INTERVAL_MS = Math.max(
  1_000,
  Math.min(30_000, (getStreamResumeTtlSeconds() * 1000) / 3)
);

let streamResumeCache: StreamResumeCache | undefined;
let streamResumeCacheTtlKey = '';

/**
 * TTL 是 StreamResumeCache 的构造参数，配置变化后需要重建实例。
 * Redis key 计算与缓存实例无关，重建不会影响正在进行的流恢复。
 */
const getStreamResumeCache = () => {
  const streamTtlSeconds = getStreamResumeTtlSeconds();
  const postCompleteTtlSeconds = getStreamResumePostCompleteTtlSeconds();
  const ttlKey = `${streamTtlSeconds}:${postCompleteTtlSeconds}`;

  if (!streamResumeCache || streamResumeCacheTtlKey !== ttlKey) {
    streamResumeCache = new StreamResumeCache({
      logger,
      streamTtlSeconds,
      postCompleteTtlSeconds,
      ttlTouchIntervalMs: STREAM_RESUME_TTL_TOUCH_INTERVAL_MS
    });
    streamResumeCacheTtlKey = ttlKey;
  }

  return streamResumeCache;
};

type ResumeRequestHeaderValue = string | string[] | undefined;
type RedisMemoryPressureCache = {
  checkedAt: number;
  blocked: boolean;
  usedMemory?: number;
  maxMemory?: number;
};

let redisMemoryPressureCache: RedisMemoryPressureCache | undefined;
let redisMemoryPressurePromise: Promise<boolean> | undefined;
let lastLoggedMemoryPressureState: boolean | undefined;

export type StreamResumeRedisKeysParams = StreamResumeParams & {
  sourceType: ChatSourceTypeEnum;
};

export const getStreamResumeRedisKeys = ({
  teamId,
  sourceType,
  sourceId,
  chatId
}: StreamResumeRedisKeysParams) =>
  getStreamResumeCache().getKeys({ teamId, sourceType, sourceId, chatId });

export type StreamResumeUnavailableState = DalStreamResumeUnavailableState & {
  reason: `${StreamResumeUnavailableReasonEnum}`;
};

const resumeRequestEnabledValues = new Set(['1', 'true', 'yes', 'on']);

const getNormalizedHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0]?.trim().toLowerCase();
  }
  return value?.trim().toLowerCase();
};

export const isStreamResumeMirrorRequested = (headerValue?: ResumeRequestHeaderValue) => {
  const normalizedHeaderValue = getNormalizedHeaderValue(headerValue);
  if (!normalizedHeaderValue) return false;

  return resumeRequestEnabledValues.has(normalizedHeaderValue);
};

const logRedisMemoryPressureState = (cache: RedisMemoryPressureCache) => {
  if (lastLoggedMemoryPressureState === cache.blocked) return;

  const usageRatio =
    cache.maxMemory && cache.maxMemory > 0 && cache.usedMemory !== undefined
      ? Number((cache.usedMemory / cache.maxMemory).toFixed(4))
      : undefined;

  if (cache.blocked) {
    lastLoggedMemoryPressureState = true;
    logger.warn('Disabling new stream resume mirrors due to Redis memory pressure', {
      usedMemory: cache.usedMemory,
      maxMemory: cache.maxMemory,
      usageRatio,
      threshold: getStreamResumeRedisMaxmemoryRatio()
    });
    return;
  }

  if (lastLoggedMemoryPressureState === undefined) {
    lastLoggedMemoryPressureState = false;
    return;
  }

  lastLoggedMemoryPressureState = false;
  logger.info('Redis memory pressure recovered; stream resume mirror creation resumed', {
    usedMemory: cache.usedMemory,
    maxMemory: cache.maxMemory,
    usageRatio,
    threshold: getStreamResumeRedisMaxmemoryRatio()
  });
};

const isRedisMemoryPressureBlockingStreamResume = async () => {
  const now = Date.now();
  if (
    redisMemoryPressureCache &&
    now - redisMemoryPressureCache.checkedAt < getStreamResumeRedisMemoryCheckIntervalMs()
  ) {
    return redisMemoryPressureCache.blocked;
  }

  if (redisMemoryPressurePromise) {
    return redisMemoryPressurePromise;
  }

  redisMemoryPressurePromise = (async () => {
    try {
      const { usedMemory, maxMemory } = await getStreamResumeCache().getMemoryInfo();
      const blocked =
        typeof usedMemory === 'number' &&
        typeof maxMemory === 'number' &&
        maxMemory > 0 &&
        usedMemory / maxMemory >= getStreamResumeRedisMaxmemoryRatio();

      redisMemoryPressureCache = {
        checkedAt: now,
        blocked,
        usedMemory,
        maxMemory
      };
      logRedisMemoryPressureState(redisMemoryPressureCache);

      return blocked;
    } catch (error) {
      logger.warn('Failed to inspect Redis memory pressure for stream resume mirror', { error });

      if (redisMemoryPressureCache) {
        return redisMemoryPressureCache.blocked;
      }

      return false;
    } finally {
      redisMemoryPressurePromise = undefined;
    }
  })();

  return redisMemoryPressurePromise;
};

export const resetStreamResumeMirrorGuardForTest = () => {
  redisMemoryPressureCache = undefined;
  redisMemoryPressurePromise = undefined;
  lastLoggedMemoryPressureState = undefined;
};

const isResponseClosed = (res: NodeHttpResponse) =>
  !!(res.closed || res.writableEnded || res.destroyed);

export const getStreamResumeUnavailableState = async (params: StreamResumeRedisKeysParams) => {
  return getStreamResumeCache().getUnavailable(params);
};

const chunkToString = (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) => {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString(encoding || 'utf8');
  return Buffer.from(chunk).toString(encoding || 'utf8');
};

export const mirrorChatStream = (params: StreamResumeRedisKeysParams) => {
  const mirror = getStreamResumeCache().createMirror(params);

  return {
    ...getStreamResumeRedisKeys(params),
    enqueueRaw: (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) =>
      mirror.enqueueRaw(chunkToString(chunk, encoding)),
    touch: mirror.touch,
    flush: mirror.flush,
    shrinkTTLAfterComplete: mirror.shrinkTTLAfterComplete
  };
};

/**
 * Resume mirror 的 TTL 由执行体保活，不能依赖客户端 SSE 连接。
 * 客户端断开后仍持续续期，直到 workflow/auxiliary generation 收尾。
 */
export const startStreamResumeMirrorKeepAlive = (
  mirror: { touch?: () => Promise<void> } | undefined
) => {
  const touch = mirror?.touch;
  if (!touch) return () => undefined;

  const timer = setInterval(() => {
    void touch().catch((error) => {
      logger.warn('Stream resume mirror keepalive failed', { error });
    });
  }, STREAM_RESUME_MIRROR_KEEPALIVE_INTERVAL_MS);
  timer.unref?.();

  return () => clearInterval(timer);
};

export const getStreamResumeMirror = async ({
  resumeRequestHeaderValue,
  ...params
}: StreamResumeRedisKeysParams & { resumeRequestHeaderValue?: ResumeRequestHeaderValue }) => {
  if (!isStreamResumeMirrorRequested(resumeRequestHeaderValue)) return;

  if (await isRedisMemoryPressureBlockingStreamResume()) {
    await getStreamResumeCache()
      .setUnavailable(params, {
        reason: StreamResumeUnavailableReasonEnum.memoryPressure
      })
      .catch((error) => {
        logger.warn('Failed to persist stream resume unavailable state', { params, error });
      });
    return;
  }

  return mirrorChatStream(params);
};

type RedisStreamFields = Record<string, string>;

const isTerminalRedisStreamFields = (fields: RedisStreamFields) => {
  if (fields.event === 'done' || fields.event === 'error') return true;
  if (fields.data === '[DONE]') return true;
  if (fields.raw?.includes('data: [DONE]')) return true;
  return false;
};

const writeRedisStreamFields = ({
  res,
  fields
}: {
  res: NodeHttpResponse;
  fields: RedisStreamFields;
}) => {
  if (isResponseClosed(res)) return;

  if (fields.raw !== undefined) {
    res.write(fields.raw);
    return;
  }

  let chunk = '';
  if (fields.event) {
    chunk += `event: ${fields.event}\n`;
  }
  chunk += `data: ${fields.data ?? ''}\n\n`;
  res.write(chunk);
};

type ResumeBaseParams = StreamResumeRedisKeysParams & {
  res: NodeHttpResponse;
};

/**
 * Replay the mirrored stream from the beginning for this HTTP connection only.
 * Does not read or write the shared Redis cursor key so multiple tabs / refresh-during-resume
 * each receive the full buffered stream, then pass `lastStreamId` to `_resume` for live tail.
 */
export const catchUpAllHistoryItems = async ({
  res,
  maxReplayLength = 50,
  ...params
}: ResumeBaseParams & { maxReplayLength?: number }) => {
  let lastStreamId = '';

  while (!isResponseClosed(res)) {
    const rangeStart = lastStreamId ? `(${lastStreamId}` : '-';

    const historyItems = await getStreamResumeCache().range({
      params,
      start: rangeStart,
      end: '+',
      count: maxReplayLength
    });

    if (historyItems.length === 0) {
      return lastStreamId;
    }

    for (const { id: streamId, fields } of historyItems) {
      lastStreamId = streamId;

      writeRedisStreamFields({
        res,
        fields
      });

      if (isResponseClosed(res)) {
        break;
      }
    }

    if (historyItems.length < maxReplayLength || isResponseClosed(res)) {
      return lastStreamId;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return lastStreamId;
};

export const _resume = async ({
  res,
  cursor: initialCursor,
  ...params
}: ResumeBaseParams & { cursor?: string }) => {
  let cursor = initialCursor ?? '';

  if (cursor) {
    const currentItems = await getStreamResumeCache().range({
      params,
      start: cursor,
      end: cursor,
      count: 1
    });

    if (currentItems.length > 0 && isTerminalRedisStreamFields(currentItems[0].fields)) {
      return cursor;
    }
  }

  return getStreamResumeCache().withBlockingReader({
    params,
    blockMs: STREAM_RESUME_BLOCK_MS,
    count: 1,
    callback: async (blockingReader) => {
      while (!isResponseClosed(res)) {
        const streamId = cursor || '$';
        const streamItems = await blockingReader.read(streamId);

        if (streamItems.length === 0) {
          // Redis Stream 无终止事件时也要检查生成租约，避免进程退出后恢复连接永久等待。
          // 读取异常也按空闲结束本次恢复；Redis 恢复且原 lease 有效时，后续发送冲突可触发客户端重新恢复。
          const statuses = await getChatGenerationStatuses({
            ...params,
            chatIds: [params.chatId]
          });
          if (statuses.get(params.chatId) !== ChatGenerateStatusEnum.generating) return cursor;
          continue;
        }

        for (const { id: streamItemId, fields } of streamItems) {
          cursor = streamItemId;

          writeRedisStreamFields({
            res,
            fields
          });

          if (isTerminalRedisStreamFields(fields) || isResponseClosed(res)) {
            return cursor;
          }
        }
      }

      return cursor;
    }
  });
};
