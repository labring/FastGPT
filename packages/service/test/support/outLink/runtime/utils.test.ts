import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutlinkResponseEvent } from '@fastgpt/service/support/outLink/runtime/type';
import { runOutlinkRuntime } from '@fastgpt/service/support/outLink/runtime/service';
import {
  outlinkInvokeChat,
  STREAM_CACHE_KEY_PREFIX,
  STREAM_END_FLAG
} from '@fastgpt/service/support/outLink/runtime/utils';
import { appendRedisCache } from '@fastgpt/service/common/redis/cache';

vi.mock('@fastgpt/service/support/outLink/runtime/service', () => ({
  runOutlinkRuntime: vi.fn()
}));
vi.mock('@fastgpt/service/common/redis/cache', () => ({
  appendRedisCache: vi.fn()
}));

const outLinkConfig = {
  _id: 'outlink-id',
  shareId: 'share-id',
  teamId: 'team-id',
  tmbId: 'tmb-id',
  appId: 'app-id',
  name: 'OutLink',
  usagePoints: 0,
  lastTime: new Date('2026-06-14T00:00:00.000Z'),
  type: PublishChannelEnum.feishu,
  showCite: true,
  showRunningStatus: true,
  showSkillReferences: false,
  showFullText: true,
  canDownloadSource: true,
  showWholeResponse: true,
  app: undefined
};
const message = {
  chatId: 'chat-id',
  query: [{ text: { content: 'hello' } }],
  messageId: 'message-id',
  chatUserId: 'user-id'
};

const mockEvents = (events: OutlinkResponseEvent[]) => {
  vi.mocked(runOutlinkRuntime).mockImplementation(async ({ respond }) => {
    await respond(Readable.from(events));
  });
};

describe('outlinkInvokeChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appendRedisCache).mockResolvedValue(undefined as any);
  });

  it('maps legacy input and sends the final reply', async () => {
    mockEvents([{ type: 'start' }, { type: 'done', content: 'complete answer' }]);
    const onReply = vi.fn().mockResolvedValue(undefined);

    await outlinkInvokeChat({ outLinkConfig, ...message, onReply });

    expect(runOutlinkRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ outLinkConfig, message })
    );
    expect(onReply).toHaveBeenCalledWith('complete answer');
  });

  it('maps chunks to the legacy Redis stream protocol', async () => {
    mockEvents([
      { type: 'start' },
      { type: 'chunk', content: 'partial ' },
      { type: 'chunk', content: 'answer' },
      { type: 'done', content: 'complete answer' }
    ]);
    const onReply = vi.fn().mockResolvedValue(undefined);
    const onStreamChunk = vi.fn().mockResolvedValue(undefined);

    await outlinkInvokeChat({
      outLinkConfig,
      ...message,
      streamId: 'stream-id',
      onReply,
      onStreamChunk
    });

    expect(vi.mocked(appendRedisCache).mock.calls).toEqual([
      [`${STREAM_CACHE_KEY_PREFIX}stream-id`, '', 120],
      [`${STREAM_CACHE_KEY_PREFIX}stream-id`, 'partial ', 60],
      [`${STREAM_CACHE_KEY_PREFIX}stream-id`, 'answer', 60],
      [`${STREAM_CACHE_KEY_PREFIX}stream-id`, STREAM_END_FLAG, 60]
    ]);
    expect(onStreamChunk.mock.calls).toEqual([['partial '], ['answer']]);
    expect(onReply).not.toHaveBeenCalled();
  });
});
