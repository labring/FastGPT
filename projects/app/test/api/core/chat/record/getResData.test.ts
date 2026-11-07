import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  findChatItem: vi.fn(),
  getChatItemResponseData: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/core/chat/auth', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
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
    vi.resetAllMocks();

    mocks.authChatTargetCrud.mockResolvedValue({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      showCite: true
    });
    mocks.getChatItemResponseData.mockResolvedValue([{ id: 'persisted-root' }]);
  });

  it('uses unified responseData reader with legacy inline responseData as fallback', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI,
      responseData: [{ id: 'legacy-root' }]
    });

    await expect(callHandler()).resolves.toEqual([{ id: 'persisted-root' }]);
    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        authApiKey: true,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId
      })
    );
    expect(mocks.getChatItemResponseData).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId,
      chatItemDataId: dataId,
      fallbackResponseData: [{ id: 'legacy-root' }]
    });
  });

  it.each([
    ChatSourceTypeEnum.chatAgentHelper,
    ChatSourceTypeEnum.workflowBuilder,
    ChatSourceTypeEnum.skillEdit
  ])('reads auxiliary generation details through the authorized %s target', async (sourceType) => {
    mockChatItem({ obj: ChatRoleEnum.AI });
    const sourceId = '507f1f77bcf86cd799439012';
    mocks.authChatTargetCrud.mockResolvedValue({ sourceType, sourceId, showCite: true });
    const target =
      sourceType === ChatSourceTypeEnum.skillEdit
        ? { skillId: sourceId }
        : { appId: sourceId, sourceType };
    await expect(
      handler({ query: { ...target, chatId, dataId } } as ApiRequestProps)
    ).resolves.toEqual([{ id: 'persisted-root' }]);
    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType, sourceId, chatId, authToken: true })
    );
    expect(mocks.findChatItem).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: sourceId,
        sourceType,
        chatId,
        dataId,
        obj: ChatRoleEnum.AI
      }),
      expect.any(String)
    );
    expect(mocks.getChatItemResponseData).toHaveBeenCalledWith({
      sourceType,
      sourceId,
      chatId,
      chatItemDataId: dataId,
      fallbackResponseData: undefined
    });
  });

  it('does not read helper details when chat target authorization fails', async () => {
    const error = new Error('Unauthorized');
    mocks.authChatTargetCrud.mockRejectedValueOnce(error);
    await expect(
      handler({
        query: {
          sourceType: ChatSourceTypeEnum.chatAgentHelper,
          appId,
          chatId,
          dataId
        }
      } as ApiRequestProps)
    ).rejects.toBe(error);
    expect(mocks.findChatItem).not.toHaveBeenCalled();
    expect(mocks.getChatItemResponseData).not.toHaveBeenCalled();
  });

  it('passes empty legacy inline responseData as fallback', async () => {
    mockChatItem({
      obj: ChatRoleEnum.AI,
      responseData: []
    });
    mocks.getChatItemResponseData.mockResolvedValue([]);

    await expect(callHandler()).resolves.toEqual([]);
    expect(mocks.getChatItemResponseData).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
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
