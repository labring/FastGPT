import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  getAppLatestVersion: vi.fn(),
  dispatchWorkFlow: vi.fn(),
  preChatRound: vi.fn(),
  finalizeChatRound: vi.fn(),
  failChatRound: vi.fn(),
  getRunningUserInfoByTmbId: vi.fn(),
  createChatUsageRecord: vi.fn(),
  getWorkflowEntryNodeIds: vi.fn(),
  storeNodes2RuntimeNodes: vi.fn(),
  storeEdges2RuntimeEdges: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => {
  const logCategory = new Proxy({}, { get: () => logCategory });
  return {
    LogCategories: logCategory,
    getLogger: () => ({
      info: vi.fn(),
      error: vi.fn()
    })
  };
});

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: vi.fn(async () => ({ standard: { maxUploadFileCount: 20 } }))
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

vi.mock('@fastgpt/service/core/chat/saveChat', () => ({
  finalizeChatRound: mocks.finalizeChatRound,
  failChatRound: mocks.failChatRound
}));

vi.mock('@fastgpt/service/core/chat/utils/prepare', () => ({
  preChatRound: mocks.preChatRound
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

import { getScheduleTriggerApp } from '@/service/core/app/utils';

describe('getScheduleTriggerApp', () => {
  let appId: string;
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T14:00:01.000Z'));
    const app = await MongoApp.create({
      name: 'Schedule App',
      teamId: new Types.ObjectId().toString(),
      tmbId: new Types.ObjectId().toString(),
      scheduledTriggerNextTime: new Date('2026-11-11T14:00:00.000Z'),
      scheduledTriggerConfig: {
        cronString: '*/5 * * * *',
        timezone: 'Asia/Shanghai',
        defaultPrompt: 'run the schedule'
      }
    });
    appId = String(app._id);
    mocks.getAppLatestVersion.mockResolvedValue({
      versionId: 'version-id',
      nodes: [{ nodeId: 'start' }],
      edges: [],
      chatConfig: { variables: [] },
      resources: []
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
      workflowRuntimeSummary: {
        responseIds: [],
        finishedNodeIds: [],
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 0,
        hasLoopRunBreak: false,
        hasToolStop: false,
        hasNestedEnd: false,
        llmInputTokens: 0,
        llmOutputTokens: 0
      }
    });
    mocks.preChatRound.mockResolvedValue({
      chatId: 'prepared-chat-id',
      responseChatItemId: 'prepared-response-id',
      shouldPersistChatRound: true,
      shouldFinalizePreparedRound: true
    });
    mocks.finalizeChatRound.mockResolvedValue(undefined);
    mocks.failChatRound.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('saves scheduled trigger AI content with the dispatch responseChatItemId', async () => {
    await getScheduleTriggerApp();

    expect(mocks.preChatRound).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeChatRound).toHaveBeenCalledTimes(1);

    const dispatchInput = mocks.dispatchWorkFlow.mock.calls[0][0];
    const saveInput = mocks.finalizeChatRound.mock.calls[0][0];

    expect(dispatchInput).toMatchObject({
      chatId: 'prepared-chat-id',
      responseChatItemId: 'prepared-response-id'
    });
    expect(saveInput.aiContent).toMatchObject({
      obj: ChatRoleEnum.AI,
      dataId: 'prepared-response-id',
      value: [{ text: { content: 'ok' } }],
      memories: { memory: 'value' },
      customFeedbacks: ['feedback-id']
    });
    expect(saveInput).toMatchObject({
      chatId: dispatchInput.chatId,
      source: ChatSourceEnum.cronJob,
      workflowRuntimeSummary: {
        responseIds: [],
        finishedNodeIds: [],
        citeCollectionIds: [],
        errorCount: 0,
        totalPoints: 0,
        hasLoopRunBreak: false,
        hasToolStop: false,
        hasNestedEnd: false,
        llmInputTokens: 0,
        llmOutputTokens: 0
      }
    });
  });

  it('marks the prepared scheduled trigger round as failed when workflow dispatch rejects', async () => {
    const error = new Error('dispatch failed');
    mocks.dispatchWorkFlow.mockRejectedValue(error);

    await getScheduleTriggerApp();

    expect(mocks.finalizeChatRound).not.toHaveBeenCalled();
    expect(mocks.failChatRound).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId: 'prepared-chat-id',
      responseChatItemId: 'prepared-response-id',
      error
    });
  });

  it('claims one due occurrence across concurrent scheduler scans', async () => {
    await Promise.all(Array.from({ length: 8 }, () => getScheduleTriggerApp()));
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1);
    expect(mocks.createChatUsageRecord).toHaveBeenCalledTimes(1);
    expect((await MongoApp.findById(appId).lean())?.scheduledTriggerNextTime).toEqual(
      new Date('2026-11-11T14:05:00.000Z')
    );
  });

  it('advances the due occurrence before a slow workflow starts', async () => {
    const response = mocks.dispatchWorkFlow.getMockImplementation()!;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.dispatchWorkFlow.mockImplementationOnce(async () => {
      await pending;
      return response();
    });
    const scan = getScheduleTriggerApp();
    try {
      await vi.waitFor(() => expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1));
      expect((await MongoApp.findById(appId).lean())?.scheduledTriggerNextTime).toEqual(
        new Date('2026-11-11T14:05:00.000Z')
      );
      await getScheduleTriggerApp();
      expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await scan;
    }
  });

  it('does not restore a schedule disabled while a workflow is running', async () => {
    const response = mocks.dispatchWorkFlow.getMockImplementation()!;
    mocks.dispatchWorkFlow.mockImplementationOnce(async () => {
      await MongoApp.updateOne(
        { _id: appId },
        {
          $unset: { scheduledTriggerConfig: '', scheduledTriggerNextTime: '' }
        }
      );
      return response();
    });
    await getScheduleTriggerApp();
    expect((await MongoApp.findById(appId).lean())?.scheduledTriggerNextTime).toBeUndefined();
  });

  it('does not overwrite the next time from a newly published schedule', async () => {
    const nextTime = new Date('2026-11-12T01:00:00.000Z');
    const response = mocks.dispatchWorkFlow.getMockImplementation()!;
    mocks.dispatchWorkFlow.mockImplementationOnce(async () => {
      await MongoApp.updateOne(
        { _id: appId },
        {
          $set: {
            'scheduledTriggerConfig.cronString': '0 9 * * *',
            scheduledTriggerNextTime: nextTime
          }
        }
      );
      return response();
    });
    await getScheduleTriggerApp();
    expect((await MongoApp.findById(appId).lean())?.scheduledTriggerNextTime).toEqual(nextTime);
  });

  it('keeps the next occurrence after preparation fails', async () => {
    mocks.preChatRound.mockRejectedValueOnce(new Error('preparation failed'));
    await getScheduleTriggerApp();
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
    expect((await MongoApp.findById(appId).lean())?.scheduledTriggerNextTime).toEqual(
      new Date('2026-11-11T14:05:00.000Z')
    );
  });

  it('does not run soft-deleted or future applications', async () => {
    await MongoApp.updateOne({ _id: appId }, { $set: { deleteTime: new Date() } });
    await getScheduleTriggerApp();
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
    await MongoApp.updateOne(
      { _id: appId },
      {
        $set: {
          deleteTime: null,
          scheduledTriggerNextTime: new Date('2026-11-11T14:05:00.000Z')
        }
      }
    );
    await getScheduleTriggerApp();
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
  });

  it.each([
    { $set: { 'scheduledTriggerConfig.defaultPrompt': 'new prompt' } },
    { $set: { publishedVersionId: new Types.ObjectId() } },
    { $set: { deleteTime: new Date() } },
    { $unset: { scheduledTriggerConfig: '', scheduledTriggerNextTime: '' } }
  ])('discards a stale scan after a concurrent update: %j', async (update) => {
    const updateOne = MongoApp.updateOne.bind(MongoApp);
    vi.spyOn(MongoApp, 'updateOne').mockImplementationOnce((...args) =>
      updateOne(...args).pre(async () => {
        await MongoApp.collection.updateOne({ _id: new Types.ObjectId(appId) }, update);
      })
    );
    await getScheduleTriggerApp();
    expect(mocks.createChatUsageRecord).not.toHaveBeenCalled();
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
  });

  it('does not execute when the atomic claim fails, and can retry on a later scan', async () => {
    vi.spyOn(MongoApp, 'updateOne').mockImplementationOnce(() => {
      throw new Error('claim unavailable');
    });
    await getScheduleTriggerApp();
    expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
    await getScheduleTriggerApp();
    expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid cron', '0 0 0 0 0'])(
    'does not execute an invalid schedule %s',
    async (cronString) => {
      await MongoApp.updateOne(
        { _id: appId },
        { $set: { 'scheduledTriggerConfig.cronString': cronString } }
      );
      await getScheduleTriggerApp();
      expect(mocks.dispatchWorkFlow).not.toHaveBeenCalled();
    }
  );

  it('allows a later occurrence while an earlier workflow is still running', async () => {
    const response = mocks.dispatchWorkFlow.getMockImplementation()!;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.dispatchWorkFlow.mockImplementationOnce(async () => {
      await pending;
      return response();
    });
    const scan = getScheduleTriggerApp();
    try {
      await vi.waitFor(() => expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(1));
      vi.setSystemTime(new Date('2026-11-11T14:05:01.000Z'));
      await getScheduleTriggerApp();
      expect(mocks.dispatchWorkFlow).toHaveBeenCalledTimes(2);
    } finally {
      release();
      await scan;
    }
    expect((await MongoApp.findById(appId).lean())?.scheduledTriggerNextTime).toEqual(
      new Date('2026-11-11T14:10:00.000Z')
    );
  });
});
