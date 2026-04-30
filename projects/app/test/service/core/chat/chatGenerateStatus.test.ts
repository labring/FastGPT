import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureGenerateChat,
  tryStartGenerateChat,
  updateChatGenerateStatus
} from '@fastgpt/service/core/chat/chatGenerateStatus';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    updateOne: vi.fn()
  }
}));

const baseParams = {
  appId: 'app1',
  chatId: 'chat1',
  teamId: 'team1',
  tmbId: 'tmb1',
  source: 'online',
  sourceName: 'FastGPT'
};

describe('chatGenerateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should ensure a chat is marked as generating', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({} as any);

    await ensureGenerateChat(baseParams);

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        appId: baseParams.appId,
        chatId: baseParams.chatId
      },
      {
        $set: expect.objectContaining({
          ...baseParams,
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating,
          updateTime: expect.any(Date)
        }),
        $setOnInsert: {
          createTime: expect.any(Date)
        }
      },
      {
        upsert: true
      }
    );
  });

  it('should acquire generate slot when the chat is not already generating', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({} as any);

    await expect(tryStartGenerateChat(baseParams)).resolves.toBe(true);

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        appId: baseParams.appId,
        chatId: baseParams.chatId,
        chatGenerateStatus: {
          $ne: ChatGenerateStatusEnum.generating
        }
      },
      {
        $set: expect.objectContaining({
          ...baseParams,
          hasBeenRead: false,
          chatGenerateStatus: ChatGenerateStatusEnum.generating,
          updateTime: expect.any(Date)
        }),
        $setOnInsert: {
          createTime: expect.any(Date)
        }
      },
      {
        upsert: true
      }
    );
  });

  it('should reject acquiring generate slot when another request already owns it', async () => {
    vi.mocked(MongoChat.updateOne).mockRejectedValue({
      code: 11000
    });

    await expect(tryStartGenerateChat(baseParams)).resolves.toBe(false);
  });

  it('should update chat status to done or error without changing caller metadata', async () => {
    vi.mocked(MongoChat.updateOne).mockResolvedValue({} as any);

    await updateChatGenerateStatus({
      appId: baseParams.appId,
      chatId: baseParams.chatId,
      status: ChatGenerateStatusEnum.done
    });

    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      {
        appId: baseParams.appId,
        chatId: baseParams.chatId
      },
      {
        $set: {
          chatGenerateStatus: ChatGenerateStatusEnum.done,
          updateTime: expect.any(Date),
          hasBeenRead: false
        }
      }
    );
  });
});
