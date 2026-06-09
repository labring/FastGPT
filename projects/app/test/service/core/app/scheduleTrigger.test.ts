import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  appFindLean: vi.fn(),
  appUpdateOne: vi.fn(),
  getAppLatestVersion: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  pushChatRecords: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  createChatUsageRecord: vi.fn(),
  getWorkflowEntryNodeIds: vi.fn(),
  storeNodes2RuntimeNodes: vi.fn(),
  storeEdges2RuntimeEdges: vi.fn(),
  getNextTimeByCronStringAndTimezone: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    find: vi.fn(() => ({
      lean: mocks.appFindLean
    })),
    updateOne: mocks.appUpdateOne
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  pushChatRecords: mocks.pushChatRecords
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: mocks.dispatchWorkFlow
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: mocks.getRunningUserInfoByTmbId
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createChatUsageRecord: mocks.createChatUsageRecord
}));

vi.mock('@fastgpt/global/core/workflow/runtime/utils', () => ({
  getWorkflowEntryNodeIds: mocks.getWorkflowEntryNodeIds,
  storeNodes2RuntimeNodes: mocks.storeNodes2RuntimeNodes,
  storeEdges2RuntimeEdges: mocks.storeEdges2RuntimeEdges
}));

vi.mock('@fastgpt/global/common/string/time', () => ({
  getNextTimeByCronStringAndTimezone: mocks.getNextTimeByCronStringAndTimezone
}));

import { getScheduleTriggerApp } from '@/service/core/app/utils';

describe('getScheduleTriggerApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.appFindLean.mockResolvedValue([
      {
        _id: 'app-id',
        name: 'Schedule App',
        teamId: 'team-id',
        tmbId: 'tmb-id',
        scheduledTriggerConfig: {
          cronString: '* * * * *',
          timezone: 'Asia/Shanghai',
          defaultPrompt: 'run the schedule'
        }
      }
    ]);
    mocks.appUpdateOne.mockResolvedValue({});
    mocks.getAppLatestVersion.mockResolvedValue({
      versionId: 'version-id',
      nodes: [{ nodeId: 'start' }],
      edges: [],
      chatConfig: { variables: [] }
    });
    mocks.getWorkflowEntryNodeIds.mockReturnValue(['start']);
    mocks.storeNodes2RuntimeNodes.mockReturnValue([{ nodeId: 'runtime-start' }]);
    mocks.storeEdges2RuntimeEdges.mockReturnValue([]);
    mocks.createChatUsageRecord.mockResolvedValue('usage-id');
    mocks.getRunningUserInfoByTmbId.mockResolvedValue({ tmbId: 'tmb-id', teamId: 'team-id' });
    mocks.dispatchWorkFlow.mockResolvedValue({
      assistantResponses: [{ text: { content: 'ok' } }],
      durationSeconds: 1.2,
      system_memories: { memory: 'value' },
      customFeedbacks: ['feedback-id'],
      nodeResponseSummary: {
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 0
      }
    });
    mocks.pushChatRecords.mockResolvedValue(undefined);
    mocks.getNextTimeByCronStringAndTimezone.mockReturnValue(new Date('2026-06-08T00:00:00.000Z'));
  });

  it('saves scheduled trigger AI content with the dispatch responseChatItemId', async () => {
    await getScheduleTriggerApp();

    expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1);
    expect(mocks.pushChatRecords).toHaveBeenCalledTimes(1);

    const dispatchInput = mocks.dispatchWorkFlow.mock.calls[0][0];
    const saveInput = mocks.pushChatRecords.mock.calls[0][0];

    expect(saveInput.aiContent).toMatchObject({
      obj: ChatRoleEnum.AI,
      dataId: dispatchInput.responseChatItemId,
      value: [{ text: { content: 'ok' } }],
      memories: { memory: 'value' },
      customFeedbacks: ['feedback-id']
    });
    expect(saveInput).toMatchObject({
      chatId: dispatchInput.chatId,
      source: ChatSourceEnum.cronJob,
      nodeResponseSummary: {
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 0
      }
    });
  });
});
