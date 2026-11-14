import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/web/common/api/request';
import { getChatHistoryStatus } from '@/web/core/chat/history/api';

vi.mock('@/web/common/api/request', () => ({ POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));

describe('getChatHistoryStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deduplicates and splits a long sidebar into bounded requests while preserving auth', async () => {
    const chatIds = Array.from({ length: 201 }, (_, index) => `chat-${index}`);
    vi.mocked(POST).mockImplementation(
      async <T>(_url: string, data?: any) =>
        ({
          list: data.chatIds.map((chatId: string) => ({ chatId }))
        }) as T
    );
    const outLinkAuthData = { shareId: 'share-1', outLinkUid: 'visitor-1' };
    const result = await getChatHistoryStatus({
      chatIds: [...chatIds, 'chat-0'],
      outLinkAuthData
    });
    expect(POST).toHaveBeenCalledTimes(2);
    expect(POST).toHaveBeenNthCalledWith(1, '/core/chat/history/getHistoryStatus', {
      chatIds: chatIds.slice(0, 200),
      outLinkAuthData
    });
    expect(POST).toHaveBeenNthCalledWith(2, '/core/chat/history/getHistoryStatus', {
      chatIds: ['chat-200'],
      outLinkAuthData
    });
    expect(result.list.map((item) => item.chatId)).toEqual(chatIds);
  });

  it('does not query an empty list', async () => {
    await expect(getChatHistoryStatus({ appId: 'app-1', chatIds: [] })).resolves.toEqual({
      list: []
    });
    expect(POST).not.toHaveBeenCalled();
  });

  it('rejects the whole refresh when a later batch fails', async () => {
    const error = new Error('Redis unavailable');
    vi.mocked(POST)
      .mockResolvedValueOnce({ list: [{ chatId: 'chat-0' }] })
      .mockRejectedValueOnce(error);
    await expect(
      getChatHistoryStatus({
        appId: 'app-1',
        chatIds: Array.from({ length: 201 }, (_, index) => `chat-${index}`)
      })
    ).rejects.toBe(error);
  });
});
