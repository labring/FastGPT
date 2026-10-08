import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  findChat: vi.fn(),
  updateChat: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: mocks.findChat,
    updateOne: mocks.updateChat
  }
}));

import handler from '@/pages/api/core/chat/init';

describe('chat init API', () => {
  const appId = '67f4c91c79a4d61b1f116b2a';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authApp.mockResolvedValue({
      app: {
        _id: appId,
        name: 'Builder App',
        avatar: '/icon.svg',
        intro: 'Builder intro',
        type: AppTypeEnum.workflow
      },
      teamId: 'team-1',
      tmbId: 'member-1'
    });
  });

  it('initializes workflow builder chat with app write permission and isolated source', async () => {
    mocks.findChat.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'member-1',
      title: 'Builder chat',
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });

    await expect(
      handler({
        query: {
          appId,
          sourceType: ChatSourceTypeEnum.workflowBuilder,
          chatId: 'chat-1'
        }
      } as any)
    ).resolves.toMatchObject({
      appId,
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'chat-1',
      title: 'Builder chat',
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: true,
      app: {
        name: 'Builder App',
        type: AppTypeEnum.workflow
      }
    });

    expect(mocks.authApp).toHaveBeenCalledWith(
      expect.objectContaining({
        appId,
        per: WritePermissionVal
      })
    );
    expect(mocks.findChat).toHaveBeenCalledWith({
      appId,
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'chat-1'
    });
  });

  it('rejects workflow builder chat owned by another member', async () => {
    mocks.findChat.mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'other-member'
    });

    await expect(
      handler({
        query: {
          appId,
          sourceType: ChatSourceTypeEnum.workflowBuilder,
          chatId: 'chat-1'
        }
      } as any)
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });
});
