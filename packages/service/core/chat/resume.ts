import { serviceEnv } from '../../env';
import { getLogger, LogCategories } from '../../common/logger';
import {
  StreamResumeCache,
  type StreamResumeActiveState as DalStreamResumeActiveState,
  type StreamResumeParams,
  type StreamResumeUnavailableState as DalStreamResumeUnavailableState
} from '@fastgpt/dal/redis/caches';
import type { NodeHttpResponse } from '../../types/http';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { StreamResumeUnavailableReasonEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const logger = getLogger(LogCategories.MODULE.CHAT.RESUME);

/** 生成中：定期续期（见 env `STREAM_RESUME_TTL_SECONDS`） */
export const STREAM_RESUME_TTL_SECONDS = serviceEnv.STREAM_RESUME_TTL_SECONDS;
/** 流结束后短 TTL（见 env `STREAM_RESUME_POST_COMPLETE_TTL_SECONDS`） */
export const STREAM_RESUME_POST_COMPLETE_TTL_SECONDS =
  serviceEnv.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS;
/** 当 Redis 已用内存 / maxmemory 达到该阈值时，停止为新请求创建镜像 */
export const STREAM_RESUME_REDIS_MAXMEMORY_RATIO = serviceEnv.STREAM_RESUME_REDIS_MAXMEMORY_RATIO;
/** Redis 内存检测缓存时间，避免每个流请求都去调用 INFO MEMORY */
export const STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS =
  serviceEnv.STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS;
/**
 * One active resume request keeps one dedicated blocking Redis connection alive for at most this
 * long before the XREAD call returns and the loop re-checks the HTTP socket state.
 */
export const STREAM_RESUME_BLOCK_MS = 30000;
export const STREAM_RESUME_TTL_TOUCH_INTERVAL_MS = 1000;
export const STREAM_RESUME_INACTIVE_MS = 2 * 60 * 1000;

const streamResumeCache = new StreamResumeCache({
  logger,
  streamTtlSeconds: STREAM_RESUME_TTL_SECONDS,
  postCompleteTtlSeconds: STREAM_RESUME_POST_COMPLETE_TTL_SECONDS,
  ttlTouchIntervalMs: STREAM_RESUME_TTL_TOUCH_INTERVAL_MS
});

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
  streamResumeCache.getKeys({ teamId, sourceType, sourceId, chatId });

export type StreamResumeUnavailableState = DalStreamResumeUnavailableState & {
  reason: `${StreamResumeUnavailableReasonEnum}`;
};
export type StreamResumeActiveState = DalStreamResumeActiveState;

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
      threshold: STREAM_RESUME_REDIS_MAXMEMORY_RATIO
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
    threshold: STREAM_RESUME_REDIS_MAXMEMORY_RATIO
  });
};

const isRedisMemoryPressureBlockingStreamResume = async () => {
  const now = Date.now();
  if (
    redisMemoryPressureCache &&
    now - redisMemoryPressureCache.checkedAt < STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS
  ) {
    return redisMemoryPressureCache.blocked;
  }

  if (redisMemoryPressurePromise) {
    return redisMemoryPressurePromise;
  }

  redisMemoryPressurePromise = (async () => {
    try {
      const { usedMemory, maxMemory } = await streamResumeCache.getMemoryInfo();
      const blocked =
        typeof usedMemory === 'number' &&
        typeof maxMemory === 'number' &&
        maxMemory > 0 &&
        usedMemory / maxMemory >= STREAM_RESUME_REDIS_MAXMEMORY_RATIO;

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
  return streamResumeCache.getUnavailable(params);
};

export const getStreamResumeActiveState = async (params: StreamResumeRedisKeysParams) => {
  return streamResumeCache.getActive(params);
};

export const isStreamResumeActiveStale = (
  state: StreamResumeActiveState | undefined,
  now = Date.now()
) => !state || now - state.updatedAt > STREAM_RESUME_INACTIVE_MS;

const chunkToString = (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) => {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString(encoding || 'utf8');
  return Buffer.from(chunk).toString(encoding || 'utf8');
};

export const mirrorChatStream = (params: StreamResumeRedisKeysParams) => {
  const mirror = streamResumeCache.createMirror(params);

  return {
    ...getStreamResumeRedisKeys(params),
    enqueueRaw: (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) =>
      mirror.enqueueRaw(chunkToString(chunk, encoding)),
    flush: mirror.flush,
    shrinkTTLAfterComplete: mirror.shrinkTTLAfterComplete
  };
};

export const getStreamResumeMirror = async ({
  resumeRequestHeaderValue,
  ...params
}: StreamResumeRedisKeysParams & { resumeRequestHeaderValue?: ResumeRequestHeaderValue }) => {
  if (!isStreamResumeMirrorRequested(resumeRequestHeaderValue)) return;

  if (await isRedisMemoryPressureBlockingStreamResume()) {
    await streamResumeCache
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

    const historyItems = await streamResumeCache.range({
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
    const currentItems = await streamResumeCache.range({
      params,
      start: cursor,
      end: cursor,
      count: 1
    });

    if (currentItems.length > 0 && isTerminalRedisStreamFields(currentItems[0].fields)) {
      return cursor;
    }
  }

  return streamResumeCache.withBlockingReader({
    params,
    blockMs: STREAM_RESUME_BLOCK_MS,
    count: 1,
    callback: async (blockingReader) => {
      while (!isResponseClosed(res)) {
        const streamId = cursor || '$';
        const streamItems = await blockingReader.read(streamId);

        if (streamItems.length === 0) {
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
