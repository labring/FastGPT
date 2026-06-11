import {
  EnterpriseAuthErrEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import { serviceEnv } from '../../../../env';
import { enabledGuard, pendingTaskStatuses } from './common';
import { MongoTeamEnterpriseAuthTask } from './schema';
import { deriveExpiredTaskPatch, isPendingAmountTask } from './status';

const buildExpiredTaskUpdate = (
  patch: NonNullable<ReturnType<typeof deriveExpiredTaskPatch>>,
  now: Date
) => ({
  $set: {
    status: patch.taskStatus,
    endedAt: patch.endedAt,
    lastErrorCode: patch.lastErrorCode,
    lastErrorMessage: patch.lastErrorMessage,
    updateTime: now
  }
});

/**
 * 清理历史遗留的 granting 临时态。
 *
 * granting 只允许存在于金额验证成功事务内；若事务异常中断留下该状态，需要按金额验证窗口
 * 恢复成可重试或已过期状态，避免长期占用统一社会信用代码唯一锁。
 */
const restoreStaleGrantingTasksIfNeeded = async (filter: Record<string, any>, now: Date) => {
  const staleBefore = new Date(now.getTime() - serviceEnv.ENTERPRISE_AUTH_SERVICE_TIMEOUT_MS);

  const expiredGrantingTaskResult = await MongoTeamEnterpriseAuthTask.updateMany(
    {
      ...filter,
      status: TeamEnterpriseAuthTaskStatusEnum.granting,
      expireAt: { $lte: now }
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.expired,
        endedAt: now,
        lastErrorCode: EnterpriseAuthErrEnum.taskExpired,
        lastErrorMessage: '认证任务已过期，请重新填写',
        updateTime: now
      }
    }
  );

  const retryableGrantingTaskResult = await MongoTeamEnterpriseAuthTask.updateMany(
    {
      ...filter,
      status: TeamEnterpriseAuthTaskStatusEnum.granting,
      expireAt: { $gt: now },
      $or: [{ updateTime: { $lt: staleBefore } }, { updateTime: { $exists: false } }]
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.amount_failed,
        lastErrorCode: EnterpriseAuthErrEnum.processing,
        lastErrorMessage: '认证处理中断，请重新提交金额',
        updateTime: now
      }
    }
  );

  return (
    (expiredGrantingTaskResult.modifiedCount ?? 0) +
    (retryableGrantingTaskResult.modifiedCount ?? 0)
  );
};

/**
 * 按统一社会信用代码释放已经失效的 active 锁。
 *
 * activeUnifiedCreditCode 依赖唯一索引阻止同一企业被并发认证；如果持锁团队后续不再访问
 * 自己的认证接口，按 teamId 触发的过期清理不会执行，其他团队会一直被唯一索引挡住。
 * 因此新团队抢锁前需要按信用代码主动清理已过期的金额验证任务和已超时的 starting 任务。
 */
export const expireActiveUnifiedCreditCodeLocksIfNeeded = async (
  normalizedUnifiedCreditCode: string
) => {
  const now = new Date();

  const expiredAmountTaskResult = await MongoTeamEnterpriseAuthTask.updateMany(
    {
      unifiedCreditCode: normalizedUnifiedCreditCode,
      status: {
        $in: [
          TeamEnterpriseAuthTaskStatusEnum.pending_amount,
          TeamEnterpriseAuthTaskStatusEnum.amount_failed
        ]
      },
      expireAt: { $lte: now }
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.expired,
        endedAt: now,
        lastErrorCode: EnterpriseAuthErrEnum.taskExpired,
        lastErrorMessage: '认证任务已过期，请重新填写',
        updateTime: now
      }
    }
  );

  const timeoutStartingTaskResult = await MongoTeamEnterpriseAuthTask.updateMany(
    {
      unifiedCreditCode: normalizedUnifiedCreditCode,
      status: TeamEnterpriseAuthTaskStatusEnum.starting,
      startedAt: {
        $lt: new Date(now.getTime() - serviceEnv.ENTERPRISE_AUTH_SERVICE_TIMEOUT_MS)
      }
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.service_failed,
        endedAt: now,
        lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout,
        lastErrorMessage: '服务网络超时，请稍后重试',
        updateTime: now
      }
    }
  );

  const staleGrantingTaskCount = await restoreStaleGrantingTasksIfNeeded(
    {
      unifiedCreditCode: normalizedUnifiedCreditCode
    },
    now
  );

  return (
    (expiredAmountTaskResult.modifiedCount ?? 0) +
    (timeoutStartingTaskResult.modifiedCount ?? 0) +
    staleGrantingTaskCount
  );
};

/**
 * 读取或写入当前认证任务前先处理过期任务，避免依赖定时任务才能结束金额验证窗口。
 */
export const expireCurrentTaskIfNeeded = async (teamId: string) => {
  const now = new Date();
  const task = await MongoTeamEnterpriseAuthTask.findOne({
    teamId,
    status: {
      $in: pendingTaskStatuses
    }
  }).lean();
  if (!task) return;

  const expiredPatch = deriveExpiredTaskPatch({
    task,
    now,
    serviceTimeoutMs: serviceEnv.ENTERPRISE_AUTH_SERVICE_TIMEOUT_MS
  });
  if (!expiredPatch) return task;

  await MongoTeamEnterpriseAuthTask.updateOne(
    {
      teamId,
      taskId: task.taskId,
      status: task.status
    },
    buildExpiredTaskUpdate(expiredPatch, now)
  );

  return MongoTeamEnterpriseAuthTask.findOne({ teamId, taskId: task.taskId }).lean();
};

export const resetEnterpriseAuthTask = async (teamId: string) => {
  enabledGuard();
  const task = await expireCurrentTaskIfNeeded(teamId);
  if (!task || !isPendingAmountTask(task)) {
    return;
  }

  const now = new Date();
  await MongoTeamEnterpriseAuthTask.updateOne(
    {
      teamId,
      taskId: task.taskId,
      status: {
        $in: [
          TeamEnterpriseAuthTaskStatusEnum.pending_amount,
          TeamEnterpriseAuthTaskStatusEnum.amount_failed
        ]
      }
    },
    {
      $set: {
        status: TeamEnterpriseAuthTaskStatusEnum.canceled,
        endedAt: now,
        updateTime: now
      },
      $unset: {
        lastErrorCode: 1,
        lastErrorMessage: 1
      }
    }
  );
};
