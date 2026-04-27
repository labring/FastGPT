import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Call } from '@test/utils/request';
import { FASTGPT_REDIS_PREFIX, getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { ChatGenerateStatusEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  StreamResumeCompletedEvent,
  StreamResumePhaseEnum,
  StreamResumePhaseEvent,
  StreamResumeUnavailableEvent,
  StreamResumeUnavailableReasonEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import handler from '@/pages/api/core/chat/resume';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import {
  getStreamResumeMirror,
  isStreamResumeMirrorRequested,
  mirrorChatStream,
  resetStreamResumeMirrorGuardForTest,
  getStreamResumeRedisKeys,
  STREAM_RESUME_POST_COMPLETE_TTL_SECONDS,
  STREAM_RESUME_REDIS_MAXMEMORY_RATIO,
  STREAM_RESUME_TTL_SECONDS,
  STREAM_RESUME_TTL_TOUCH_INTERVAL_MS
} from '@fastgpt/service/core/chat/resume';

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
  let statusCode = 200;
  let jsonPayload: any;
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
      res.writableFinished = true;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      jsonPayload = data;
      headers['Content-Type'] ??= 'application/json';
      res.writableEnded = true;
      res.writableFinished = true;
      return res;
    }),
    statusCode,
    writableEnded: false,
    writableFinished: false,
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
    statusCode,
    jsonPayload,
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
        chatGenerateStatus: ChatGenerateStatusEnum.generating
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

    const { result, headers, chunks, res, closeHandler } = await invokeStreamingHandler(
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

    expect(res.end).toHaveBeenCalledTimes(1);
    expect(closeHandler).toBeDefined();
    expect(res.writableEnded).toBe(true);
  });

  it('should mark completed chat as read and skip stream recovery', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGenerateStatusEnum.done
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
        chatGenerateStatus: ChatGenerateStatusEnum.done,
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

  it('should reject non-sse resume requests while the chat is still generating', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGenerateStatusEnum.generating
      })
    );

    const redis = getGlobalRedisConnection() as any;
    redis.call = vi.fn();
    redis.duplicate = vi.fn();

    const { statusCode, jsonPayload, chunks, headers, res } = await invokeStreamingHandler({
      teamId,
      appId,
      chatId
    });

    expect(statusCode).toBe(406);
    expect(jsonPayload).toMatchObject({
      code: 406,
      statusText: 'error',
      message:
        'This chat is still generating. Retry /api/core/chat/resume with Accept: text/event-stream.',
      data: null
    });
    expect(headers['Content-Type']).toBe('application/json');
    expect(chunks).toHaveLength(0);
    expect(res.write).not.toHaveBeenCalled();
    expect(redis.call).not.toHaveBeenCalled();
    expect(redis.duplicate).not.toHaveBeenCalled();
  });

  it('should push completed chat records through sse when the client requested event stream', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGenerateStatusEnum.done
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
      chatGenerateStatus: ChatGenerateStatusEnum.done,
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

  it('should emit a resume unavailable event and later push completed chat records', async () => {
    vi.useFakeTimers();
    try {
      const chatStates = [
        {
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating
        },
        {
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating
        },
        {
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.done
        },
        {
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.done
        }
      ];

      vi.mocked(MongoChat.findOne).mockImplementation(() =>
        createFindOneResult(chatStates.shift())
      );
      vi.mocked(MongoChat.updateOne).mockResolvedValue({ acknowledged: true } as any);
      vi.mocked(getChatItems).mockResolvedValue({
        histories: [
          {
            dataId: 'ai-response-pressure',
            obj: ChatRoleEnum.AI,
            value: [
              {
                text: {
                  content: 'final answer after pressure recovered'
                }
              }
            ],
            time: new Date('2026-04-07T12:02:00.000Z')
          }
        ],
        total: 1,
        hasMorePrev: false,
        hasMoreNext: false
      } as any);

      const redis = getGlobalRedisConnection() as any;
      const usedMemory = Math.ceil(STREAM_RESUME_REDIS_MAXMEMORY_RATIO * 100) + 1;
      redis.info = vi.fn().mockResolvedValue(`used_memory:${usedMemory}\r\nmaxmemory:100\r\n`);

      await getStreamResumeMirror({
        resumeRequestHeaderValue: 'true',
        teamId,
        appId,
        chatId
      });

      redis.call = vi.fn();
      redis.duplicate = vi.fn();

      const responsePromise = invokeStreamingHandler(
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

      await vi.runAllTimersAsync();

      const { chunks, res } = await responsePromise;

      expect(chunks).toHaveLength(5);
      expect(chunks[0]).toBe(
        `event: ${StreamResumePhaseEvent}\ndata: ${StreamResumePhaseEnum.catchup}\n\n`
      );
      expect(chunks[1]).toBe(
        `event: ${StreamResumeUnavailableEvent}\ndata: ${JSON.stringify({
          reason: StreamResumeUnavailableReasonEnum.memoryPressure
        })}\n\n`
      );
      expect(chunks[2]).toBe(': ping\n\n');
      expect(chunks[3]).toMatch(
        new RegExp(`^event: ${StreamResumeCompletedEvent}\\ndata: .+\\n\\n$`)
      );
      expect(chunks[4]).toBe('event: done\ndata: [DONE]\n\n');

      const payload = JSON.parse(chunks[3].replace(/^event: [^\n]+\ndata: /, '').trim()) as any;
      expect(payload).toEqual({
        hasBeenRead: true,
        chatGenerateStatus: ChatGenerateStatusEnum.done,
        records: {
          list: [
            {
              dataId: 'ai-response-pressure',
              id: 'ai-response-pressure',
              obj: ChatRoleEnum.AI,
              value: [
                {
                  text: {
                    content: 'final answer after pressure recovered'
                  }
                }
              ],
              time: '2026-04-07T12:02:00.000Z'
            }
          ],
          total: 1,
          hasMorePrev: false,
          hasMoreNext: false
        }
      });
      expect(MongoChat.updateOne).toHaveBeenCalledWith(
        { appId, chatId },
        { $set: { hasBeenRead: true } }
      );
      expect(redis.call).not.toHaveBeenCalled();
      expect(redis.duplicate).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop waiting after the resume ttl while keeping the sse connection alive', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(MongoChat.findOne).mockImplementation(() =>
        createFindOneResult({
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating
        })
      );

      const redis = getGlobalRedisConnection() as any;
      const usedMemory = Math.ceil(STREAM_RESUME_REDIS_MAXMEMORY_RATIO * 100) + 1;
      redis.info = vi.fn().mockResolvedValue(`used_memory:${usedMemory}\r\nmaxmemory:100\r\n`);

      await getStreamResumeMirror({
        resumeRequestHeaderValue: 'true',
        teamId,
        appId,
        chatId
      });

      redis.call = vi.fn();
      redis.duplicate = vi.fn();

      const responsePromise = invokeStreamingHandler(
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

      await vi.advanceTimersByTimeAsync(STREAM_RESUME_TTL_SECONDS * 1000 + 1);

      const { chunks, res } = await responsePromise;

      expect(chunks[0]).toBe(
        `event: ${StreamResumePhaseEvent}\ndata: ${StreamResumePhaseEnum.catchup}\n\n`
      );
      expect(chunks[1]).toBe(
        `event: ${StreamResumeUnavailableEvent}\ndata: ${JSON.stringify({
          reason: StreamResumeUnavailableReasonEnum.memoryPressure
        })}\n\n`
      );
      expect(chunks.some((chunk) => chunk === ': ping\n\n')).toBe(true);
      expect(
        chunks.some((chunk) => chunk.startsWith(`event: ${StreamResumeCompletedEvent}\n`))
      ).toBe(false);
      expect(chunks[chunks.length - 1]).toBe('event: done\ndata: [DONE]\n\n');
      expect(MongoChat.updateOne).not.toHaveBeenCalled();
      expect(getChatItems).not.toHaveBeenCalled();
      expect(redis.call).not.toHaveBeenCalled();
      expect(redis.duplicate).not.toHaveBeenCalled();
      expect(res.end).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should forward share auth params to authChatCrud when resuming a shared chat', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValue(
      createFindOneResult({
        hasBeenRead: false,
        chatGenerateStatus: ChatGenerateStatusEnum.done
      })
    );
    vi.mocked(MongoChat.updateOne).mockResolvedValue({ acknowledged: true } as any);
    vi.mocked(getChatItems).mockResolvedValue({
      histories: [],
      total: 0,
      hasMorePrev: false,
      hasMoreNext: false
    } as any);

    await Call(handler, {
      query: {
        appId,
        chatId,
        shareId: 'share-test',
        outLinkUid: 'outlink-user'
      }
    });

    expect(authChatCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        chatId,
        shareId: 'share-test',
        outLinkUid: 'outlink-user',
        authToken: true
      })
    );
  });
});

describe('stream resume helpers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const redis = getGlobalRedisConnection() as any;
    await redis.flushdb();
    redis.call = vi.fn(async () => '1-0');
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStreamResumeMirrorGuardForTest();
  });

  it('should mirror raw response writes to redis stream in order and throttle ttl refreshes', async () => {
    vi.useFakeTimers();
    try {
      const redis = getGlobalRedisConnection() as any;
      redis.del.mockClear?.();

      const mirror = mirrorChatStream({
        teamId,
        appId,
        chatId
      });

      await mirror.enqueueRaw('event: answer\n');
      await mirror.enqueueRaw('data: hello\n\n');

      await mirror.flush();

      const keys = getStreamResumeRedisKeys({ teamId, appId, chatId });
      const rawStream = `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`;

      expect(redis.del).toHaveBeenCalledWith(keys.keyOfUnavailable);
      expect(redis.del).toHaveBeenCalledWith(keys.keyOfStream);
      expect(redis.call).toHaveBeenNthCalledWith(
        1,
        'XADD',
        rawStream,
        '*',
        'raw',
        'event: answer\n'
      );
      expect(redis.call).toHaveBeenNthCalledWith(
        2,
        'XADD',
        rawStream,
        '*',
        'raw',
        'data: hello\n\n'
      );

      expect(redis.expire).toHaveBeenCalledWith(keys.keyOfStream, STREAM_RESUME_TTL_SECONDS);
      expect(redis.expire).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(STREAM_RESUME_TTL_TOUCH_INTERVAL_MS);
      await mirror.enqueueRaw('event: done\ndata: [DONE]\n\n');
      await mirror.flush();

      expect(redis.expire).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should set short ttl after shrinkTTLAfterComplete', async () => {
    const redis = getGlobalRedisConnection() as any;
    const keys = getStreamResumeRedisKeys({ teamId, appId, chatId });
    const mirror = mirrorChatStream({ teamId, appId, chatId });
    await mirror.enqueueRaw('data: x\n\n');
    await mirror.flush();
    redis.expire.mockClear?.();
    await mirror.shrinkTTLAfterComplete();
    expect(redis.expire).toHaveBeenCalledWith(
      keys.keyOfStream,
      STREAM_RESUME_POST_COMPLETE_TTL_SECONDS
    );
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('should clear old redis mirror when mirror starts (before first chunk)', async () => {
    const redis = getGlobalRedisConnection() as any;
    redis.del.mockClear?.();
    const { keyOfStream } = getStreamResumeRedisKeys({
      teamId,
      appId,
      chatId
    });

    await redis.set(keyOfStream, 'legacy');

    const mirror = mirrorChatStream({
      teamId,
      appId,
      chatId
    });

    await mirror.flush();

    expect(redis.del).toHaveBeenCalledWith(keyOfStream);
    expect(await redis.get(keyOfStream)).toBeFalsy();
  });

  it('should continue mirroring chunks after the original response is already closed', async () => {
    const redis = getGlobalRedisConnection() as any;
    redis.del.mockClear?.();

    const mirror = mirrorChatStream({
      teamId,
      appId,
      chatId
    });

    await mirror.enqueueRaw('event: answer\n');
    await mirror.enqueueRaw('data: hello\n\n');

    await mirror.flush();

    const keys = getStreamResumeRedisKeys({ teamId, appId, chatId });
    const rawStream = `${FASTGPT_REDIS_PREFIX}${keys.keyOfStream}`;

    expect(redis.del).toHaveBeenCalledWith(keys.keyOfUnavailable);
    expect(redis.del).toHaveBeenCalledWith(keys.keyOfStream);
    expect(redis.call).toHaveBeenNthCalledWith(1, 'XADD', rawStream, '*', 'raw', 'event: answer\n');
    expect(redis.call).toHaveBeenNthCalledWith(2, 'XADD', rawStream, '*', 'raw', 'data: hello\n\n');
  });

  it('should require the opt-in header before creating a mirror', async () => {
    const redis = getGlobalRedisConnection() as any;
    redis.info = vi.fn().mockResolvedValue('used_memory:10\r\nmaxmemory:100\r\n');

    const withoutHeader = await getStreamResumeMirror({
      resumeRequestHeaderValue: undefined,
      teamId,
      appId,
      chatId
    });
    const withHeader = await getStreamResumeMirror({
      resumeRequestHeaderValue: '1',
      teamId,
      appId,
      chatId
    });

    expect(withoutHeader).toBeUndefined();
    expect(withHeader).toBeDefined();
    expect(redis.info).toHaveBeenCalledTimes(1);
  });

  it('should skip creating a mirror when redis memory usage crosses the watermark', async () => {
    const redis = getGlobalRedisConnection() as any;
    const usedMemory = Math.ceil(STREAM_RESUME_REDIS_MAXMEMORY_RATIO * 100) + 1;
    redis.set.mockClear?.();
    redis.info = vi.fn().mockResolvedValue(`used_memory:${usedMemory}\r\nmaxmemory:100\r\n`);

    const mirror = await getStreamResumeMirror({
      resumeRequestHeaderValue: 'true',
      teamId,
      appId,
      chatId
    });

    expect(mirror).toBeUndefined();
    expect(redis.info).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      getStreamResumeRedisKeys({ teamId, appId, chatId }).keyOfUnavailable,
      JSON.stringify({
        reason: StreamResumeUnavailableReasonEnum.memoryPressure
      }),
      'EX',
      STREAM_RESUME_TTL_SECONDS
    );
  });

  it('should parse truthy stream resume request headers', () => {
    expect(isStreamResumeMirrorRequested('YES')).toBe(true);
    expect(isStreamResumeMirrorRequested('0')).toBe(false);
  });
});
