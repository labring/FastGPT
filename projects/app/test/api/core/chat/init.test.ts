import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authApp: vi.fn(),
  authSkill: vi.fn(),
  getAppLatestVersion: vi.fn(),
  findChat: vi.fn(),
  updateChat: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: mocks.authApp
}));

vi.mock('@fastgpt/service/support/permission/skill/auth', () => ({ authSkill: mocks.authSkill }));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: (...args: unknown[]) => ({ lean: () => mocks.findChat(...args) }),
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
      teamId: '65f000000000000000000001',
      tmbId: 'member-1',
      userId: 'user-1',
      permission: { hasReadChatLogPer: true }
    });
  });

  it('initializes workflow builder chat with app write permission and isolated source', async () => {
    mocks.findChat.mockResolvedValue({
      teamId: '65f000000000000000000001',
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
      teamId: '65f000000000000000000001',
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

  it('uses the custom title and marks a completed unread conversation once', async () => {
    mocks.findChat.mockResolvedValue({
      teamId: '65f000000000000000000001',
      tmbId: 'member-1',
      title: 'Generated',
      customTitle: 'My workflow',
      hasBeenRead: false
    });
    const result = await handler({
      query: { appId, sourceType: ChatSourceTypeEnum.workflowBuilder, chatId: 'chat-1' }
    } as any);
    expect(result).toMatchObject({
      title: 'My workflow',
      hasBeenRead: true,
      chatGenerateStatus: ChatGenerateStatusEnum.done
    });
    expect(mocks.updateChat).toHaveBeenCalledExactlyOnceWith(
      {
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        appId,
        teamId: '65f000000000000000000001',
        tmbId: 'member-1',
        chatId: 'chat-1'
      },
      { $set: { hasBeenRead: true } }
    );
    expect(mocks.authApp).toHaveBeenCalledTimes(1);
  });

  it('does not mark a generating conversation read', async () => {
    mocks.findChat.mockResolvedValue({
      teamId: '65f000000000000000000001',
      tmbId: 'member-1',
      hasBeenRead: false,
      chatGenerateStatus: ChatGenerateStatusEnum.generating
    });
    const result = await handler({
      query: { appId, sourceType: ChatSourceTypeEnum.workflowBuilder, chatId: 'chat-1' }
    } as any);
    expect(result.hasBeenRead).toBe(false);
    expect(mocks.updateChat).not.toHaveBeenCalled();
  });

  it('initializes a new Builder conversation without loading the target workflow', async () => {
    mocks.findChat.mockResolvedValue(null);
    await expect(
      handler({
        query: { appId, sourceType: ChatSourceTypeEnum.workflowBuilder, chatId: 'new-chat' }
      } as any)
    ).resolves.toMatchObject({
      title: '',
      chatGenerateStatus: ChatGenerateStatusEnum.done,
      hasBeenRead: true
    });
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
    expect(mocks.updateChat).not.toHaveBeenCalled();
  });

  it('preserves ordinary App log-reader access and published configuration', async () => {
    mocks.findChat.mockResolvedValue({
      teamId: '65f000000000000000000001',
      tmbId: 'other-member',
      customTitle: 'Log title',
      hasBeenRead: true
    });
    mocks.getAppLatestVersion.mockResolvedValue({
      nodes: [],
      chatConfig: { welcomeText: 'Published welcome' }
    });
    const result = await handler({ query: { appId, chatId: 'log-chat' } } as any);
    expect(result).toMatchObject({
      title: 'Log title',
      app: { chatConfig: { welcomeText: 'Published welcome' } }
    });
    expect(mocks.authApp).toHaveBeenCalledTimes(1);
    expect(mocks.getAppLatestVersion).toHaveBeenCalledExactlyOnceWith(
      appId,
      expect.objectContaining({ _id: appId })
    );
  });

  it('keeps Helper metadata and configuration independent of the target App', async () => {
    mocks.findChat.mockResolvedValue(null);
    const result = await handler({
      query: { appId, sourceType: ChatSourceTypeEnum.chatAgentHelper, chatId: 'helper-chat' }
    } as any);
    expect(result).toMatchObject({
      app: { name: 'Chat Agent Helper', chatConfig: { whisperConfig: { open: false } } }
    });
    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });

  it('uses Skill metadata and the existing optional status fields', async () => {
    mocks.authSkill.mockResolvedValue({
      teamId: '65f000000000000000000001',
      tmbId: 'member-1',
      skill: { name: 'Skill name', description: 'Skill description' }
    });
    mocks.findChat.mockResolvedValue(null);
    const result = await handler({ query: { skillId: appId, chatId: 'skill-chat' } } as any);
    expect(result).toMatchObject({
      skillId: appId,
      app: {
        name: 'Skill name',
        intro: 'Skill description',
        chatConfig: { fileSelectConfig: { canSelectFile: false } }
      }
    });
    expect(result.chatGenerateStatus).toBeUndefined();
    expect(result.hasBeenRead).toBeUndefined();
    expect(mocks.authApp).not.toHaveBeenCalled();
  });
});
