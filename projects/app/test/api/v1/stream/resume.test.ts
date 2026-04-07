import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { ChatGernateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  StreamResumeCompletedEvent,
  StreamResumePhaseEnum,
  StreamResumePhaseEvent
} from '@fastgpt/global/core/workflow/runtime/constants';
import handler from '@/pages/api/v1/stream/resume';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import {
  mirrorChatStream,
  getStreamResumeRedisKeys,
  STREAM_RESUME_TTL_SECONDS,
  STREAM_RESUME_TTL_TOUCH_INTERVAL_MS
} from '@/service/core/chat/resume';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatCrud: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/utils', async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/service/core/chat/utils')>(
    '@fastgpt/service/core/chat/utils'
  );

  return {
    ...actual,
    addPreviewUrlToChatItems: vi.fn()
  };
});

type StreamEntry = [string, string[]];

const teamId = '507f1f77bcf86cd799439011';
const appId = '507f1f77bcf86cd799439012';
const chatId = 'chat-test';
const keyOfCursor = `stream:resume:cursor:${teamId}:${appId}:${chatId}`;
const keyOfStream = `stream:resume:data:${teamId}:${appId}:${chatId}`;
const rawKeyOfStream = `${FASTGPT_REDIS_PREFIX}${keyOfStream}`;

const createFindOneResult = (data: any) =>
  ({
    lean: () => Promise.resolve(data)
  }) as any;

const createStreamEntry = (id: string, raw: string): StreamEntry => [id, ['raw', raw]];

const setupRedisStreamMock = ({
  historyItems,
  liveResponses = []
}: {
  historyItems: StreamEntry[];
  liveResponses?: ([string, StreamEntry[]][] | null)[];
}) => {
  const redis = getGlobalRedisConnection() as any;
  const blockingRedis = {
    call: vi.fn(async (...args: any[]) => {
      const command = args[0];

      if (command === 'XREAD') {
        return liveResponses.shift() ?? null;
      }

      throw new Error(`Unexpected blocking redis command: ${command}`);
    }),
    quit: vi.fn(async () => 'OK'),
    disconnect: vi.fn()
  };

  const call = vi.fn(async (...args: any[]) => {
    const command = args[0];

    if (command === 'XRANGE') {
      const [, key, start, end, ...rest] = args;
      expect(key).toBe(rawKeyOfStream);

      const countIndex = rest.findIndex((arg: string | number) => arg === 'COUNT');
      const count = countIndex >= 0 ? Number(rest[countIndex + 1]) : historyItems.length;

      if (start === '-') {
        return historyItems.slice(0, count);
      }

      if (typeof start === 'string' && start.startsWith('(')) {
        const cursor = start.slice(1);
        const startIndex = historyItems.findIndex(([id]) => id === cursor);
        return historyItems.slice(startIndex + 1, startIndex + 1 + count);
      }

      if (start === end) {
        return historyItems.filter(([id]) => id === start).slice(0, count);
      }

      const startIndex = historyItems.findIndex(([id]) => id === start);
      return historyItems.slice(startIndex, startIndex + count);
    }

    if (command === 'XLEN') {
      return historyItems.length;
    }

    if (command === 'XREVRANGE') {
      return [...historyItems].reverse().slice(0, 3);
    }

    throw new Error(`Unexpected redis command: ${command}`);
  });

  redis.call = call;
  redis.duplicate = vi.fn(() => blockingRedis);

  return {
    redis,
    call,
    blockingRedis
  };
};

const invokeStreamingHandler = async (
  query: Record<string, string>,
  { headers: reqHeaders }: { headers?: Record<string, string> } = {}
) => {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let closeHandler: (() => void) | undefined;

  const req = {
    query,
    headers: reqHeaders,
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'close') {
        closeHandler = callback;
      }
    })
  } as any;

  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn((data: string) => {
      chunks.push(data);
      return true;
    }),
    end: vi.fn(() => {
      res.writableEnded = true;
    }),
    writableEnded: false,
    destroyed: false
  } as any;

  const result = await handler(req, res);

  if (closeHandler && !res.writableEnded) {
    closeHandler();
  }

  return {
    result,
    headers,
    chunks,
    res,
    closeHandler
  };
};

describe('stream resume api', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const redis = getGlobalRedisConnection() as any;
    await redis.flushdb();
    delete redis.call;
    delete redis.duplicate;

    vi.mocked(authChatCrud).mockResolvedValue({
      teamId,
      tmbId: 'tmb-test',
      uid: 'user-test',
      showCite: true
    } as any);
    vi.mocked(addPreviewUrlToChatItems).mockResolvedValue(undefined);
  });

  it('should replay history in batches and then continue with live stream until done', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGernateStatusEnum.generating
      })
    );

    const historyItems = Array.from({ length: 51 }, (_, index) =>
      createStreamEntry(`${index + 1}-0`, `event: message\ndata: history-${index + 1}\n\n`)
    );
    const liveDoneItem = createStreamEntry('52-0', 'event: done\ndata: [DONE]\n\n');

    const { redis, call, blockingRedis } = setupRedisStreamMock({
      historyItems,
      liveResponses: [[[rawKeyOfStream, [liveDoneItem]]]]
    });

    const { result, headers, chunks, res, closeHandler } = await invokeStreamingHandler({
      teamId,
      appId,
      chatId
    });

    expect(result).toEqual({
      code: 200,
      data: undefined
    });

    expect(headers).toMatchObject({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    expect(chunks).toHaveLength(54);
    expect(chunks[0]).toBe(
      `event: ${StreamResumePhaseEvent}\ndata: ${StreamResumePhaseEnum.catchup}\n\n`
    );
    expect(chunks[1]).toBe('event: message\ndata: history-1\n\n');
    expect(chunks[51]).toBe('event: message\ndata: history-51\n\n');
    expect(chunks[52]).toBe(
      `event: ${StreamResumePhaseEvent}\ndata: ${StreamResumePhaseEnum.live}\n\n`
    );
    expect(chunks[53]).toBe('event: done\ndata: [DONE]\n\n');
    expect(chunks.join('')).toContain('history-51');
    expect(chunks.join('')).toContain('data: [DONE]');

    expect(call).toHaveBeenCalledWith('XRANGE', rawKeyOfStream, '-', '+', 'COUNT', 50);
    expect(call).toHaveBeenCalledWith('XRANGE', rawKeyOfStream, '(50-0', '+', 'COUNT', 50);
    expect(call).toHaveBeenCalledWith('XRANGE', rawKeyOfStream, '51-0', '51-0', 'COUNT', 1);
    expect(blockingRedis.call).toHaveBeenCalledWith(
      'XREAD',
      'BLOCK',
      30000,
      'COUNT',
      1,
      'STREAMS',
      rawKeyOfStream,
      '51-0'
    );
    expect(redis.duplicate).toHaveBeenCalledTimes(1);
    expect(blockingRedis.quit).toHaveBeenCalledTimes(1);
    expect(blockingRedis.disconnect).not.toHaveBeenCalled();

    expect(redis.set).toHaveBeenCalledWith(keyOfCursor, '50-0');
    expect(redis.set).toHaveBeenCalledWith(keyOfCursor, '51-0');
    expect(redis.set).toHaveBeenCalledWith(keyOfCursor, '52-0');
    expect(await redis.get(keyOfCursor)).toBe('52-0');

    expect(res.end).toHaveBeenCalledTimes(1);
    expect(closeHandler).toBeDefined();
    expect(res.writableEnded).toBe(true);
  });

  it('should mark completed chat as read and skip stream recovery', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGernateStatusEnum.done
      })
    );
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ acknowledged: true } as any);
    vi.mocked(getChatItems).mockResolvedValue({
      histories: [
        {
          dataId: 'ai-response-1',
          obj: ChatRoleEnum.AI,
          value: [
            {
              text: {
                content: 'final answer'
              }
            }
          ],
          time: new Date('2026-04-07T12:00:00.000Z')
        }
      ],
      total: 1,
      hasMorePrev: false,
      hasMoreNext: false
    } as any);

    const redis = getGlobalRedisConnection() as any;
    redis.call = vi.fn();

    const result = await Call(handler, {
      query: {
        teamId,
        appId,
        chatId
      }
    });

    expect(result).toEqual({
      code: 200,
      data: {
        hasBeenRead: true,
        chatGenerateStatus: ChatGernateStatusEnum.done,
        records: {
          list: [
            {
              dataId: 'ai-response-1',
              id: 'ai-response-1',
              obj: ChatRoleEnum.AI,
              value: [
                {
                  text: {
                    content: 'final answer'
                  }
                }
              ],
              time: new Date('2026-04-07T12:00:00.000Z')
            }
          ],
          total: 1,
          hasMorePrev: false,
          hasMoreNext: false
        }
      },
      raw: undefined
    });

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      { appId, chatId },
      { $set: { hasBeenRead: true } }
    );
    expect(getChatItems).toHaveBeenCalledWith({
      appId,
      chatId,
      field:
        'obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg responseData customFeedbacks isFeedbackRead deleteTime',
      limit: 10
    });
    expect(addPreviewUrlToChatItems).toHaveBeenCalled();
    expect(redis.call).not.toHaveBeenCalled();
  });

  it('should push completed chat records through sse when the client requested event stream', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGernateStatusEnum.done
      })
    );
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ acknowledged: true } as any);
    vi.mocked(getChatItems).mockResolvedValue({
      histories: [
        {
          dataId: 'ai-response-2',
          obj: ChatRoleEnum.AI,
          value: [
            {
              text: {
                content: 'final answer from db'
              }
            }
          ],
          time: new Date('2026-04-07T12:01:00.000Z')
        }
      ],
      total: 1,
      hasMorePrev: false,
      hasMoreNext: false
    } as any);

    const { result, headers, chunks, res } = await invokeStreamingHandler(
      {
        teamId,
        appId,
        chatId
      },
      {
        headers: {
          accept: 'text/event-stream'
        }
      }
    );

    expect(result).toEqual({
      code: 200,
      data: undefined
    });
    expect(headers['Content-Type']).toBe('text/event-stream; charset=utf-8');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatch(
      new RegExp(`^event: ${StreamResumeCompletedEvent}\\ndata: .+\\n\\n$`)
    );
    expect(chunks[1]).toBe('event: done\ndata: [DONE]\n\n');

    const payload = JSON.parse(chunks[0].replace(/^event: [^\n]+\ndata: /, '').trim()) as any;
    expect(payload).toEqual({
      hasBeenRead: true,
      chatGenerateStatus: ChatGernateStatusEnum.done,
      records: {
        list: [
          {
            dataId: 'ai-response-2',
            id: 'ai-response-2',
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: {
                  content: 'final answer from db'
                }
              }
            ],
            time: '2026-04-07T12:01:00.000Z'
          }
        ],
        total: 1,
        hasMorePrev: false,
        hasMoreNext: false
      }
    });
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});

describe('stream resume helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const redis = getGlobalRedisConnection() as any;
    await redis.flushdb();
    redis.call = vi.fn(async () => '1-0');
  });

  it('should mirror raw response writes to redis stream in order and throttle ttl refreshes', async () => {
    vi.useFakeTimers();
    try {
      const redis = getGlobalRedisConnection() as any;
      const res = {
        write: vi.fn(() => true)
      } as any;

      const mirror = mirrorChatStream({
        res,
        teamId,
        appId,
        chatId
      });

      res.write('event: answer\n');
      res.write('data: hello\n\n');

      await mirror.flush();

      expect(redis.call).toHaveBeenNthCalledWith(
        1,
        'XADD',
        `${FASTGPT_REDIS_PREFIX}${getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfStream}`,
        '*',
        'raw',
        'event: answer\n'
      );
      expect(redis.call).toHaveBeenNthCalledWith(
        2,
        'XADD',
        `${FASTGPT_REDIS_PREFIX}${getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfStream}`,
        '*',
        'raw',
        'data: hello\n\n'
      );

      expect(redis.expire).toHaveBeenCalledWith(
        getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfStream,
        STREAM_RESUME_TTL_SECONDS
      );
      expect(redis.expire).toHaveBeenCalledWith(
        getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfCursor,
        STREAM_RESUME_TTL_SECONDS
      );
      expect(redis.expire).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(STREAM_RESUME_TTL_TOUCH_INTERVAL_MS);
      res.write('event: done\ndata: [DONE]\n\n');
      await mirror.flush();

      expect(redis.expire).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should clear old stream data before a new generation starts', async () => {
    const redis = getGlobalRedisConnection() as any;
    const { keyOfCursor, keyOfStream } = getStreamResumeRedisKeys({
      teamId,
      appId,
      chatId
    });

    await redis.set(keyOfCursor, '10-0');
    await redis.set(keyOfStream, 'legacy');

    const mirror = mirrorChatStream({
      res: {
        write: vi.fn(() => true)
      } as any,
      teamId,
      appId,
      chatId
    });

    await mirror.reset();

    expect(await redis.get(keyOfCursor)).toBe('');
    expect(await redis.get(keyOfStream)).toBeNull();
  });

  it('should restore the original response write after cleanup', async () => {
    const originalWrite = vi.fn(() => true);
    const res = {
      write: originalWrite
    } as any;

    const mirror = mirrorChatStream({
      res,
      teamId,
      appId,
      chatId
    });

    expect(res.write).not.toBe(originalWrite);

    mirror.restore();

    expect(res.write).toBe(originalWrite);
  });

  it('should continue mirroring chunks after the original response is already closed', async () => {
    const redis = getGlobalRedisConnection() as any;
    const originalWrite = vi.fn(() => true);
    const res = {
      write: originalWrite,
      closed: false,
      writableEnded: false,
      destroyed: false
    } as any;

    const mirror = mirrorChatStream({
      res,
      teamId,
      appId,
      chatId
    });

    res.write('event: answer\n');
    res.closed = true;
    res.writableEnded = true;
    res.write('data: hello\n\n');

    await mirror.flush();

    expect(originalWrite).toHaveBeenCalledTimes(1);
    expect(redis.call).toHaveBeenNthCalledWith(
      1,
      'XADD',
      `${FASTGPT_REDIS_PREFIX}${getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfStream}`,
      '*',
      'raw',
      'event: answer\n'
    );
    expect(redis.call).toHaveBeenNthCalledWith(
      2,
      'XADD',
      `${FASTGPT_REDIS_PREFIX}${getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfStream}`,
      '*',
      'raw',
      'data: hello\n\n'
    );
  });
});
