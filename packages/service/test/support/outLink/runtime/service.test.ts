import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { runOutlinkRuntime } from '@fastgpt/service/support/outLink/runtime/service';
import type { OutlinkResponseEvent } from '@fastgpt/service/support/outLink/runtime/type';
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
  MongoApp: { findById: vi.fn() }
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));
vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: vi.fn()
}));
vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: { findOne: vi.fn(() => ({ variables: { retained: 'value' } })) }
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
vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: vi.fn(async () => ({ standard: { maxUploadFileCount: 20 } }))
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
const message = {
  chatId: 'chat-id',
  messageId: 'message-id',
  chatUserId: 'chat-user-id',
  query: [{ text: { content: 'hello outlink' } }]
};
const workflowResult = {
  assistantResponses: [{ text: { content: 'complete answer' } }],
  newVariables: { next: 'value' },
  flowUsages: [{ totalPoints: 3 }],
  durationSeconds: 1.5,
  system_memories: { memory: 'value' },
  nodeResponseSummary: {
    citeCollectionIds: [],
    errorCount: 0,
    totalPoints: 3
  }
};

const createResponder = () => {
  const events: OutlinkResponseEvent[] = [];
  const respond = vi.fn(async (stream: AsyncIterable<OutlinkResponseEvent>) => {
    for await (const event of stream) events.push(event);
  });
  return { events, respond };
};

describe('runOutlinkRuntime', () => {
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
    vi.mocked(getChatItems).mockResolvedValue({ histories: [] } as any);
    vi.mocked(authOutLinkLimit).mockResolvedValue({ uid: message.chatUserId });
    vi.mocked(getRunningUserInfoByTmbId).mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id'
    } as any);
    vi.mocked(preChatRound).mockResolvedValue({
      chatId: 'prepared-chat-id',
      responseChatItemId: message.messageId,
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true
    });
    vi.mocked(dispatchWorkFlow).mockResolvedValue(workflowResult as any);
    vi.mocked(finalizeChatRound).mockResolvedValue(undefined as any);
    vi.mocked(failChatRound).mockResolvedValue(undefined as any);
    vi.mocked(addOutLinkUsage).mockResolvedValue(undefined as any);
  });

  it('streams the final answer and persists responder failures', async () => {
    vi.mocked(dispatchWorkFlow).mockImplementation(async (props) => {
      props.workflowStreamResponse?.(workflowSseEvent.answerDelta('partial '));
      props.workflowStreamResponse?.(workflowSseEvent.fastAnswerDelta('answer'));
      return workflowResult as any;
    });
    const events: OutlinkResponseEvent[] = [];
    const respond = vi.fn(async (stream: AsyncIterable<OutlinkResponseEvent>) => {
      for await (const event of stream) events.push(event);
      throw new Error('delivery failed');
    });

    await runOutlinkRuntime({ outLinkConfig, message, respond });

    expect(events).toEqual([
      { type: 'start' },
      { type: 'chunk', content: 'partial ' },
      { type: 'chunk', content: 'answer' },
      { type: 'done', content: 'complete answer' }
    ]);
    expect(finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({ errorMsg: 'delivery failed' })
    );
  });

  it('does not start the responder for a duplicate message', async () => {
    vi.mocked(getChatItems).mockResolvedValue({
      histories: [{ dataId: message.messageId }]
    } as any);
    const { respond } = createResponder();

    await runOutlinkRuntime({ outLinkConfig, message, respond });

    expect(respond).not.toHaveBeenCalled();
    expect(authOutLinkLimit).not.toHaveBeenCalled();
  });

  it('terminates the stream with one error when workflow dispatch fails', async () => {
    const error = new Error('workflow failed');
    vi.mocked(dispatchWorkFlow).mockRejectedValue(error);
    const { events, respond } = createResponder();

    await runOutlinkRuntime({ outLinkConfig, message, respond });

    expect(events).toEqual([
      { type: 'start' },
      { type: 'error', content: 'App run error: workflow failed' }
    ]);
    expect(failChatRound).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-id',
      chatId: 'prepared-chat-id',
      responseChatItemId: message.messageId,
      error
    });
  });
});
