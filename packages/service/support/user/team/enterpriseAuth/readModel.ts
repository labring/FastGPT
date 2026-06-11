import {
  EnterpriseAuthErrEnum,
  TeamEnterpriseAuthStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import type {
  EnterpriseAuthTaskType,
  TeamEnterpriseAuthType
} from '@fastgpt/global/support/user/team/enterpriseAuth/type';
import { serviceEnv } from '../../../../env';
import {
  buildVerifiedEnterpriseName,
  enabledGuard,
  getDefaultAuthStatusRecord,
  pendingTaskStatuses,
  type EnterpriseAuthReadonlyStatusRecord
} from './common';
import { MongoTeamEnterpriseAuth, MongoTeamEnterpriseAuthTask } from './schema';
import {
  buildLightTask,
  deriveExpiredTaskPatch,
  isPendingAmountTask,
  toTerminalTaskError
} from './status';
import { expireCurrentTaskIfNeeded } from './taskExpire';
import { hasEnterpriseAuthServiceConfig } from './transferClient';

/**
 * 构建只读的企业认证状态记录。
 *
 * 根据当前时间推导前端展示所需的认证状态，不执行任何数据库写操作
 * 真正的认证初始化、状态变更及过期落库逻辑由 start、verify、reset 等写入口负责
 *
 * @param auth - 可选的企业认证记录，若不存在则返回默认未认证状态
 * @returns 推导后的只读状态记录
 */
const buildReadonlyAuthStatusRecord = (
  auth: TeamEnterpriseAuthType | null | undefined,
  latestTask: EnterpriseAuthTaskType | null | undefined
): EnterpriseAuthReadonlyStatusRecord => {
  const usedTimes = latestTask?.usedTimes ?? 0;

  if (auth) {
    return {
      status: TeamEnterpriseAuthStatusEnum.verified,
      usedTimes,
      verifiedEnterpriseName: buildVerifiedEnterpriseName(auth)
    };
  }

  if (!latestTask) return getDefaultAuthStatusRecord();

  const baseStatus = pendingTaskStatuses.includes(latestTask.status as any)
    ? TeamEnterpriseAuthStatusEnum.verifying
    : TeamEnterpriseAuthStatusEnum.failed;

  const baseRecord: EnterpriseAuthReadonlyStatusRecord = {
    status: baseStatus,
    usedTimes,
    currentTask: pendingTaskStatuses.includes(latestTask.status as any) ? latestTask : undefined,
    lastErrorCode: latestTask.lastErrorCode,
    lastErrorMessage: latestTask.lastErrorMessage
  };

  const expiredPatch = deriveExpiredTaskPatch({
    task: latestTask,
    now: new Date(),
    serviceTimeoutMs: serviceEnv.ENTERPRISE_AUTH_SERVICE_TIMEOUT_MS
  });
  if (!expiredPatch) return baseRecord;

  return {
    ...baseRecord,
    status: expiredPatch.status,
    currentTask: {
      ...latestTask,
      status: expiredPatch.taskStatus,
      endedAt: expiredPatch.endedAt
    },
    lastErrorCode: expiredPatch.lastErrorCode,
    lastErrorMessage: expiredPatch.lastErrorMessage
  };
};

/**
 * 获取团队企业认证状态（只读）。
 * 若认证服务 URL 未配置则直接返回 disabled；否则查询当前认证记录并推导展示态，不触发写库。
 */
export const getEnterpriseAuthStatus = async ({
  teamId,
  canManage
}: {
  teamId: string;
  canManage: boolean;
}) => {
  if (!hasEnterpriseAuthServiceConfig()) {
    return { enabled: false };
  }

  const [auth, latestTask] = await Promise.all([
    MongoTeamEnterpriseAuth.findOne({ teamId }).lean(),
    MongoTeamEnterpriseAuthTask.findOne({ teamId }).lean()
  ]);
  const record = buildReadonlyAuthStatusRecord(auth, latestTask);

  return {
    enabled: true,
    status: record.status,
    usedTimes: record.usedTimes,
    canManage,
    verifiedEnterpriseName: record.verifiedEnterpriseName,
    currentTask: buildLightTask(record),
    lastErrorCode: record.lastErrorCode,
    lastErrorMessage: record.lastErrorMessage
  };
};

/**
 * 获取当前对公打款任务的敏感详情。
 * 仅在对公打款待确认阶段可调用，会先尝试过期超时任务；无有效任务时抛出 taskNotFound。
 */
export const getEnterpriseAuthCurrentTaskDetail = async (teamId: string) => {
  enabledGuard();

  const task =
    (await expireCurrentTaskIfNeeded(teamId)) ||
    (await MongoTeamEnterpriseAuthTask.findOne({ teamId }).lean());
  if (!task) throw new Error(EnterpriseAuthErrEnum.taskNotFound);

  const terminalError = toTerminalTaskError(task);
  if (terminalError) throw new Error(terminalError);

  if (!isPendingAmountTask(task) || !task.expireAt)
    throw new Error(EnterpriseAuthErrEnum.taskNotFound);

  return {
    taskId: task.taskId,
    status: task.status,
    enterpriseName: task.enterpriseName,
    unifiedCreditCode: task.unifiedCreditCode,
    legalPersonName: task.legalPersonName,
    bankName: task.bankName,
    bankAccount: task.bankAccount,
    contactName: task.contactName,
    contactTitle: task.contactTitle,
    contactPhone: task.contactPhone,
    demand: task.demand,
    amountErrorTimes: task.amountErrorTimes,
    expireAt: task.expireAt
  };
};
