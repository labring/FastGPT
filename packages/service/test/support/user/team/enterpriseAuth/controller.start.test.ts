import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnterpriseAuthErrEnum,
  EnterpriseAuthMaxTimes,
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import { StartEnterpriseAuthBodySchema } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';

const mocks = vi.hoisted(() => ({
  findAuth: vi.fn(),
  existsAuth: vi.fn(),
  createTask: vi.fn(),
  findTask: vi.fn(),
  updateTask: vi.fn(),
  updateManyTask: vi.fn(),
  findOneAndUpdateTask: vi.fn(),
  createTransfer: vi.fn(),
  hasServiceConfig: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/enterpriseAuth/schema', () => ({
  MongoTeamEnterpriseAuth: {
    findOne: mocks.findAuth,
    exists: mocks.existsAuth
  },
  MongoTeamEnterpriseAuthTask: {
    create: mocks.createTask,
    findOne: mocks.findTask,
    updateOne: mocks.updateTask,
    updateMany: mocks.updateManyTask,
    findOneAndUpdate: mocks.findOneAndUpdateTask
  }
}));

vi.mock('@fastgpt/service/support/user/team/enterpriseAuth/transferClient', () => ({
  createEnterpriseAuthTransfer: mocks.createTransfer,
  hasEnterpriseAuthServiceConfig: mocks.hasServiceConfig,
  getEnterpriseAuthBanks: vi.fn()
}));

const { getEnterpriseAuthStatus, resetEnterpriseAuthTask, startEnterpriseAuth } =
  await import('@fastgpt/service/support/user/team/enterpriseAuth/controller');

const teamId = '507f1f77bcf86cd799439011';

const validStartBody = {
  enterpriseName: '示例科技有限公司',
  unifiedCreditCode: '91310000MA1K000000',
  legalPersonName: '张三',
  bankAccount: '6222 0000 0000 0000',
  bankName: '中国工商银行',
  contactName: '李四',
  contactTitle: '产品负责人',
  contactPhone: '13800000000',
  demand: '企业知识库试用'
};

const mockLean = <T>(value: T) => ({
  lean: vi.fn().mockResolvedValue(value)
});

const mockSortedLean = <T>(value: T) => ({
  lean: vi.fn().mockResolvedValue(value),
  sort: vi.fn().mockReturnValue({
    lean: vi.fn().mockResolvedValue(value)
  })
});

const buildTask = (status: TeamEnterpriseAuthTaskStatusEnum, overrides: Record<string, any> = {}) =>
  ({
    teamId,
    taskId: `task_${status}`,
    status,
    enterpriseName: '示例科技有限公司',
    unifiedCreditCode: '91310000MA1K000000',
    legalPersonName: '张三',
    bankName: '中国工商银行',
    bankAccount: '6222000000000000',
    contactName: '李四',
    contactTitle: '产品负责人',
    contactPhone: '13800000000',
    demand: '企业知识库试用',
    amountErrorTimes: 0,
    usedTimes: 1,
    startedAt: new Date(Date.now() - 60 * 1000),
    expireAt: new Date(Date.now() + 60 * 60 * 1000),
    createTime: new Date(Date.now() - 60 * 1000),
    updateTime: new Date(Date.now() - 60 * 1000),
    ...overrides
  }) as any;

const findTaskUpdateByStatus = (status: TeamEnterpriseAuthTaskStatusEnum) =>
  mocks.findOneAndUpdateTask.mock.calls.find(([, update]) => update?.$set?.status === status) as
    | any[]
    | undefined;

describe('startEnterpriseAuth', () => {
  let mockedTaskRow: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedTaskRow = undefined;
    mocks.findAuth.mockReturnValue(mockLean(null));
    mocks.existsAuth.mockResolvedValue(null);
    mocks.findTask.mockReturnValue(mockSortedLean(null));
    mocks.createTask.mockResolvedValue([buildTask(TeamEnterpriseAuthTaskStatusEnum.starting)]);
    mocks.updateManyTask.mockResolvedValue({
      modifiedCount: 0
    });
    mocks.findOneAndUpdateTask.mockImplementation((filter, update) => {
      const status = update?.$set?.status ?? TeamEnterpriseAuthTaskStatusEnum.pending_amount;
      const baseUsedTimes = update?.$set?.usedTimes ?? mockedTaskRow?.usedTimes ?? 0;
      mockedTaskRow = buildTask(status, {
        ...mockedTaskRow,
        ...update?.$set,
        taskId: update?.$set?.taskId ?? filter?.taskId ?? mockedTaskRow?.taskId ?? 'task_1',
        usedTimes: baseUsedTimes + (update?.$inc?.usedTimes ?? 0)
      });
      return mockLean(mockedTaskRow);
    });
    mocks.hasServiceConfig.mockReturnValue(true);
    mocks.createTransfer.mockResolvedValue({
      type: 'success',
      orderId: 'order_1',
      transferAmountFen: 13,
      transferRespCode: 'SUCCESS',
      transferRespMsg: 'ok'
    });
  });

  it('发起认证时按 teamId 写入唯一任务行，认证服务返回成功后递增认证次数', async () => {
    const result = await startEnterpriseAuth({
      teamId,
      data: validStartBody
    });

    expect(mocks.createTask).not.toHaveBeenCalled();
    const startingCall = findTaskUpdateByStatus(TeamEnterpriseAuthTaskStatusEnum.starting);
    expect(startingCall).toBeTruthy();
    const [startingFilter, startingUpdate, startingOptions] = startingCall!;
    expect(startingFilter).toEqual(
      expect.objectContaining({
        teamId,
        $and: [
          { status: { $nin: expect.any(Array) } },
          { usedTimes: { $lt: EnterpriseAuthMaxTimes } }
        ]
      })
    );
    expect(startingUpdate.$set).toEqual(
      expect.objectContaining({
        taskId: expect.any(String),
        status: TeamEnterpriseAuthTaskStatusEnum.starting,
        unifiedCreditCode: '91310000MA1K000000',
        bankAccount: '6222000000000000',
        usedTimes: 0
      })
    );
    expect(startingUpdate.$unset).toEqual(
      expect.objectContaining({
        orderId: 1,
        transferAmountFen: 1,
        transferRespCode: 1,
        transferRespMsg: 1,
        grantExpiredAt: 1,
        lastErrorCode: 1,
        lastErrorMessage: 1,
        expireAt: 1,
        endedAt: 1
      })
    );
    expect(startingOptions).toEqual(
      expect.objectContaining({
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      })
    );

    const pendingAmountCall = findTaskUpdateByStatus(
      TeamEnterpriseAuthTaskStatusEnum.pending_amount
    );
    expect(pendingAmountCall).toBeTruthy();
    const [, pendingAmountUpdate] = pendingAmountCall!;
    expect(pendingAmountUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        orderId: 'order_1',
        transferAmountFen: 13
      })
    );
    expect(pendingAmountUpdate.$inc).toEqual({
      usedTimes: 1
    });
    expect(pendingAmountUpdate.$set).not.toHaveProperty('transferAmountRaw');
    expect(pendingAmountUpdate.$set).not.toHaveProperty('isCharged');
    expect(result).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthStatusEnum.verifying,
        usedTimes: 1,
        currentTask: expect.objectContaining({
          status: TeamEnterpriseAuthTaskStatusEnum.pending_amount
        })
      })
    );
  });

  it('非首次认证覆盖同团队旧任务行并清理上一轮任务字段', async () => {
    const previousTask = buildTask(TeamEnterpriseAuthTaskStatusEnum.info_failed, {
      taskId: 'task_old',
      usedTimes: 1,
      orderId: 'order_old',
      transferAmountFen: 99,
      transferRespCode: 'OLD_CODE',
      transferRespMsg: 'old msg',
      grantExpiredAt: new Date('2026-07-01T00:00:00.000Z'),
      lastErrorCode: EnterpriseAuthErrEnum.infoFailed,
      lastErrorMessage: 'old error',
      expireAt: new Date('2026-06-20T00:00:00.000Z'),
      endedAt: new Date('2026-06-16T00:00:00.000Z'),
      startedAt: new Date(Date.now() - 2 * 60 * 1000)
    });
    mockedTaskRow = previousTask;
    mocks.findTask
      .mockReturnValueOnce(mockSortedLean(null))
      .mockReturnValueOnce(mockSortedLean(null))
      .mockReturnValueOnce(mockSortedLean(previousTask))
      .mockReturnValueOnce(mockSortedLean(previousTask))
      .mockReturnValueOnce(mockSortedLean(null));

    const result = await startEnterpriseAuth({
      teamId,
      data: validStartBody
    });

    expect(mocks.createTask).not.toHaveBeenCalled();
    const startingCall = findTaskUpdateByStatus(TeamEnterpriseAuthTaskStatusEnum.starting);
    expect(startingCall).toBeTruthy();
    const [, startingUpdate] = startingCall!;
    expect(startingUpdate.$set).toEqual(
      expect.objectContaining({
        taskId: expect.any(String),
        status: TeamEnterpriseAuthTaskStatusEnum.starting,
        bankAccount: '6222000000000000',
        amountErrorTimes: 0,
        usedTimes: previousTask.usedTimes
      })
    );
    expect(startingUpdate.$unset).toEqual(
      expect.objectContaining({
        orderId: 1,
        transferAmountFen: 1,
        transferRespCode: 1,
        transferRespMsg: 1,
        grantExpiredAt: 1,
        lastErrorCode: 1,
        lastErrorMessage: 1,
        expireAt: 1,
        endedAt: 1
      })
    );

    const pendingAmountCall = findTaskUpdateByStatus(
      TeamEnterpriseAuthTaskStatusEnum.pending_amount
    );
    expect(pendingAmountCall).toBeTruthy();
    const [, pendingAmountUpdate] = pendingAmountCall!;
    expect(pendingAmountUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        orderId: 'order_1',
        transferAmountFen: 13
      })
    );
    expect(pendingAmountUpdate.$inc).toEqual({
      usedTimes: 1
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthStatusEnum.verifying,
        usedTimes: previousTask.usedTimes + 1
      })
    );
  });

  it('认证信息错误只结束任务，不消耗认证次数', async () => {
    mocks.createTransfer.mockResolvedValueOnce({
      type: 'info_failed',
      transferRespCode: 'INFO_ERROR',
      transferRespMsg: '企业信息不匹配'
    });

    await expect(
      startEnterpriseAuth({
        teamId,
        data: validStartBody
      })
    ).rejects.toThrow(EnterpriseAuthErrEnum.infoFailed);

    const [, updateDoc] = mocks.updateTask.mock.calls.at(-1)!;
    expect(updateDoc.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.info_failed,
        lastErrorCode: EnterpriseAuthErrEnum.infoFailed,
        transferRespCode: 'INFO_ERROR',
        transferRespMsg: '企业信息不匹配'
      })
    );
    expect(updateDoc.$set).not.toHaveProperty('usedTimes');
  });

  it('发起认证入参会规范化银行账号并拒绝非数字账号', () => {
    expect(StartEnterpriseAuthBodySchema.parse(validStartBody).bankAccount).toBe(
      '6222000000000000'
    );

    expect(() =>
      StartEnterpriseAuthBodySchema.parse({
        ...validStartBody,
        bankAccount: '6222-0000'
      })
    ).toThrow();
  });

  it('抢锁前按统一信用代码释放已过期或超时任务', async () => {
    await startEnterpriseAuth({
      teamId,
      data: validStartBody
    });

    expect(mocks.updateManyTask).toHaveBeenCalledTimes(4);
    const [expiredAmountFilter, expiredAmountUpdate] = mocks.updateManyTask.mock.calls[0];
    expect(expiredAmountFilter).toEqual(
      expect.objectContaining({
        unifiedCreditCode: '91310000MA1K000000',
        status: {
          $in: [
            TeamEnterpriseAuthTaskStatusEnum.pending_amount,
            TeamEnterpriseAuthTaskStatusEnum.amount_failed
          ]
        }
      })
    );
    expect(expiredAmountFilter.expireAt.$lte).toBeInstanceOf(Date);
    expect(expiredAmountUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.expired,
        lastErrorCode: EnterpriseAuthErrEnum.taskExpired
      })
    );

    const [timeoutStartingFilter, timeoutStartingUpdate] = mocks.updateManyTask.mock.calls[1];
    expect(timeoutStartingFilter).toEqual(
      expect.objectContaining({
        unifiedCreditCode: '91310000MA1K000000',
        status: TeamEnterpriseAuthTaskStatusEnum.starting
      })
    );
    expect(timeoutStartingFilter.startedAt.$lt).toBeInstanceOf(Date);
    expect(timeoutStartingUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
        lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout
      })
    );
  });

  it('抢锁前清理历史 granting 临时态，且新任务锁集合不包含 granting', async () => {
    await startEnterpriseAuth({
      teamId,
      data: validStartBody
    });

    const startingCall = findTaskUpdateByStatus(TeamEnterpriseAuthTaskStatusEnum.starting);
    expect(startingCall).toBeTruthy();
    const [startingFilter] = startingCall!;
    const pendingStatuses = startingFilter.$and[0].status.$nin;
    expect(pendingStatuses).not.toContain(TeamEnterpriseAuthTaskStatusEnum.granting);

    expect(mocks.updateManyTask).toHaveBeenCalledTimes(4);
    const [expiredGrantingFilter, expiredGrantingUpdate] = mocks.updateManyTask.mock.calls[2];
    expect(expiredGrantingFilter).toEqual(
      expect.objectContaining({
        unifiedCreditCode: '91310000MA1K000000',
        status: TeamEnterpriseAuthTaskStatusEnum.granting
      })
    );
    expect(expiredGrantingFilter.expireAt.$lte).toBeInstanceOf(Date);
    expect(expiredGrantingUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.expired,
        lastErrorCode: EnterpriseAuthErrEnum.taskExpired
      })
    );

    const [retryGrantingFilter, retryGrantingUpdate] = mocks.updateManyTask.mock.calls[3];
    expect(retryGrantingFilter).toEqual(
      expect.objectContaining({
        unifiedCreditCode: '91310000MA1K000000',
        status: TeamEnterpriseAuthTaskStatusEnum.granting
      })
    );
    expect(retryGrantingFilter.expireAt.$gt).toBeInstanceOf(Date);
    expect(retryGrantingUpdate.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
        lastErrorCode: EnterpriseAuthErrEnum.processing
      })
    );
  });

  it('已有未完成任务时发起认证直接恢复轻量任务', async () => {
    const currentTask = buildTask(TeamEnterpriseAuthTaskStatusEnum.starting);
    mocks.findTask
      .mockReturnValueOnce(mockSortedLean(null))
      .mockReturnValueOnce(mockSortedLean(currentTask))
      .mockReturnValueOnce(mockSortedLean(null));

    await expect(
      startEnterpriseAuth({
        teamId,
        data: validStartBody
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthStatusEnum.verifying,
        currentTask: expect.objectContaining({
          taskId: 'task_starting',
          status: TeamEnterpriseAuthTaskStatusEnum.starting
        }),
        usedTimes: 1
      })
    );
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('次数达到上限时拒绝继续发起认证', async () => {
    mocks.findTask
      .mockReturnValueOnce(mockSortedLean(null))
      .mockReturnValueOnce(mockSortedLean(null))
      .mockReturnValueOnce(
        mockSortedLean(
          buildTask(TeamEnterpriseAuthTaskStatusEnum.info_failed, {
            usedTimes: EnterpriseAuthMaxTimes
          })
        )
      );

    await expect(
      startEnterpriseAuth({
        teamId,
        data: validStartBody
      })
    ).rejects.toThrow(EnterpriseAuthErrEnum.noRemainingTimes);
  });

  it('状态接口聚合成功信息表和最新任务，不创建未认证状态行', async () => {
    mocks.findAuth.mockReturnValueOnce(mockLean(null));
    mocks.findTask.mockReturnValueOnce(mockSortedLean(null));

    await expect(getEnterpriseAuthStatus({ teamId, canManage: true })).resolves.toEqual({
      enabled: true,
      status: TeamEnterpriseAuthStatusEnum.unverified,
      usedTimes: 0,
      canManage: true,
      verifiedEnterpriseName: undefined,
      currentTask: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined
    });
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('重置信息时取消金额验证任务并清理旧错误提示', async () => {
    const task = buildTask(TeamEnterpriseAuthTaskStatusEnum.amount_failed, {
      amountErrorTimes: 1,
      lastErrorCode: EnterpriseAuthErrEnum.amountError,
      lastErrorMessage: '验证金额错误'
    });
    mocks.findTask.mockReturnValueOnce(mockSortedLean(task)).mockReturnValueOnce(mockLean(task));
    mocks.updateTask.mockResolvedValueOnce({
      matchedCount: 1
    });

    await resetEnterpriseAuthTask(teamId);

    const [, updateDoc] = mocks.updateTask.mock.calls.at(-1)!;
    expect(updateDoc.$set).toEqual(
      expect.objectContaining({
        status: TeamEnterpriseAuthTaskStatusEnum.canceled
      })
    );
    expect(updateDoc.$unset).toEqual({
      lastErrorCode: 1,
      lastErrorMessage: 1
    });
  });
});
