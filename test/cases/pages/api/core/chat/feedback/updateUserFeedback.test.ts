import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/chat/feedback/updateUserFeedback';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatCrud: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    findOne: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/logs/chatLogsSchema', () => ({
  MongoAppChatLog: {
    findOneAndUpdate: vi.fn()
  }
}));

describe('updateUserFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject if chatId or dataId is empty', async () => {
    const req = {
      body: {
        appId: 'app1',
        chatId: '',
        dataId: ''
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toEqual('chatId or dataId is empty');
  });

  it('should reject if chat item not found', async () => {
    const req = {
      body: {
        appId: 'app1',
        chatId: 'chat1',
        dataId: 'data1'
      }
    };

    const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
    vi.mocked(MongoChatItem.findOne).mockResolvedValue(null);

    await expect(handler(req as any, {} as any)).rejects.toEqual('Chat item not found');
  });

  it('should update feedback for AI message', async () => {
    const req = {
      body: {
        appId: 'app1',
        chatId: 'chat1',
        dataId: 'data1',
        userGoodFeedback: true,
        userBadFeedback: false
      }
    };

    const chatItem = {
      obj: ChatRoleEnum.AI,
      userGoodFeedback: false,
      userBadFeedback: true
    };

    const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
    const { MongoAppChatLog } = await import('@fastgpt/service/core/app/logs/chatLogsSchema');

    vi.mocked(MongoChatItem.findOne).mockResolvedValue(chatItem as any);
    vi.mocked(MongoChatItem.updateOne).mockResolvedValue({} as any);
    vi.mocked(MongoAppChatLog.findOneAndUpdate).mockResolvedValue({} as any);

    await handler(req as any, {} as any);

    expect(MongoChatItem.updateOne).toHaveBeenCalledWith(
      { appId: 'app1', chatId: 'chat1', dataId: 'data1' },
      {
        $unset: {},
        $set: {
          userGoodFeedback: true,
          userBadFeedback: false
        }
      }
    );

    expect(MongoAppChatLog.findOneAndUpdate).toHaveBeenCalledWith(
      { appId: 'app1', chatId: 'chat1' },
      {
        $inc: {
          goodFeedbackCount: 1,
          badFeedbackCount: -1
        }
      },
      { sort: { createTime: -1 } }
    );
  });

  it('should not update chat log for non-AI message', async () => {
    const req = {
      body: {
        appId: 'app1',
        chatId: 'chat1',
        dataId: 'data1',
        userGoodFeedback: true
      }
    };

    const chatItem = {
      obj: ChatRoleEnum.Human,
      userGoodFeedback: false
    };

    const { MongoChatItem } = await import('@fastgpt/service/core/chat/chatItemSchema');
    const { MongoAppChatLog } = await import('@fastgpt/service/core/app/logs/chatLogsSchema');

    vi.mocked(MongoChatItem.findOne).mockResolvedValue(chatItem as any);
    vi.mocked(MongoChatItem.updateOne).mockResolvedValue({} as any);

    await handler(req as any, {} as any);

    expect(MongoAppChatLog.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
