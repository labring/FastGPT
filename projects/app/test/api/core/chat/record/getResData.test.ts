import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatCrud: vi.fn(),
  findChatItem: vi.fn(),
  getChatItemResponseRows: vi.fn(),
  composeChatItemResponseData: vi.fn()
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
  getChatItemResponseRows: mocks.getChatItemResponseRows,
  composeChatItemResponseData: mocks.composeChatItemResponseData
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
    mocks.getChatItemResponseRows.mockResolvedValue([{ data: { id: 'persisted-root' } }]);
    mocks.composeChatItemResponseData.mockReturnValue([{ id: 'persisted-root' }]);
  });

  it('keeps legacy inline responseData when chat item already has it', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI,
      responseData: [{ id: 'legacy-root' }]
    });

    await expect(callHandler()).resolves.toEqual([{ id: 'legacy-root' }]);
    expect(mocks.composeChatItemResponseData).not.toHaveBeenCalled();
  });

  it('keeps empty legacy inline responseData without composing flat rows', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI,
      responseData: []
    });

    await expect(callHandler()).resolves.toEqual([]);
    expect(mocks.composeChatItemResponseData).not.toHaveBeenCalled();
  });

  it('composes flat response rows when new chat item has no inline responseData', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI
    });

    await expect(callHandler()).resolves.toEqual([{ id: 'persisted-root' }]);
    expect(mocks.composeChatItemResponseData).toHaveBeenCalledWith({
      rows: [{ data: { id: 'persisted-root' } }]
    });
  });

  it('returns empty detail for non-AI chat item', async () => {
    mockChatItem({
      obj: ChatRoleEnum.Human,
      responseData: [{ id: 'legacy-root' }]
    });

    await expect(callHandler()).resolves.toEqual([]);
  });
});
