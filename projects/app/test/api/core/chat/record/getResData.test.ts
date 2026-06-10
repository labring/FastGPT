import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatCrud: vi.fn(),
  findChatItem: vi.fn(),
  getChatItemResponseData: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatCrud: mocks.authChatCrud
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    findOne: mocks.findChatItem
  }
}));

vi.mock('@fastgpt/service/core/chat/nodeResponseStorage', () => ({
  getChatItemResponseData: mocks.getChatItemResponseData
}));

import { handler } from '@/pages/api/core/chat/record/getResData';

const appId = '507f1f77bcf86cd799439011';
const chatId = 'chat-id';
const dataId = 'chat-item-data-id';

const callHandler = () =>
  handler({
    query: {
      appId,
      chatId,
      dataId
    }
  } as ApiRequestProps);

const mockChatItem = (chatItem: Record<string, any> | null) => {
  mocks.findChatItem.mockReturnValue({
    lean: () => Promise.resolve(chatItem)
  });
};

describe('getResData handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authChatCrud.mockResolvedValue({ showCite: true });
    mocks.getChatItemResponseData.mockResolvedValue([{ id: 'persisted-root' }]);
  });

  it('uses unified responseData reader with legacy inline responseData as fallback', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI,
      responseData: [{ id: 'legacy-root' }]
    });

    await expect(callHandler()).resolves.toEqual([{ id: 'persisted-root' }]);
    expect(mocks.getChatItemResponseData).toHaveBeenCalledWith({
      appId,
      chatId,
      chatItemDataId: dataId,
      fallbackResponseData: [{ id: 'legacy-root' }]
    });
  });

  it('passes empty legacy inline responseData as fallback', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI,
      responseData: []
    });
    mocks.getChatItemResponseData.mockResolvedValue([]);

    await expect(callHandler()).resolves.toEqual([]);
    expect(mocks.getChatItemResponseData).toHaveBeenCalledWith({
      appId,
      chatId,
      chatItemDataId: dataId,
      fallbackResponseData: []
    });
  });

  it('reads persisted response rows when new chat item has no inline responseData', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI
    });

    await expect(callHandler()).resolves.toEqual([{ id: 'persisted-root' }]);
    expect(mocks.getChatItemResponseData).toHaveBeenCalledWith({
      appId,
      chatId,
      chatItemDataId: dataId,
      fallbackResponseData: undefined
    });
  });

  it('returns empty detail for non-AI chat item', async () => {
    mockChatItem({
      obj: ChatRoleEnum.Human,
      responseData: [{ id: 'legacy-root' }]
    });

    await expect(callHandler()).resolves.toEqual([]);
    expect(mocks.getChatItemResponseData).not.toHaveBeenCalled();
  });
});
