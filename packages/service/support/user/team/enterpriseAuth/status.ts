import {
  EnterpriseAuthErrEnum,
  TeamEnterpriseAuthStatusEnum,
  TeamEnterpriseAuthTaskStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import type { EnterpriseAuthTaskType } from '@fastgpt/global/support/user/team/enterpriseAuth/type';
import type { EnterpriseAuthTaskOwner } from './common';
import { pendingTaskStatuses } from './common';

export type EnterpriseAuthExpiredTaskPatch = {
  status: TeamEnterpriseAuthStatusEnum.failed;
  taskStatus:
    | TeamEnterpriseAuthTaskStatusEnum.expired
    | TeamEnterpriseAuthTaskStatusEnum.service_failed;
  endedAt: Date;
  lastErrorCode: EnterpriseAuthErrEnum.taskExpired | EnterpriseAuthErrEnum.serviceTimeout;
  lastErrorMessage: string;
};

export const isPendingAmountTask = (task?: EnterpriseAuthTaskType | null) => {
  const status = task?.status;
  return (
    status === TeamEnterpriseAuthTaskStatusEnum.pending_amount ||
    status === TeamEnterpriseAuthTaskStatusEnum.amount_failed
  );
};

/**
 * 将已经落库的终态任务还原为对外错误语义。
 * 过期和服务超时需要让前端区分原因；其他终态仍按无可恢复任务处理。
 */
export const toTerminalTaskError = (task?: EnterpriseAuthTaskType | null) => {
  if (!task) return;
  if (task.status === TeamEnterpriseAuthTaskStatusEnum.expired) {
    return EnterpriseAuthErrEnum.taskExpired;
  }
  if (task.status === TeamEnterpriseAuthTaskStatusEnum.service_failed) {
    return task.lastErrorCode === EnterpriseAuthErrEnum.serviceTimeout
      ? EnterpriseAuthErrEnum.serviceTimeout
      : undefined;
  }
};

export const hasUnfinishedTask = (auth?: EnterpriseAuthTaskOwner | null) =>
  !!auth?.currentTask && pendingTaskStatuses.includes(auth.currentTask.status as any);

export const buildLightTask = (auth?: EnterpriseAuthTaskOwner | null) => {
  const task = auth?.currentTask;
  if (!task || !hasUnfinishedTask(auth)) return;

  return {
    taskId: task.taskId,
    status: task.status,
    amountErrorTimes: task.amountErrorTimes,
    expireAt: task.expireAt
  };
};

/**
 * 统一推导当前任务是否已经过期或服务超时。
 *
 * 该函数不读写数据库，只根据 auth、当前时间和服务超时时间返回状态补丁。只读状态接口
 * 和写入口落库过期状态都必须复用它，避免新增任务状态时出现两套判断。
 */
export const deriveExpiredTaskPatch = ({
  task,
  now,
  serviceTimeoutMs
}: {
  task?: EnterpriseAuthTaskType | null;
  now: Date;
  serviceTimeoutMs: number;
}): EnterpriseAuthExpiredTaskPatch | undefined => {
  if (!task || !pendingTaskStatuses.includes(task.status as any)) return;

  const shouldExpireAmountTask =
    isPendingAmountTask(task) && task.expireAt && task.expireAt.getTime() <= now.getTime();
  const shouldExpireStartingTask =
    task.status === TeamEnterpriseAuthTaskStatusEnum.starting &&
    now.getTime() - task.startedAt.getTime() > serviceTimeoutMs;

  if (!shouldExpireAmountTask && !shouldExpireStartingTask) return;

  if (shouldExpireAmountTask) {
    return {
      status: TeamEnterpriseAuthStatusEnum.failed,
      taskStatus: TeamEnterpriseAuthTaskStatusEnum.expired,
      endedAt: now,
      lastErrorCode: EnterpriseAuthErrEnum.taskExpired,
      lastErrorMessage: '认证任务已过期，请重新填写'
    };
  }

  return {
    status: TeamEnterpriseAuthStatusEnum.failed,
    taskStatus: TeamEnterpriseAuthTaskStatusEnum.service_failed,
    endedAt: now,
    lastErrorCode: EnterpriseAuthErrEnum.serviceTimeout,
    lastErrorMessage: '服务网络超时，请稍后重试'
  };
};
