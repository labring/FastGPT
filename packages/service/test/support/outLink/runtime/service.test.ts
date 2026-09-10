import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  dispatchOutlinkProviderMessage,
  runOutlinkRuntime
} from '@fastgpt/service/support/outLink/runtime/service';
import type {
  OutlinkResponder,
  OutlinkResponseEvent
} from '@fastgpt/service/support/outLink/runtime/type';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { preChatRound } from '@fastgpt/service/core/chat/utils/prepare';
import { failChatRound, finalizeChatRound } from '@fastgpt/service/core/chat/saveChat';
import { authOutLinkLimit } from '@fastgpt/service/support/outLink/runtime/auth';
import { addOutLinkUsage } from '@fastgpt/service/support/outLink/tools';
import {
  getRunningUserInfoByTmbId,
  getUserIdByTmbId
} from '@fastgpt/service/support/user/team/utils';
import { getWorkflowFileLimits } from '@fastgpt/service/core/workflow/utils/fileLimits';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { assertCancellation } from '@fastgpt/service/support/user/account/cancellation/guard';

vi.mock('@fastgpt/service/core/app/schema', () => ({
  AppCollectionName: 'apps',
  MongoApp: { findById: vi.fn() }
}));
vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));
vi.mock('@fastgpt/service/core/chat/controller', () => ({
  getChatItems: vi.fn()
}));
vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn(() => ({ variables: { retained: 'value' } })),
    updateOne: vi.fn()
  }
}));
vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: { updateMany: vi.fn() }
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn(async (callback: (session: undefined) => unknown) => callback(undefined))
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
vi.mock('@fastgpt/service/core/workflow/utils/fileLimits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/fileLimits')>()),
  getWorkflowFileLimits: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: vi.fn(),
  getUserIdByTmbId: vi.fn()
}));
vi.mock('@fastgpt/service/support/user/account/cancellation/guard', () => ({
  assertCancellation: vi.fn()
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
      chatConfig: { variables: [], fileSelectConfig: { maxFiles: 2 } },
      resources: []
    } as any);
    vi.mocked(getChatItems).mockResolvedValue({ histories: [] } as any);
    vi.mocked(authOutLinkLimit).mockResolvedValue({ uid: message.chatUserId });
    vi.mocked(getWorkflowFileLimits).mockResolvedValue({
      maxFileAmount: 5,
      maxBytesPerFile: 4 * 1024 * 1024
    });
    vi.mocked(getRunningUserInfoByTmbId).mockResolvedValue({
      teamId: 'team-id',
      tmbId: 'tmb-id'
    } as any);
    vi.mocked(getUserIdByTmbId).mockResolvedValue('user-id');
    vi.mocked(assertCancellation).mockResolvedValue(undefined);
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

  it('resolves the query after limits and start, then streams the final answer', async () => {
    vi.mocked(dispatchWorkFlow).mockImplementation(async (props) => {
      props.workflowStreamResponse?.(workflowSseEvent.answerDelta('partial '));
      props.workflowStreamResponse?.(workflowSseEvent.fastAnswerDelta('answer'));
      return workflowResult as any;
    });
    const resolvedQuery = [{ text: { content: 'resolved query' } }];
    const resolveQuery = vi.fn().mockResolvedValue(resolvedQuery);
    const startHandled = vi.fn();
    const events: OutlinkResponseEvent[] = [];
    const respond = vi.fn(async (stream: AsyncIterable<OutlinkResponseEvent>) => {
      for await (const event of stream) {
        events.push(event);
        if (event.type === 'start') startHandled();
      }
    });

    await expect(
      runOutlinkRuntime({
        outLinkConfig,
        message: { ...message, resolveQuery },
        respond
      })
    ).resolves.toEqual({ status: 'handled' });

    expect(resolveQuery).toHaveBeenCalledWith({
      maxFileAmount: 2,
      maxBytesPerFile: 4 * 1024 * 1024,
      fileSelectConfig: { maxFiles: 2 }
    });
    expect(vi.mocked(authOutLinkLimit).mock.invocationCallOrder[0]).toBeLessThan(
      startHandled.mock.invocationCallOrder[0]
    );
    expect(startHandled.mock.invocationCallOrder[0]).toBeLessThan(
      resolveQuery.mock.invocationCallOrder[0]
    );
    expect(events).toEqual([
      { type: 'start' },
      { type: 'chunk', content: 'partial ' },
      { type: 'chunk', content: 'answer' },
      { type: 'done', content: 'complete answer' }
    ]);
    expect(finalizeChatRound).toHaveBeenCalledWith(
      expect.objectContaining({
        userContent: expect.objectContaining({ value: resolvedQuery }),
        errorMsg: undefined
      })
    );
  });

  it('does not start the responder for a duplicate message', async () => {
    vi.mocked(getChatItems).mockResolvedValue({
      histories: [{ dataId: message.messageId }]
    } as any);
    const resolveQuery = vi.fn();
    const { respond } = createResponder();

    await expect(
      runOutlinkRuntime({
        outLinkConfig,
        message: { ...message, resolveQuery },
        respond
      })
    ).resolves.toEqual({ status: 'duplicate' });

    expect(respond).not.toHaveBeenCalled();
    expect(resolveQuery).not.toHaveBeenCalled();
    expect(authOutLinkLimit).not.toHaveBeenCalled();
  });

  it('does not resolve media when the usage limit rejects the message', async () => {
    const error = new Error('usage limit reached');
    vi.mocked(authOutLinkLimit).mockRejectedValue(error);
    const resolveQuery = vi.fn();
    const { events, respond } = createResponder();

    await runOutlinkRuntime({
      outLinkConfig,
      message: { ...message, resolveQuery },
      respond
    });

    expect(resolveQuery).not.toHaveBeenCalled();
    expect(events).toEqual([{ type: 'error', content: 'App run error: usage limit reached' }]);
  });

  it('does not resolve media when the responder fails to handle start', async () => {
    const resolveQuery = vi.fn();
    const respond = vi.fn(async (stream: AsyncIterable<OutlinkResponseEvent>) => {
      for await (const event of stream) {
        if (event.type === 'start') throw new Error('start failed');
      }
    });

    await runOutlinkRuntime({
      outLinkConfig,
      message: { ...message, resolveQuery },
      respond
    });

    expect(resolveQuery).not.toHaveBeenCalled();
    expect(preChatRound).not.toHaveBeenCalled();
    expect(dispatchWorkFlow).not.toHaveBeenCalled();
  });

  it('stops delivering workflow chunks after the responder fails', async () => {
    let releaseSecondChunk!: () => void;
    const secondChunk = new Promise<void>((resolve) => {
      releaseSecondChunk = resolve;
    });
    vi.mocked(dispatchWorkFlow).mockImplementation(async (props) => {
      props.workflowStreamResponse?.(workflowSseEvent.answerDelta('first'));
      await secondChunk;
      props.workflowStreamResponse?.(workflowSseEvent.answerDelta('second'));
      return workflowResult as any;
    });
    const events: OutlinkResponseEvent[] = [];
    const respond = vi.fn(async (stream: AsyncIterable<OutlinkResponseEvent>) => {
      for await (const event of stream) {
        events.push(event);
        if (event.type === 'chunk') throw new Error('chunk failed');
      }
    });

    const result = runOutlinkRuntime({ outLinkConfig, message, respond });
    await vi.waitFor(() =>
      expect(events).toEqual([{ type: 'start' }, { type: 'chunk', content: 'first' }])
    );
    releaseSecondChunk();
    await result;

    expect(events).toEqual([{ type: 'start' }, { type: 'chunk', content: 'first' }]);
  });

  it('resets chats when a quoted provider message precedes the command', async () => {
    const { respond, events } = createResponder();

    await runOutlinkRuntime({
      outLinkConfig,
      message: {
        ...message,
        query: [{ text: { content: '<Cite>previous question</Cite>\nReset' } }]
      },
      respond
    });

    expect(mongoSessionRun).toHaveBeenCalledTimes(1);
    expect(MongoChat.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: message.chatId }),
      { $set: { chatId: expect.any(String) } },
      { session: undefined }
    );
    expect(MongoChatItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: message.chatId }),
      { $set: { chatId: expect.any(String) } },
      { session: undefined }
    );
    expect(events).toEqual([{ type: 'done', content: expect.stringContaining('reset') }]);
    expect(getChatItems).not.toHaveBeenCalled();
    expect(dispatchWorkFlow).not.toHaveBeenCalled();
  });

  it('stops waiting when the responder exceeds its start timeout', async () => {
    vi.useFakeTimers();
    try {
      const resolveQuery = vi.fn();
      const respond: OutlinkResponder = vi.fn(async () => new Promise(() => {}));
      respond.startTimeoutMs = 1000;

      const result = runOutlinkRuntime({
        outLinkConfig,
        message: { ...message, resolveQuery },
        respond
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(result).resolves.toEqual({ status: 'handled' });
      expect(resolveQuery).not.toHaveBeenCalled();
      expect(preChatRound).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

describe('dispatchOutlinkProviderMessage', () => {
  it('returns one terminal error through the provider responder', async () => {
    const events: OutlinkResponseEvent[] = [];
    const onProcessingError = vi.fn();
    const onResponseError = vi.fn();
    dispatchOutlinkProviderMessage({
      onMessage: vi.fn().mockRejectedValue(new Error('runtime failed')),
      outLinkConfig: outLinkConfig as any,
      message,
      respond: async (stream) => {
        for await (const event of stream) events.push(event);
      },
      onProcessingError,
      onResponseError
    });

    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'error', content: '文件处理失败，请稍后重试' }]);
    });
    expect(onProcessingError).toHaveBeenCalledWith(expect.any(Error));
    expect(onResponseError).not.toHaveBeenCalled();
  });

  it('forwards the runtime result to the provider callback', async () => {
    const onMessageResult = vi.fn();
    dispatchOutlinkProviderMessage({
      onMessage: vi.fn().mockResolvedValue({ status: 'duplicate' }),
      outLinkConfig: outLinkConfig as any,
      message,
      respond: vi.fn(),
      onProcessingError: vi.fn(),
      onResponseError: vi.fn(),
      onMessageResult
    });

    await vi.waitFor(() => {
      expect(onMessageResult).toHaveBeenCalledWith({ status: 'duplicate' });
    });
  });
});
