import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';

const mocks = vi.hoisted(() => ({
  shouldRecord: vi.fn(),
  getAppLatestVersion: vi.fn(),
  trackCreate: vi.fn(),
  loggerDebug: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.unmock('@fastgpt/service/common/middle/tracks/utils');

vi.mock('@fastgpt/dal/redis/caches', () => ({
  DailyActiveDedupeCache: class MockDailyActiveDedupeCache {
    shouldRecord = mocks.shouldRecord;
  }
}));

vi.mock('@fastgpt/service/common/middle/tracks/schema', () => ({
  TrackModel: {
    create: mocks.trackCreate
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    warn: mocks.loggerWarn
  }),
  LogCategories: {
    EVENT: {
      TRACK: ['event', 'track']
    }
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion
}));

import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

const dailyActiveData = {
  uid: 'user-1',
  teamId: 'team-1',
  tmbId: 'member-1'
};

describe('pushTrack identity fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = { isPlus: true } as any;
    mocks.shouldRecord.mockResolvedValue(true);
    mocks.trackCreate.mockResolvedValue({});
    mocks.getAppLatestVersion.mockResolvedValue({ nodes: [] });
  });

  it('records team business events using team and member identity', async () => {
    const identity = { teamId: 'team-1', tmbId: 'member-1' };
    await pushTrack.createApp({ ...identity, type: AppTypeEnum.workflow, appId: 'app-1' });
    await pushTrack.createDataset({ ...identity, type: DatasetTypeEnum.dataset });
    await pushTrack.countAppNodes({ ...identity, appId: 'app-1' });
    await pushTrack.runSystemTool({ ...identity, toolId: 'tool-1', result: 1 });
    await pushTrack.enterpriseAuthStart({ ...identity, result: 'success' });
    await pushTrack.enterpriseAuthBenefitGrant({
      ...identity,
      standSubLevel: StandardSubLevelEnum.advanced,
      durationDay: 15,
      totalPoints: 100,
      grantedPlanCount: 1
    });

    expect(mocks.trackCreate.mock.calls.map(([record]) => record.event)).toEqual([
      TrackEnum.createApp,
      TrackEnum.createDataset,
      TrackEnum.appNodes,
      TrackEnum.runSystemTool,
      TrackEnum.enterpriseAuthStart,
      TrackEnum.enterpriseAuthBenefitGrant
    ]);
    for (const [record] of mocks.trackCreate.mock.calls) {
      expect(record).toMatchObject(identity);
      expect(record.uid).toBeUndefined();
      expect(record.data).not.toHaveProperty('uid');
    }
  });

  it('retains global user identity for login and daily active events', async () => {
    await pushTrack.login({ ...dailyActiveData, type: 'password' });

    expect(mocks.trackCreate.mock.calls.map(([record]) => record.event)).toEqual([
      TrackEnum.login,
      TrackEnum.dailyUserActive
    ]);
    for (const [record] of mocks.trackCreate.mock.calls) {
      expect(record).toMatchObject(dailyActiveData);
    }
  });

  it('retains account identity when cancellation has no team membership', async () => {
    const data = {
      userId: 'user-1',
      operatorUserId: 'user-1',
      operatorType: 'system' as const,
      requestSource: 'self' as const,
      requestedAt: new Date('2026-10-01T00:00:00.000Z'),
      scheduledCancelAt: new Date('2026-10-16T00:00:00.000Z'),
      finalizedAt: new Date('2026-10-16T00:00:00.000Z')
    };
    await pushTrack.accountCancellationFinalizeSuccess({ uid: 'user-1', ...data });

    expect(mocks.trackCreate).toHaveBeenCalledExactlyOnceWith({
      event: TrackEnum.accountCancellationFinalizeSuccess,
      uid: 'user-1',
      teamId: undefined,
      tmbId: undefined,
      data
    });
  });
});

describe('pushTrack.dailyUserActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T23:59:59.000Z'));
    global.feConfigs = { isPlus: true } as any;
    mocks.shouldRecord.mockResolvedValue(true);
    mocks.trackCreate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims the UTC date before recording the first daily active event', async () => {
    await pushTrack.dailyUserActive(dailyActiveData);

    expect(mocks.shouldRecord).toHaveBeenCalledWith({
      uid: 'user-1',
      date: '2026-07-24'
    });
    expect(mocks.trackCreate).toHaveBeenCalledWith({
      event: TrackEnum.dailyUserActive,
      uid: 'user-1',
      teamId: 'team-1',
      tmbId: 'member-1',
      data: {}
    });
  });

  it('skips Mongo tracking when another request already claimed the daily key', async () => {
    mocks.shouldRecord.mockResolvedValue(false);

    await expect(pushTrack.dailyUserActive(dailyActiveData)).resolves.toBeUndefined();

    expect(mocks.trackCreate).not.toHaveBeenCalled();
  });

  it('keeps the existing plus-edition guard after claiming the key', async () => {
    global.feConfigs = { isPlus: false } as any;

    await pushTrack.dailyUserActive(dailyActiveData);

    expect(mocks.shouldRecord).toHaveBeenCalledOnce();
    expect(mocks.trackCreate).not.toHaveBeenCalled();
  });

  it('preserves propagation of asynchronous Mongo tracking failures', async () => {
    const error = new Error('mongo unavailable');
    mocks.trackCreate.mockRejectedValue(error);

    await expect(pushTrack.dailyUserActive(dailyActiveData)).rejects.toBe(error);

    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});

describe('pushTrack.workflowBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.feConfigs = { isPlus: true } as any;
    mocks.trackCreate.mockResolvedValue({});
  });

  it('stores authenticated ownership and only app/chat data', async () => {
    await pushTrack.workflowBuilder({
      teamId: 'team-1',
      tmbId: 'member-1',
      appId: 'app-1',
      chatId: 'chat-1',
      event: TrackEnum.workflowBuilderResultReady
    });
    expect(mocks.trackCreate).toHaveBeenCalledWith({
      event: TrackEnum.workflowBuilderResultReady,
      teamId: 'team-1',
      uid: undefined,
      tmbId: 'member-1',
      data: { appId: 'app-1', chatId: 'chat-1' }
    });
  });

  it('skips non-plus and isolates synchronous and asynchronous database failures', async () => {
    global.feConfigs = { isPlus: false } as any;
    await pushTrack.workflowBuilder({
      teamId: 'team-1',
      tmbId: 'member-1',
      appId: 'app-1',
      chatId: 'chat-1',
      event: TrackEnum.workflowBuilderResultReady
    });
    expect(mocks.trackCreate).not.toHaveBeenCalled();
    global.feConfigs = { isPlus: true } as any;
    mocks.trackCreate.mockRejectedValueOnce(new Error('db failed'));
    await expect(
      pushTrack.workflowBuilder({
        teamId: 'team-1',
        tmbId: 'member-1',
        appId: 'app-1',
        chatId: 'chat-1',
        event: TrackEnum.workflowBuilderResultReady
      })
    ).resolves.toBeUndefined();
    mocks.trackCreate.mockImplementationOnce(() => {
      throw new Error('sync db failed');
    });
    await expect(
      pushTrack.workflowBuilder({
        teamId: 'team-1',
        tmbId: 'member-1',
        appId: 'app-1',
        chatId: 'chat-1',
        event: TrackEnum.workflowBuilderResultReady
      })
    ).resolves.toBeUndefined();
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(2);
  });
});
