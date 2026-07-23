import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withTeamLock: vi.fn(),
  findTeamById: vi.fn(),
  deleteDatasets: vi.fn(),
  deleteApps: vi.fn(),
  deleteEvaluations: vi.fn(),
  deleteMany: vi.fn(),
  countApps: vi.fn(),
  countDatasets: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/account/cancellation', () => ({
  withAccountCancellationTeamLock: mocks.withTeamLock
}));

vi.mock('@fastgpt/service/support/user/team/teamSchema', () => ({
  MongoTeam: { findById: mocks.findTeamById }
}));

vi.mock('@fastgpt/service/core/dataset/delete/processor', () => ({
  deleteTeamAllDatasets: mocks.deleteDatasets
}));

vi.mock('@fastgpt/service/support/user/team/delete/utils', () => ({
  onDelAllApp: mocks.deleteApps
}));

vi.mock('@fastgpt/service/core/app/evaluation/delete', () => ({
  deleteEvaluationsByTeamId: mocks.deleteEvaluations
}));

vi.mock('@fastgpt/service/common/file/image/schema', () => ({
  MongoImage: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: { countDocuments: mocks.countApps }
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: { countDocuments: mocks.countDatasets }
}));

vi.mock('@fastgpt/service/support/openapi/schema', () => ({
  MongoOpenApi: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/core/chat/setting/schema', () => ({
  MongoChatSetting: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/core/chat/favouriteApp/schema', () => ({
  MongoChatFavouriteApp: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/support/wallet/discountCoupon/schema', () => ({
  MongoDiscountCoupon: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/support/user/audit/schema', () => ({
  MongoTeamAudit: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/support/wallet/sub/schema', () => ({
  MongoTeamSub: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/support/mcp/schema', () => ({
  MongoMcpKey: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: { deleteMany: mocks.deleteMany }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }),
  LogCategories: { MODULE: { USER: { TEAM: 'team' } } }
}));

import { teamDeleteProcessor } from '@fastgpt/service/support/user/team/delete/processor';

const createJob = (attemptsMade: number) =>
  ({
    data: { teamId: 'team-1' },
    attemptsMade,
    opts: { attempts: 10 }
  }) as Parameters<typeof teamDeleteProcessor>[0];

describe('teamDeleteProcessor failure logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTeamLock.mockImplementation(async (_teamId, callback) => callback());
    mocks.findTeamById.mockResolvedValue({});
    mocks.deleteDatasets.mockResolvedValue(undefined);
    mocks.deleteApps.mockResolvedValue(undefined);
    mocks.deleteEvaluations.mockResolvedValue(undefined);
    mocks.deleteMany.mockResolvedValue(undefined);
    mocks.countApps.mockResolvedValue(1);
    mocks.countDatasets.mockResolvedValue(0);
  });

  it('silently retries expected resource deletion lag before the final attempt', async () => {
    const job = createJob(0);

    await expect(teamDeleteProcessor(job)).rejects.toThrow(
      'Team resources are still being deleted'
    );

    expect(mocks.loggerInfo).toHaveBeenCalledWith('Team delete started', { teamId: 'team-1' });
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('does not repeat the start log during retries', async () => {
    const job = createJob(1);

    await expect(teamDeleteProcessor(job)).rejects.toThrow(
      'Team resources are still being deleted'
    );

    expect(mocks.loggerInfo).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('logs expected resource deletion lag as an error on the final attempt', async () => {
    const job = createJob(9);

    mocks.countApps.mockResolvedValueOnce(5);

    await expect(teamDeleteProcessor(job)).rejects.toThrow(
      'Team resources are still being deleted'
    );

    expect(mocks.loggerInfo).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith('Team delete failed after retries', {
      teamId: 'team-1',
      attempts: 10,
      remainingApps: 5,
      remainingDatasets: 0
    });
  });

  it('logs infrastructure failures as errors without waiting for retries to exhaust', async () => {
    const error = new Error('mongo unavailable');
    mocks.findTeamById.mockRejectedValueOnce(error);
    const job = createJob(0);

    await expect(teamDeleteProcessor(job)).rejects.toThrow('mongo unavailable');

    expect(mocks.loggerWarn).not.toHaveBeenCalled();
    expect(mocks.loggerError).toHaveBeenCalledWith('Team delete failed', {
      teamId: 'team-1',
      error
    });
  });
});
