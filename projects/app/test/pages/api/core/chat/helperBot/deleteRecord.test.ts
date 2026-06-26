import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authHelperBotChatCrud: vi.fn(),
  deleteMany: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authHelperBotChatCrud: mocks.authHelperBotChatCrud
}));

vi.mock('@fastgpt/service/core/chat/HelperBot/chatItemSchema', () => ({
  MongoHelperBotChatItem: {
    deleteMany: mocks.deleteMany
  }
}));

import handler from '@/pages/api/core/chat/helperBot/deleteRecord';

const deleteHandler = handler as unknown as (
  req: ApiRequestProps
) => Promise<Record<string, never>>;

const callHandler = (query: Record<string, unknown>) =>
  deleteHandler({
    query
  } as ApiRequestProps);

describe('helperBot/deleteRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authHelperBotChatCrud.mockResolvedValue({
      chat: { chatId: 'chat-1' },
      userId: 'user-1'
    });
    mocks.deleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  it('validates query before deleting records', async () => {
    await expect(
      callHandler({
        type: 'topAgent',
        chatId: 'chat-1',
        chatItemId: 'item-1'
      })
    ).resolves.toEqual({});

    expect(mocks.authHelperBotChatCrud).toHaveBeenCalledWith({
      type: 'topAgent',
      chatId: 'chat-1',
      req: expect.any(Object),
      authToken: true
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      userId: 'user-1',
      chatId: 'chat-1',
      chatItemId: 'item-1'
    });
  });

  it('rejects invalid query before auth or delete', async () => {
    await expect(callHandler({ type: 'topAgent', chatId: 'chat-1' })).rejects.toBeInstanceOf(
      ApiRequestInputParseError
    );

    expect(mocks.authHelperBotChatCrud).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
