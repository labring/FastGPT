import type { NextApiResponse } from 'next';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { StreamResumeMirrorActive } from '@fastgpt/global/core/workflow/runtime/constants';

const logger = getLogger(LogCategories.MODULE.CHAT.RESUME);

export const STREAM_RESUME_TTL_SECONDS = 60 * 60;
export const STREAM_RESUME_BLOCK_MS = 30000;
export const STREAM_RESUME_TTL_TOUCH_INTERVAL_MS = 1000;

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
  keyOfCursor: `stream:resume:cursor:${teamId}:${appId}:${chatId}`,
  keyOfStream: `stream:resume:data:${teamId}:${appId}:${chatId}`
});

type StreamResumeKeys = ReturnType<typeof getStreamResumeRedisKeys>;

const getRawRedisKey = (key: string) => `${FASTGPT_REDIS_PREFIX}${key}`;

const getStreamResumeRedisRawKeys = (keys: StreamResumeKeys) => ({
  rawKeyOfCursor: getRawRedisKey(keys.keyOfCursor),
  rawKeyOfStream: getRawRedisKey(keys.keyOfStream)
});

const touchStreamResumeTTL = async ({ keyOfCursor, keyOfStream }: StreamResumeKeys) => {
  const redis = getGlobalRedisConnection();

  await Promise.all([
    redis.expire(keyOfStream, STREAM_RESUME_TTL_SECONDS),
    redis.expire(keyOfCursor, STREAM_RESUME_TTL_SECONDS)
  ]);
};

const initStreamResumeCursor = async ({ keyOfCursor }: StreamResumeKeys) => {
  const redis = getGlobalRedisConnection();

  await redis.set(keyOfCursor, '', 'EX', STREAM_RESUME_TTL_SECONDS);
};

const chunkToString = (chunk: string | Buffer | Uint8Array, encoding?: BufferEncoding) => {
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk)) return chunk.toString(encoding || 'utf8');
  return Buffer.from(chunk).toString(encoding || 'utf8');
};

export const mirrorChatStream = ({
  res,
  ...params
}: {
  res: NextApiResponse;
  teamId: string;
  appId: string;
  chatId: string;
}) => {
  const redis = getGlobalRedisConnection();
  const keys = getStreamResumeRedisKeys(params);
  const rawKeys = getStreamResumeRedisRawKeys(keys);

  const _write_stash = res.write;
  const _write_fn = res.write.bind(res);
  let queue = Promise.resolve();
  let lastTouchedAt = 0;
  let _res = res as NextApiResponse & {
    write: typeof res.write;
    [StreamResumeMirrorActive]?: boolean;
  };

  const _enqueue = (chunk: string) => {
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

  _res[StreamResumeMirrorActive] = true;
  _res.write = ((chunk: any, ...args: any[]) => {
    if (chunk !== undefined && chunk !== null) {
      const encoding = typeof args[0] === 'string' ? (args[0] as BufferEncoding) : undefined;
      void _enqueue(chunkToString(chunk, encoding));
    }

    if (_res.writableEnded || _res.destroyed || _res.closed) {
      return true;
    }

    try {
      return _write_fn(chunk, ...(args as []));
    } catch (error) {
      logger.warn('Skip writing mirrored stream chunk to closed response', {
        params,
        error
      });
      return true;
    }
  }) as typeof res.write;

  return {
    ...keys,
    reset: async () => {
      try {
        await Promise.all([
          redis.del(keys.keyOfStream, keys.keyOfCursor),
          // Clean up legacy keys written before we switched raw stream commands to use the prefixed key.
          redis.call('DEL', keys.keyOfStream, keys.keyOfCursor)
        ]);
        await initStreamResumeCursor(keys);
      } catch (error) {
        logger.error('Failed to reset stream resume redis keys', { params, error });
      }
    },
    flush: async () => {
      await queue;
    },
    restore: () => {
      delete _res[StreamResumeMirrorActive];
      _res.write = _write_stash;
    }
  };
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
  if (res.writableEnded || res.destroyed) return;

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

export const catchUpAllHistoryItems = async ({
  res,
  maxReplayLength = 50,
  ...params
}: ResumeBaseParams & { maxReplayLength?: number }) => {
  const redis = getGlobalRedisConnection();
  const keys = getStreamResumeRedisKeys(params);
  const { rawKeyOfStream } = getStreamResumeRedisRawKeys(keys);

  let cursor = (await redis.get(keys.keyOfCursor)) || '';

  while (!res.writableEnded && !res.destroyed) {
    const rangeStart = cursor ? `(${cursor}` : '-';

    const historyItems = (await redis.call(
      'XRANGE',
      rawKeyOfStream,
      rangeStart,
      '+',
      'COUNT',
      maxReplayLength
    )) as XRangeResponse;

    if (historyItems.length === 0) {
      return cursor;
    }

    for (const [streamId, rawFields] of historyItems) {
      cursor = streamId;
      const fields = parseRedisStreamFields(rawFields);

      writeRedisStreamFields({
        res,
        fields
      });

      if (res.writableEnded || res.destroyed) {
        break;
      }
    }

    if (cursor) {
      await redis.set(keys.keyOfCursor, cursor);
      await touchStreamResumeTTL(keys);
    }

    if (historyItems.length < maxReplayLength || res.writableEnded || res.destroyed) {
      return cursor;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return cursor;
};

type XReadResponse = [string, [string, string[]][]][] | null;

export const _resume = async ({
  res,
  cursor: initialCursor,
  ...params
}: ResumeBaseParams & { cursor?: string }) => {
  const redis = getGlobalRedisConnection();
  const blockingRedis = redis.duplicate();
  const keys = getStreamResumeRedisKeys(params);
  const { rawKeyOfStream } = getStreamResumeRedisRawKeys(keys);

  try {
    let cursor = initialCursor ?? ((await redis.get(keys.keyOfCursor)) || '');

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

    while (!res.writableEnded && !res.destroyed) {
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

        await redis.set(keys.keyOfCursor, cursor);
        await touchStreamResumeTTL(keys);

        if (isTerminalRedisStreamFields(fields) || res.writableEnded || res.destroyed) {
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
