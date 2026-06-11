import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnterpriseAuthAmountMaxErrorTimes,
  EnterpriseAuthErrEnum,
  EnterpriseAuthGrantPoints,
  EnterpriseAuthTrialDays,
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum
} from '@fastgpt/global/support/wallet/sub/constants';

const mocks = vi.hoisted(() => ({
  findAuth: vi.fn(),
  createAuth: vi.fn(),
  findTask: vi.fn(),
  updateTask: vi.fn(),
  findOneAndUpdateTask: vi.fn(),
  mongoSessionRun: vi.fn(),
  findSub: vi.fn(),
  findOneSub: vi.fn(),
  createSub: vi.fn(),
  reComputeStandPlans: vi.fn(),
  clearTeamPlanCache: vi.fn(),
  hasServiceConfig: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/enterpriseAuth/schema', () => ({
  MongoTeamEnterpriseAuth: {
    findOne: mocks.findAuth,
    create: mocks.createAuth
  },
  MongoTeamEnterpriseAuthTask: {
    findOne: mocks.findTask,
    updateOne: mocks.updateTask,
    findOneAndUpdate: mocks.findOneAndUpdateTask
  }
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: mocks.mongoSessionRun
}));

vi.mock('@fastgpt/service/support/wallet/sub/schema', () => ({
  MongoTeamSub: {
    find: mocks.findSub,
    findOne: mocks.findOneSub,
    create: mocks.createSub
  }
}));

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  reComputeStandPlans: mocks.reComputeStandPlans,
  clearTeamPlanCache: mocks.clearTeamPlanCache
}));

vi.mock('@fastgpt/service/common/secret/aes256gcm', () => ({
  encryptSecret: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/enterpriseAuth/transferClient', () => ({
  createEnterpriseAuthTransfer: vi.fn(),
  hasEnterpriseAuthServiceConfig: mocks.hasServiceConfig,
  getEnterpriseAuthBanks: vi.fn()
}));

const { getEnterpriseAuthStatus, verifyEnterpriseAuthAmount } =
  await import('@fastgpt/service/support/user/team/enterpriseAuth/controller');

const teamId = '507f1f77bcf86cd799439011';
const userId = '507f1f77bcf86cd799439012';
const tmbId = '507f1f77bcf86cd799439013';
const taskId = 'task_1';

const mockLean = <T>(value: T) => ({
  lean: vi.fn().mockResolvedValue(value)
});

const mockSortedLean = <T>(value: T) => ({
  lean: vi.fn().mockResolvedValue(value),
  sort: vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(value)
  })
});

const mockSession = <T>(value: T) => ({
  session: vi.fn().mockResolvedValue(value)
});

const mockSessionLean = <T>(value: T) => ({
  session: vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(value)
  })
});

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const buildTask = (amountErrorTimes: number, overrides: Record<string, any> = {}) =>
  ({
    teamId,
    taskId,
    status:
      amountErrorTimes > 0
        ? TeamEnterpriseAuthTaskStatusEnum.amount_failed
        : TeamEnterpriseAuthTaskStatusEnum.pending_amount,
    enterpriseName: '示例科技有限公司',
    unifiedCreditCode: '91310000TEST00000',
    legalPersonName: '张三',
    bankName: '中国工商银行',
    bankAccount: '6222000000000000',
    contactName: '李四',
    contactTitle: '产品负责人',
    contactPhone: '13800000000',
    demand: '企业知识库试用',
    transferAmountFen: 13,
    amountErrorTimes,
    usedTimes: 1,
    startedAt: new Date(Date.now() - 60 * 1000),
    expireAt: new Date(Date.now() + 60 * 60 * 1000),
    createTime: new Date(Date.now() - 60 * 1000),
    updateTime: new Date(Date.now() - 60 * 1000),
    ...overrides
  }) as any;

const buildVerifiedAuth = (verifiedAt: Date) =>
  ({
    teamId,
    enterpriseName: '示例科技有限公司',
    unifiedCreditCode: '91310000TEST00000',
    legalPersonName: '张三',
    bankName: '中国工商银行',
    bankAccount: '6222000000000000',
    contactName: '李四',
    contactTitle: '产品负责人',
    contactPhone: '13800000000',
    demand: '企业知识库试用',
    verifiedAt,
    createTime: verifiedAt,
    updateTime: verifiedAt
  }) as any;

const buildStandardSub = ({
  level,
  startTime,
  expiredTime,
  totalPoints = 1000,
  surplusPoints = 100
}: {
  level: StandardSubLevelEnum;
  startTime: Date;
  expiredTime: Date;
  totalPoints?: number;
  surplusPoints?: number;
}) => ({
  _id: `507f1f77bcf86cd7994390${level.length}`.slice(0, 24),
  teamId,
  type: SubTypeEnum.standard,
  currentMode: SubModeEnum.month,
  nextMode: SubModeEnum.month,
  currentSubLevel: level,
  nextSubLevel: level,
  startTime,
  expiredTime,
  totalPoints,
  surplusPoints,
  save: vi.fn().mockResolvedValue(undefined)
});

const setupPendingTask = (task = buildTask(0)) => {
  mocks.findTask.mockReturnValueOnce(mockSortedLean(task));
};

const verifyWrongAmount = () =>
  verifyEnterpriseAuthAmount({
    operator: {
      teamId,
      userId,
      tmbId
    },
    data: {
      taskId,
      amountFen: 12
    }
  });

describe('getEnterpriseAuthStatus readonly behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasServiceConfig.mockReturnValue(true);
  });

  it('任务已过期时只推导展示态，不回写过期状态', async () => {
    const expiredTask = buildTask(0, {
      expireAt: new Date(Date.now() - 1000)
    });
    mocks.findAuth.mockReturnValueOnce(mockLean(null));
    mocks.findTask.mockReturnValueOnce(mockSortedLean(expiredTask));

    const result = await getEnterpriseAuthStatus({
      teamId,
      canManage: false
    });

    expect(result).toMatchObject({
      enabled: true,
      status: TeamEnterpriseAuthStatusEnum.failed,
      usedTimes: expiredTask.usedTimes,
      canManage: false,
      currentTask: undefined,
      lastErrorCode: EnterpriseAuthErrEnum.taskExpired,
      lastErrorMessage: '认证任务已过期，请重新填写'
    });
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});

describe('verifyEnterpriseAuthAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasServiceConfig.mockReturnValue(true);
    mocks.mongoSessionRun.mockImplementation(async (fn) => fn({}));
    mocks.clearTeamPlanCache.mockResolvedValue(undefined);
    mocks.findAuth.mockReturnValue(mockSession(null));
    mocks.findTask.mockReturnValue(mockSortedLean(null));
    mocks.findOneAndUpdateTask.mockReturnValue(mockLean(null));
    mocks.findSub.mockReturnValue(mockSession([]));
    mocks.findOneSub.mockReturnValue(mockSession(null));
    mocks.reComputeStandPlans.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('金额错误但未达上限时使用原子递增保留任务', async () => {
    setupPendingTask(buildTask(0));
    mocks.findOneAndUpdateTask
      .mockReturnValueOnce(mockLean(null))
      .mockReturnValueOnce(mockLean(buildTask(1)));

    await expect(verifyWrongAmount()).rejects.toThrow(EnterpriseAuthErrEnum.amountError);

    expect(mocks.findOneAndUpdateTask).toHaveBeenCalledTimes(2);
    const [, recoverableUpdate] = mocks.findOneAndUpdateTask.mock.calls[1];
    expect(recoverableUpdate).toEqual(
      expect.objectContaining({
        $inc: {
          amountErrorTimes: 1
        },
        $set: expect.objectContaining({
          status: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
          lastErrorCode: EnterpriseAuthErrEnum.amountError
        })
      })
    );
    expect(recoverableUpdate.$set).not.toHaveProperty('amountErrorTimes');
  });

  it('最后一次金额错误时同一次原子更新写入失败状态', async () => {
    setupPendingTask(buildTask(EnterpriseAuthAmountMaxErrorTimes - 1));
    mocks.findOneAndUpdateTask.mockReturnValueOnce(
      mockLean(
        buildTask(EnterpriseAuthAmountMaxErrorTimes, {
          status: TeamEnterpriseAuthTaskStatusEnum.failed,
          endedAt: new Date()
        })
      )
    );

    await expect(verifyWrongAmount()).rejects.toThrow(EnterpriseAuthErrEnum.amountFailed);

    expect(mocks.findOneAndUpdateTask).toHaveBeenCalledTimes(1);
    const [, finalUpdate] = mocks.findOneAndUpdateTask.mock.calls[0];
    expect(finalUpdate).toEqual(
      expect.objectContaining({
        $inc: {
          amountErrorTimes: 1
        },
        $set: expect.objectContaining({
          status: TeamEnterpriseAuthTaskStatusEnum.failed,
          lastErrorCode: EnterpriseAuthErrEnum.amountFailed
        })
      })
    );
  });

  it('金额验证遇到已过期任务时保留 taskExpired 错误语义', async () => {
    const expiredTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.expired,
      expireAt: new Date(Date.now() - 1000),
      lastErrorCode: EnterpriseAuthErrEnum.taskExpired
    });
    mocks.findTask.mockReturnValueOnce(mockSortedLean(expiredTask));

    await expect(
      verifyEnterpriseAuthAmount({
        operator: {
          teamId,
          userId,
          tmbId
        },
        data: {
          taskId,
          amountFen: 13
        }
      })
    ).rejects.toThrow(EnterpriseAuthErrEnum.taskExpired);
  });

  it('金额验证遇到已超时 starting 任务时保留 serviceTimeout 错误语义', async () => {
    const serviceFailedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
      lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout
    });
    mocks.findTask.mockReturnValueOnce(mockSortedLean(serviceFailedTask));

    await expect(
      verifyEnterpriseAuthAmount({
        operator: {
          teamId,
          userId,
          tmbId
        },
        data: {
          taskId,
          amountFen: 13
        }
      })
    ).rejects.toThrow(EnterpriseAuthErrEnum.serviceTimeout);
  });

  it('金额验证成功时写入纯成功信息表，任务表只记录状态且不触发飞书同步', async () => {
    const grantedAt = new Date('2026-06-15T00:00:00.000Z');
    const trialExpiredAt = addDays(grantedAt, EnterpriseAuthTrialDays);
    vi.useFakeTimers();
    vi.setSystemTime(grantedAt);

    const pendingTask = buildTask(0);
    const grantingTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.granting
    });
    const verifiedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.verified,
      grantExpiredAt: trialExpiredAt
    });
    const createdAdvancedSub = buildStandardSub({
      level: StandardSubLevelEnum.advanced,
      startTime: grantedAt,
      expiredTime: trialExpiredAt,
      totalPoints: EnterpriseAuthGrantPoints,
      surplusPoints: EnterpriseAuthGrantPoints
    });
    const verifiedAuth = buildVerifiedAuth(grantedAt);

    setupPendingTask(pendingTask);
    mocks.findTask.mockReturnValueOnce(mockSessionLean(grantingTask));
    mocks.findOneAndUpdateTask
      .mockResolvedValueOnce(grantingTask)
      .mockResolvedValueOnce(verifiedTask);
    mocks.findSub.mockReturnValueOnce(mockSession([]));
    mocks.findOneSub.mockReturnValueOnce(mockSession(null));
    mocks.createSub.mockResolvedValueOnce([createdAdvancedSub]);
    mocks.createAuth.mockResolvedValueOnce([verifiedAuth]);
    mocks.findAuth.mockReturnValueOnce(mockSession(verifiedAuth));

    const result = await verifyEnterpriseAuthAmount({
      operator: {
        teamId,
        userId,
        tmbId
      },
      data: {
        taskId,
        amountFen: 13
      }
    });

    expect(mocks.createAuth).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          enterpriseName: pendingTask.enterpriseName,
          unifiedCreditCode: pendingTask.unifiedCreditCode,
          bankAccount: '6222000000000000',
          verifiedAt: grantedAt
        })
      ],
      { session: {} }
    );
    const [, verifiedUpdate] = mocks.findOneAndUpdateTask.mock.calls[1];
    expect(verifiedUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.verified,
        grantExpiredAt: trialExpiredAt,
        endedAt: grantedAt,
        updateTime: grantedAt
      })
    );
    expect(verifiedUpdate.$set).not.toHaveProperty('grant');
    expect(verifiedUpdate.$set).not.toHaveProperty('feishuSync');
    expect(verifiedUpdate.$set).not.toHaveProperty('trialMetrics');
    expect(verifiedUpdate.$inc).toBeUndefined();
    expect(mocks.reComputeStandPlans).toHaveBeenCalledWith(teamId, {});
    expect(result).toEqual({
      status: TeamEnterpriseAuthStatusEnum.verified,
      verifiedEnterpriseName: verifiedAuth.enterpriseName,
      grantExpiredAt: trialExpiredAt,
      amountMaxErrorTimes: EnterpriseAuthAmountMaxErrorTimes
    });
  });

  it('重复提交已验证任务时返回首次认证的套餐到期时间', async () => {
    const verifiedAt = new Date('2026-06-15T00:00:00.000Z');
    const grantExpiredAt = addDays(verifiedAt, EnterpriseAuthTrialDays);
    const verifiedAuth = buildVerifiedAuth(verifiedAt);
    const verifiedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.verified,
      grantExpiredAt
    });

    mocks.findTask
      .mockReturnValueOnce(mockSortedLean(null))
      .mockReturnValueOnce(mockLean(verifiedTask));
    mocks.findAuth.mockReturnValueOnce(mockLean(verifiedAuth));

    const result = await verifyEnterpriseAuthAmount({
      operator: {
        teamId,
        userId,
        tmbId
      },
      data: {
        taskId,
        amountFen: 13
      }
    });

    expect(result).toEqual({
      status: TeamEnterpriseAuthStatusEnum.verified,
      verifiedEnterpriseName: verifiedAuth.enterpriseName,
      grantExpiredAt,
      amountMaxErrorTimes: EnterpriseAuthAmountMaxErrorTimes
    });
    expect(mocks.mongoSessionRun).not.toHaveBeenCalled();
    expect(mocks.clearTeamPlanCache).not.toHaveBeenCalled();
  });

  it('认证成功后清理套餐缓存失败不影响接口返回', async () => {
    const grantedAt = new Date('2026-06-15T00:00:00.000Z');
    const trialExpiredAt = addDays(grantedAt, EnterpriseAuthTrialDays);
    vi.useFakeTimers();
    vi.setSystemTime(grantedAt);

    const pendingTask = buildTask(0);
    const grantingTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.granting
    });
    const verifiedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.verified,
      grantExpiredAt: trialExpiredAt
    });
    const createdAdvancedSub = buildStandardSub({
      level: StandardSubLevelEnum.advanced,
      startTime: grantedAt,
      expiredTime: trialExpiredAt,
      totalPoints: EnterpriseAuthGrantPoints,
      surplusPoints: EnterpriseAuthGrantPoints
    });
    const verifiedAuth = buildVerifiedAuth(grantedAt);

    setupPendingTask(pendingTask);
    mocks.findTask.mockReturnValueOnce(mockSessionLean(grantingTask));
    mocks.findOneAndUpdateTask
      .mockResolvedValueOnce(grantingTask)
      .mockResolvedValueOnce(verifiedTask);
    mocks.findSub.mockReturnValueOnce(mockSession([]));
    mocks.findOneSub.mockReturnValueOnce(mockSession(null));
    mocks.createSub.mockResolvedValueOnce([createdAdvancedSub]);
    mocks.createAuth.mockResolvedValueOnce([verifiedAuth]);
    mocks.findAuth.mockReturnValue(mockSession(verifiedAuth));
    mocks.clearTeamPlanCache
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce(undefined);

    await expect(
      verifyEnterpriseAuthAmount({
        operator: {
          teamId,
          userId,
          tmbId
        },
        data: {
          taskId,
          amountFen: 13
        }
      })
    ).resolves.toEqual({
      status: TeamEnterpriseAuthStatusEnum.verified,
      verifiedEnterpriseName: verifiedAuth.enterpriseName,
      grantExpiredAt: trialExpiredAt,
      amountMaxErrorTimes: EnterpriseAuthAmountMaxErrorTimes
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(mocks.clearTeamPlanCache).toHaveBeenCalledTimes(2);
  });

  it('当前定制版优先生效时高级赠送接到定制版之后', async () => {
    const grantedAt = new Date('2026-06-15T00:00:00.000Z');
    const customExpiredAt = new Date('2026-07-10T00:00:00.000Z');
    const expectedAdvancedExpiredAt = addDays(customExpiredAt, EnterpriseAuthTrialDays);
    vi.useFakeTimers();
    vi.setSystemTime(grantedAt);

    const pendingTask = buildTask(0);
    const grantingTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.granting
    });
    const verifiedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.verified,
      grantExpiredAt: expectedAdvancedExpiredAt
    });
    const customSub = buildStandardSub({
      level: StandardSubLevelEnum.custom,
      startTime: new Date('2026-06-01T00:00:00.000Z'),
      expiredTime: customExpiredAt
    });
    const createdAdvancedSub = buildStandardSub({
      level: StandardSubLevelEnum.advanced,
      startTime: customExpiredAt,
      expiredTime: expectedAdvancedExpiredAt,
      totalPoints: EnterpriseAuthGrantPoints,
      surplusPoints: EnterpriseAuthGrantPoints
    });
    const verifiedAuth = buildVerifiedAuth(grantedAt);

    setupPendingTask(pendingTask);
    mocks.findTask.mockReturnValueOnce(mockSessionLean(grantingTask));
    mocks.findOneAndUpdateTask
      .mockResolvedValueOnce(grantingTask)
      .mockResolvedValueOnce(verifiedTask);
    mocks.findSub.mockReturnValueOnce(mockSession([customSub]));
    mocks.findOneSub.mockReturnValueOnce(mockSession(null));
    mocks.createSub.mockResolvedValueOnce([createdAdvancedSub]);
    mocks.createAuth.mockResolvedValueOnce([verifiedAuth]);
    mocks.findAuth.mockReturnValueOnce(mockSession(verifiedAuth));

    const result = await verifyEnterpriseAuthAmount({
      operator: {
        teamId,
        userId,
        tmbId
      },
      data: {
        taskId,
        amountFen: 13
      }
    });

    expect(mocks.createSub).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          startTime: customExpiredAt,
          expiredTime: expectedAdvancedExpiredAt,
          currentSubLevel: StandardSubLevelEnum.advanced
        })
      ],
      { session: {} }
    );
    expect(mocks.reComputeStandPlans).toHaveBeenCalledWith(teamId, {});

    const [, verifiedUpdate] = mocks.findOneAndUpdateTask.mock.calls[1];
    expect(verifiedUpdate.$set).not.toHaveProperty('grant');
    expect(result.grantExpiredAt).toEqual(expectedAdvancedExpiredAt);
  });

  it('已有生效 advanced 套餐时累加积分并延长有效期', async () => {
    const grantedAt = new Date('2026-06-15T00:00:00.000Z');
    const advancedExpiredAt = new Date('2026-06-25T00:00:00.000Z');
    const expectedAdvancedExpiredAt = addDays(advancedExpiredAt, EnterpriseAuthTrialDays);
    vi.useFakeTimers();
    vi.setSystemTime(grantedAt);

    const pendingTask = buildTask(0);
    const grantingTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.granting
    });
    const verifiedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.verified,
      grantExpiredAt: expectedAdvancedExpiredAt
    });
    const advancedSub = buildStandardSub({
      level: StandardSubLevelEnum.advanced,
      startTime: new Date('2026-06-01T00:00:00.000Z'),
      expiredTime: advancedExpiredAt,
      totalPoints: 1000,
      surplusPoints: 100
    });
    const verifiedAuth = buildVerifiedAuth(grantedAt);

    setupPendingTask(pendingTask);
    mocks.findTask.mockReturnValueOnce(mockSessionLean(grantingTask));
    mocks.findOneAndUpdateTask
      .mockResolvedValueOnce(grantingTask)
      .mockResolvedValueOnce(verifiedTask);
    mocks.findSub.mockReturnValueOnce(mockSession([advancedSub]));
    mocks.findOneSub.mockReturnValueOnce(mockSession(advancedSub));
    mocks.createAuth.mockResolvedValueOnce([verifiedAuth]);
    mocks.findAuth.mockReturnValueOnce(mockSession(verifiedAuth));

    const result = await verifyEnterpriseAuthAmount({
      operator: {
        teamId,
        userId,
        tmbId
      },
      data: {
        taskId,
        amountFen: 13
      }
    });

    expect(advancedSub.totalPoints).toBe(1000 + EnterpriseAuthGrantPoints);
    expect(advancedSub.surplusPoints).toBe(100 + EnterpriseAuthGrantPoints);
    expect(advancedSub.startTime).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(advancedSub.expiredTime).toEqual(expectedAdvancedExpiredAt);
    expect(advancedSub.save).toHaveBeenCalledWith({ session: {} });
    expect(mocks.createSub).not.toHaveBeenCalled();
    expect(result.grantExpiredAt).toEqual(expectedAdvancedExpiredAt);
  });

  it('已有过期 advanced 套餐时从当前时间重新发放并累加积分', async () => {
    const grantedAt = new Date('2026-06-15T00:00:00.000Z');
    const expectedAdvancedExpiredAt = addDays(grantedAt, EnterpriseAuthTrialDays);
    vi.useFakeTimers();
    vi.setSystemTime(grantedAt);

    const pendingTask = buildTask(0);
    const grantingTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.granting
    });
    const verifiedTask = buildTask(0, {
      status: TeamEnterpriseAuthTaskStatusEnum.verified,
      grantExpiredAt: expectedAdvancedExpiredAt
    });
    const advancedSub = buildStandardSub({
      level: StandardSubLevelEnum.advanced,
      startTime: new Date('2026-05-01T00:00:00.000Z'),
      expiredTime: new Date('2026-05-20T00:00:00.000Z'),
      totalPoints: 1000,
      surplusPoints: 100
    });
    const verifiedAuth = buildVerifiedAuth(grantedAt);

    setupPendingTask(pendingTask);
    mocks.findTask.mockReturnValueOnce(mockSessionLean(grantingTask));
    mocks.findOneAndUpdateTask
      .mockResolvedValueOnce(grantingTask)
      .mockResolvedValueOnce(verifiedTask);
    mocks.findSub.mockReturnValueOnce(mockSession([]));
    mocks.findOneSub.mockReturnValueOnce(mockSession(advancedSub));
    mocks.createAuth.mockResolvedValueOnce([verifiedAuth]);
    mocks.findAuth.mockReturnValueOnce(mockSession(verifiedAuth));

    const result = await verifyEnterpriseAuthAmount({
      operator: {
        teamId,
        userId,
        tmbId
      },
      data: {
        taskId,
        amountFen: 13
      }
    });

    expect(advancedSub.totalPoints).toBe(1000 + EnterpriseAuthGrantPoints);
    expect(advancedSub.surplusPoints).toBe(100 + EnterpriseAuthGrantPoints);
    expect(advancedSub.startTime).toEqual(grantedAt);
    expect(advancedSub.expiredTime).toEqual(expectedAdvancedExpiredAt);
    expect(advancedSub.save).toHaveBeenCalledWith({ session: {} });
    expect(mocks.createSub).not.toHaveBeenCalled();
    expect(result.grantExpiredAt).toEqual(expectedAdvancedExpiredAt);
  });
});
