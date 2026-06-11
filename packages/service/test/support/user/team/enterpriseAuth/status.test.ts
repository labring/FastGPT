import { describe, expect, it } from 'vitest';
import {
  EnterpriseAuthErrEnum,
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  deriveExpiredTaskPatch,
  toTerminalTaskError
} from '@fastgpt/service/support/user/team/enterpriseAuth/status';

const now = new Date('2026-06-16T00:00:00.000Z');
const serviceTimeoutMs = 30 * 1000;

const buildTask = (task: Record<string, any>) =>
  ({
    teamId: '507f1f77bcf86cd799439011',
    taskId: 'task_1',
    usedTimes: 1,
    amountErrorTimes: 0,
    startedAt: new Date(now.getTime() - 10 * 1000),
    createTime: new Date(now.getTime() - 10 * 1000),
    updateTime: new Date(now.getTime() - 10 * 1000),
    ...task
  }) as any;

describe('deriveExpiredTaskPatch', () => {
  it('金额验证任务过期时返回统一失败补丁', () => {
    const patch = deriveExpiredTaskPatch({
      task: buildTask({
        status: TeamEnterpriseAuthTaskStatusEnum.pending_amount,
        expireAt: new Date(now.getTime() - 1)
      }),
      now,
      serviceTimeoutMs
    });

    expect(patch).toEqual({
      status: TeamEnterpriseAuthStatusEnum.failed,
      taskStatus: TeamEnterpriseAuthTaskStatusEnum.expired,
      endedAt: now,
      lastErrorCode: EnterpriseAuthErrEnum.taskExpired,
      lastErrorMessage: '认证任务已过期，请重新填写'
    });
  });

  it('starting 任务服务超时时返回统一失败补丁', () => {
    const patch = deriveExpiredTaskPatch({
      task: buildTask({
        status: TeamEnterpriseAuthTaskStatusEnum.starting,
        startedAt: new Date(now.getTime() - serviceTimeoutMs - 1)
      }),
      now,
      serviceTimeoutMs
    });

    expect(patch).toEqual({
      status: TeamEnterpriseAuthStatusEnum.failed,
      taskStatus: TeamEnterpriseAuthTaskStatusEnum.service_failed,
      endedAt: now,
      lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout,
      lastErrorMessage: '服务网络超时，请稍后重试'
    });
  });

  it('未过期或已结束任务不返回补丁', () => {
    expect(
      deriveExpiredTaskPatch({
        task: buildTask({
          status: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
          expireAt: new Date(now.getTime() + 1)
        }),
        now,
        serviceTimeoutMs
      })
    ).toBeUndefined();

    expect(
      deriveExpiredTaskPatch({
        task: buildTask({
          status: TeamEnterpriseAuthTaskStatusEnum.canceled,
          expireAt: new Date(now.getTime() - 1)
        }),
        now,
        serviceTimeoutMs
      })
    ).toBeUndefined();
  });

  it('granting 是事务内临时态，不参与过期恢复推导', () => {
    expect(
      deriveExpiredTaskPatch({
        task: buildTask({
          status: TeamEnterpriseAuthTaskStatusEnum.granting,
          expireAt: new Date(now.getTime() - 1)
        }),
        now,
        serviceTimeoutMs
      })
    ).toBeUndefined();
  });
});

describe('toTerminalTaskError', () => {
  it('已落库过期和服务超时任务保留对外错误语义', () => {
    expect(
      toTerminalTaskError(
        buildTask({
          status: TeamEnterpriseAuthTaskStatusEnum.expired,
          lastErrorCode: EnterpriseAuthErrEnum.taskExpired
        })
      )
    ).toBe(EnterpriseAuthErrEnum.taskExpired);

    expect(
      toTerminalTaskError(
        buildTask({
          status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
          lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout
        })
      )
    ).toBe(EnterpriseAuthErrEnum.serviceTimeout);
  });

  it('非超时 service_failed 不对外伪装成服务超时', () => {
    expect(
      toTerminalTaskError(
        buildTask({
          status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
          lastErrorCode: EnterpriseAuthErrEnum.enterpriseOccupied
        })
      )
    ).toBeUndefined();
  });
});
