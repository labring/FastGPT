import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { outlinkInvokeChat } from '@fastgpt/service/support/outLink/runtime/utils';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { failChatRound, finalizeChatRound } from '@fastgpt/service/core/chat/saveChat';
import { authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';
import { addOutLinkUsage } from '@fastgpt/service/support/outLink/tools';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn(() => ({
      lean: () => ({ variables: { retained: 'value' } })
    })),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    updateMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/chatGenerateStatus', () => ({
  updateChatGenerateStatus: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/support/outLink/runtime/auth', () => ({
  authOutLinkLimit: vi.fn()
}));

vi.mock('@fastgpt/service/support/outLink/tools', () => ({
  addOutLinkUsage: vi.fn()
}));

vi.mock('@fastgpt/global/core/workflow/runtime/utils', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/global/core/workflow/runtime/utils')>();

  return {
    ...actual,
    getMaxHistoryLimitFromNodes: vi.fn(() => 10),
    getWorkflowEntryNodeIds: vi.fn(() => ['start']),
    storeNodes2RuntimeNodes: vi.fn(() => [{ nodeId: 'runtime-start' }]),
    storeEdges2RuntimeEdges: vi.fn(() => [])
  };
});

describe('outlinkInvokeChat', () => {
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
  const query = [{ text: { content: 'hello outlink' } }];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(MongoApp.findById).mockReturnValue({
      lean: () => ({
        _id: 'app-id',
        name: 'App',
        teamId: 'app-team-id',
        tmbId: 'app-tmb-id'
      })
    } as any);
    vi.mocked(getAppLatestVersion).mockResolvedValue({
      nodes: [{ nodeId: 'start', inputs: [], outputs: [] }],
      edges: [],
      chatConfig: { variables: [] }
    } as any);
    vi.mocked(getChatItems).mockResolvedValue({
      histories: []
    } as any);
    vi.mocked(authOutLinkLimit).mockResolvedValue(undefined as any);
    vi.mocked(getRunningUserInfoByTmbId).mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id'
    } as any);
    vi.mocked(preChatRound).mockResolvedValue({
      chatId: 'prepared-chat-id',
      responseChatItemId: 'message-id',
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true
    });
    vi.mocked(dispatchWorkFlow).mockResolvedValue({
      assistantResponses: [{ text: { content: 'answer' } }],
      newVariables: { next: 'value' },
      flowUsages: [{ totalPoints: 3 }],
      durationSeconds: 1.5,
      system_memories: { memory: 'value' },
      nodeResponseSummary: {
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 3
      }
    } as any);
    vi.mocked(finalizeChatRound).mockResolvedValue(undefined as any);
    vi.mocked(failChatRound).mockResolvedValue(undefined as any);
    vi.mocked(addOutLinkUsage).mockResolvedValue(undefined as any);
  });

  it('prepares and finalizes outlink chat rounds using messageId as the round dataId', async () => {
    const onReply = vi.fn().mockResolvedValue(undefined);

    await outlinkInvokeChat({
      outLinkConfig,
      chatId: 'chat-id',
      query,
      messageId: 'message-id',
      chatUserId: 'chat-user-id',
      onReply
    });

    expect(preChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app-id',
        chatId: 'chat-id',
        sourceName: 'OutLink',
        shareId: 'share-id',
        outLinkUid: 'chat-user-id',
        responseChatItemId: 'message-id',
        userContent: {
          dataId: 'message-id',
          obj: ChatRoleEnum.Human,
          value: query
        }
      })
    );
    expect(dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-chat-id',
        responseChatItemId: 'message-id'
      })
    );
    expect(finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'prepared-chat-id',
        aiContent: expect.objectContaining({
          dataId: 'message-id',
          value: [{ text: { content: 'answer' } }]
        })
      })
    );
    expect(onReply).toHaveBeenCalledWith('answer');
    expect(addOutLinkUsage).toHaveBeenCalledWith({
      shareId: 'share-id',
      totalPoints: 3
    });
  });

  it('marks prepared outlink round as failed when workflow dispatch rejects', async () => {
    const error = new Error('workflow failed');
    vi.mocked(dispatchWorkFlow).mockRejectedValue(error);

    await outlinkInvokeChat({
      outLinkConfig,
      chatId: 'chat-id',
      query,
      messageId: 'message-id',
      chatUserId: 'chat-user-id',
      onReply: vi.fn().mockResolvedValue(undefined)
    });

    expect(finalizeChatRound).not.toHaveBeenCalled();
    expect(failChatRound).toHaveBeenCalledWith({
      appId: 'app-id',
      chatId: 'prepared-chat-id',
      responseChatItemId: 'message-id',
      error
    });
  });
});
