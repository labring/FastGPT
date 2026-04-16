import { env } from '../../env';
import { getLogger, LogCategories } from '../../common/logger';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '../../common/redis';
import type { NextApiResponse } from 'next';

const logger = getLogger(LogCategories.MODULE.CHAT.RESUME);

/** 生成中：定期续期（见 env `STREAM_RESUME_TTL_SECONDS`） */
export const STREAM_RESUME_TTL_SECONDS = env.STREAM_RESUME_TTL_SECONDS;
/** 流结束后短 TTL（见 env `STREAM_RESUME_POST_COMPLETE_TTL_SECONDS`） */
export const STREAM_RESUME_POST_COMPLETE_TTL_SECONDS = env.STREAM_RESUME_POST_COMPLETE_TTL_SECONDS;
/** 当 Redis 已用内存 / maxmemory 达到该阈值时，停止为新请求创建镜像 */
export const STREAM_RESUME_REDIS_MAXMEMORY_RATIO = env.STREAM_RESUME_REDIS_MAXMEMORY_RATIO;
/** Redis 内存检测缓存时间，避免每个流请求都去调用 INFO MEMORY */
export const STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS =
  env.STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS;
/**
 * One active resume request keeps one dedicated blocking Redis connection alive for at most this
 * long before the XREAD call returns and the loop re-checks the HTTP socket state.
 */
export const STREAM_RESUME_BLOCK_MS = 30000;
export const STREAM_RESUME_TTL_TOUCH_INTERVAL_MS = 1000;

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

type StreamResumeRedisKeysParams = {
  teamId: string;
  appId: string;
  chatId: string;
};

export const getStreamResumeRedisKeys = ({
  teamId,
  appId,
  chatId
}: StreamResumeRedisKeysParams) => ({
  keyOfStream: `stream:resume:data:${teamId}:${appId}:${chatId}`
});

type StreamResumeKeys = ReturnType<typeof getStreamResumeRedisKeys>;

const getRawRedisKey = (key: string) => `${FASTGPT_REDIS_PREFIX}${key}`;

const getStreamResumeRedisRawKeys = (keys: StreamResumeKeys) => ({
  rawKeyOfStream: getRawRedisKey(keys.keyOfStream)
});

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

const parseRedisInfoNumber = (info: string, key: string) => {
  const match = info.match(new RegExp(`(?:^|\\r?\\n)${key}:(\\d+)`));
  if (!match) return undefined;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
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
      const redis = getGlobalRedisConnection();
      const info = await redis.info('memory');
      const usedMemory = parseRedisInfoNumber(info, 'used_memory');
      const maxMemory = parseRedisInfoNumber(info, 'maxmemory');
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

const isResponseClosed = (res: NextApiResponse) =>
  !!(res.closed || res.writableEnded || res.destroyed);

const touchStreamResumeTTL = async ({ keyOfStream }: StreamResumeKeys) => {
  const redis = getGlobalRedisConnection();
  await redis.expire(keyOfStream, STREAM_RESUME_TTL_SECONDS);
};

const shrinkStreamResumeTTL = async ({ keyOfStream }: StreamResumeKeys) => {
  const redis = getGlobalRedisConnection();
  await redis.expire(keyOfStream, STREAM_RESUME_POST_COMPLETE_TTL_SECONDS);
};

const chunkToString = (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) => {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString(encoding || 'utf8');
  return Buffer.from(chunk).toString(encoding || 'utf8');
};

/** 新一轮流式开始前清空 Redis 镜像，否则 XADD 会接在旧 Stream 后面，续传会重复历史 */
const clearStreamResumeMirrorKeys = async (keys: StreamResumeKeys) => {
  const redis = getGlobalRedisConnection();
  await redis.del(keys.keyOfStream);
};

export const mirrorChatStream = (params: StreamResumeRedisKeysParams) => {
  const redis = getGlobalRedisConnection();
  const keys = getStreamResumeRedisKeys(params);
  const rawKeys = getStreamResumeRedisRawKeys(keys);
  /** 先清空上一轮镜像，再顺序 XADD；首个 chunk 一定排在清空之后 */
  let queue: Promise<void> = clearStreamResumeMirrorKeys(keys).catch((error) => {
    logger.error('Failed to clear stream resume redis keys before mirror', { params, error });
  });
  let lastTouchedAt = 0;

  const enqueueRaw = (chunk: string) => {
    queue = queue
      .then(async () => {
        await redis.call('XADD', rawKeys.rawKeyOfStream, '*', 'raw', chunk);
        const now = Date.now();
        if (lastTouchedAt === 0 || now - lastTouchedAt >= STREAM_RESUME_TTL_TOUCH_INTERVAL_MS) {
          await touchStreamResumeTTL(keys);
          lastTouchedAt = now;
        }
      })
      .catch((error) => {
        logger.error('Failed to mirror stream response to redis', { params, error });
      });

    return queue;
  };

  return {
    ...keys,
    enqueueRaw: (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) =>
      enqueueRaw(chunkToString(chunk, encoding)),
    flush: async () => {
      await queue;
    },
    /** 队列刷完后调用：把续期从「生成中长 TTL」改为「结束后短 TTL」，否则最后一次 touch 仍会长留 30min */
    shrinkTTLAfterComplete: async () => {
      try {
        await shrinkStreamResumeTTL(keys);
      } catch (error) {
        logger.error('Failed to shrink stream resume redis ttl', { params, error });
      }
    }
  };
};

export const getStreamResumeMirror = async ({
  resumeRequestHeaderValue,
  ...params
}: StreamResumeRedisKeysParams & { resumeRequestHeaderValue?: ResumeRequestHeaderValue }) => {
  if (!isStreamResumeMirrorRequested(resumeRequestHeaderValue)) return;

  if (await isRedisMemoryPressureBlockingStreamResume()) {
    return;
  }

  return mirrorChatStream(params);
};

type RedisStreamFields = Record<string, string>;

const parseRedisStreamFields = (rawFields: string[]) => {
  const fields: RedisStreamFields = {};

  for (let i = 0; i < rawFields.length; i += 2) {
    const key = rawFields[i];
    const value = rawFields[i + 1] ?? '';
    fields[key] = value;
  }

  return fields;
};

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
  res: NextApiResponse;
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
  res: NextApiResponse;
};

type XRangeResponse = [string, string[]][];

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
  const redis = getGlobalRedisConnection();
  const keys = getStreamResumeRedisKeys(params);
  const { rawKeyOfStream } = getStreamResumeRedisRawKeys(keys);

  let lastStreamId = '';

  while (!isResponseClosed(res)) {
    const rangeStart = lastStreamId ? `(${lastStreamId}` : '-';

    const historyItems = (await redis.call(
      'XRANGE',
      rawKeyOfStream,
      rangeStart,
      '+',
      'COUNT',
      maxReplayLength
    )) as XRangeResponse;

    if (historyItems.length === 0) {
      return lastStreamId;
    }

    for (const [streamId, rawFields] of historyItems) {
      lastStreamId = streamId;
      const fields = parseRedisStreamFields(rawFields);

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

type XReadResponse = [string, [string, string[]][]][] | null;

export const _resume = async ({
  res,
  cursor: initialCursor,
  ...params
}: ResumeBaseParams & { cursor?: string }) => {
  const redis = getGlobalRedisConnection();
  // BLOCK reserves the socket until data arrives or timeout, so each in-flight resume uses a
  // dedicated duplicated Redis connection. If high-concurrency deployments hit connection limits,
  // consider fan-out or a shared blocking pool in a follow-up refactor.
  const blockingRedis = redis.duplicate();
  const keys = getStreamResumeRedisKeys(params);
  const { rawKeyOfStream } = getStreamResumeRedisRawKeys(keys);

  try {
    let cursor = initialCursor ?? '';

    if (cursor) {
      const currentItem = (await redis.call(
        'XRANGE',
        rawKeyOfStream,
        cursor,
        cursor,
        'COUNT',
        1
      )) as XRangeResponse;

      if (currentItem.length > 0) {
        const [, rawFields] = currentItem[0];
        const fields = parseRedisStreamFields(rawFields);

        if (isTerminalRedisStreamFields(fields)) {
          return cursor;
        }
      }
    }

    while (!isResponseClosed(res)) {
      const streamId = cursor || '$';
      const result = (await blockingRedis.call(
        'XREAD',
        'BLOCK',
        STREAM_RESUME_BLOCK_MS,
        'COUNT',
        1,
        'STREAMS',
        rawKeyOfStream,
        streamId
      )) as XReadResponse;

      if (!result || result.length === 0) {
        continue;
      }

      const [, streamItems] = result[0] || [];
      if (!streamItems?.length) {
        continue;
      }

      for (const [streamItemId, rawFields] of streamItems) {
        cursor = streamItemId;

        const fields = parseRedisStreamFields(rawFields);

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
  } finally {
    try {
      await blockingRedis.quit();
    } catch {
      blockingRedis.disconnect();
    }
  }
};
