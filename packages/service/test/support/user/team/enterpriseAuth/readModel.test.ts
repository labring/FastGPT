import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnterpriseAuthErrEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';

const mocks = vi.hoisted(() => ({
  findAuth: vi.fn(),
  findTask: vi.fn(),
  updateTask: vi.fn(),
  hasServiceConfig: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/enterpriseAuth/schema', () => ({
  MongoTeamEnterpriseAuth: {
    findOne: mocks.findAuth
  },
  MongoTeamEnterpriseAuthTask: {
    findOne: mocks.findTask,
    updateOne: mocks.updateTask
  }
}));

vi.mock('@fastgpt/service/support/user/team/enterpriseAuth/transferClient', () => ({
  hasEnterpriseAuthServiceConfig: mocks.hasServiceConfig
}));

const { getEnterpriseAuthCurrentTaskDetail } =
  await import('@fastgpt/service/support/user/team/enterpriseAuth/readModel');

const teamId = '507f1f77bcf86cd799439011';

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
    transferAmountFen: 13,
    amountErrorTimes: status === TeamEnterpriseAuthTaskStatusEnum.amount_failed ? 1 : 0,
    usedTimes: 1,
    startedAt: new Date(Date.now() - 60 * 1000),
    expireAt: new Date(Date.now() + 60 * 60 * 1000),
    createTime: new Date(Date.now() - 60 * 1000),
    updateTime: new Date(Date.now() - 60 * 1000),
    ...overrides
  }) as any;

describe('getEnterpriseAuthCurrentTaskDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasServiceConfig.mockReturnValue(true);
    mocks.findTask.mockReturnValue(mockSortedLean(null));
    mocks.updateTask.mockResolvedValue({ matchedCount: 0 });
  });

  it.each([
    TeamEnterpriseAuthTaskStatusEnum.pending_amount,
    TeamEnterpriseAuthTaskStatusEnum.amount_failed
  ])('%s 任务可读取完整任务详情并返回明文账号', async (status) => {
    const task = buildTask(status);
    mocks.findTask.mockReturnValueOnce(mockSortedLean(task));

    const result = await getEnterpriseAuthCurrentTaskDetail(teamId);

    expect(result).toEqual(
      expect.objectContaining({
        taskId: task.taskId,
        status,
        enterpriseName: task.enterpriseName,
        bankAccount: '6222000000000000',
        amountErrorTimes: task.amountErrorTimes,
        expireAt: task.expireAt
      })
    );
  });

  it.each([TeamEnterpriseAuthTaskStatusEnum.starting, TeamEnterpriseAuthTaskStatusEnum.granting])(
    '%s 任务不允许读取金额验证详情',
    async (status) => {
      const task = buildTask(status, {
        ...(status === TeamEnterpriseAuthTaskStatusEnum.starting ? { startedAt: new Date() } : {})
      });
      mocks.findTask.mockReturnValueOnce(mockSortedLean(task));

      await expect(getEnterpriseAuthCurrentTaskDetail(teamId)).rejects.toThrow(
        EnterpriseAuthErrEnum.taskNotFound
      );
    }
  );

  it('已落库过期任务读取详情时返回 taskExpired', async () => {
    const task = buildTask(TeamEnterpriseAuthTaskStatusEnum.expired, {
      lastErrorCode: EnterpriseAuthErrEnum.taskExpired,
      expireAt: new Date(Date.now() - 1000)
    });
    mocks.findTask.mockReturnValueOnce(mockSortedLean(task));

    await expect(getEnterpriseAuthCurrentTaskDetail(teamId)).rejects.toThrow(
      EnterpriseAuthErrEnum.taskExpired
    );
  });

  it('已落库服务超时任务读取详情时返回 serviceTimeout', async () => {
    const task = buildTask(TeamEnterpriseAuthTaskStatusEnum.service_failed, {
      lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout
    });
    mocks.findTask.mockReturnValueOnce(mockSortedLean(task));

    await expect(getEnterpriseAuthCurrentTaskDetail(teamId)).rejects.toThrow(
      EnterpriseAuthErrEnum.serviceTimeout
    );
  });
});
