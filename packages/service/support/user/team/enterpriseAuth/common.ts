import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  EnterpriseAuthErrEnum,
  EnterpriseAuthMaxTimes,
  EnterpriseAuthPendingTaskStatuses,
  TeamEnterpriseAuthStatusEnum
} from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import type {
  EnterpriseAuthTaskType,
  TeamEnterpriseAuthType
} from '@fastgpt/global/support/user/team/enterpriseAuth/type';
import { Types } from '../../../../common/mongo';
import { hasEnterpriseAuthServiceConfig } from './transferClient';

export type AuthOperator = {
  teamId: string;
  userId: string;
  tmbId: string;
};

export type EnterpriseAuthTaskOwner = {
  currentTask?: EnterpriseAuthTaskType;
};

export type EnterpriseAuthReadonlyStatusRecord = {
  status: TeamEnterpriseAuthStatusEnum;
  usedTimes: number;
  verifiedEnterpriseName?: string;
  currentTask?: EnterpriseAuthTaskType;
  lastErrorCode?: string;
  lastErrorMessage?: string;
};

export const pendingTaskStatuses = [...EnterpriseAuthPendingTaskStatuses];

export const enabledGuard = () => {
  if (!hasEnterpriseAuthServiceConfig()) {
    throw new Error(EnterpriseAuthErrEnum.disabled);
  }
};

export const serviceConfigGuard = () => {
  if (!hasEnterpriseAuthServiceConfig()) {
    throw new Error(EnterpriseAuthErrEnum.serviceNotConfigured);
  }
};

export const toObjectId = (id: string) => new Types.ObjectId(String(id));

export const normalizeUnifiedCreditCode = (code: string) => code.trim().toUpperCase();

export const normalizeBankAccount = (account: string) => account.replace(/\s+/g, '');

export const maskBankAccount = (account: string) => {
  const normalized = normalizeBankAccount(account);
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(normalized.length - 4, 4))}${normalized.slice(-4)}`;
};

export const isMongoDuplicateKeyError = (error: any) => error?.code === 11000;

export const getDefaultAuthStatusRecord = (): EnterpriseAuthReadonlyStatusRecord => ({
  status: TeamEnterpriseAuthStatusEnum.unverified,
  usedTimes: 0
});

export const createEnterpriseAuthTaskId = () => getNanoid(24);

export const getRemainingAuthTimes = (usedTimes?: number) =>
  Math.max(EnterpriseAuthMaxTimes - (usedTimes ?? 0), 0);

export const isEnterpriseAuthTimesExhausted = (usedTimes?: number) =>
  getRemainingAuthTimes(usedTimes) <= 0;

export const buildVerifiedEnterpriseName = (auth?: TeamEnterpriseAuthType | null) =>
  auth?.enterpriseName;

/**
 * 判断当前操作者是否为企业认证任务发起人。
 *
 * 历史任务可能没有操作者字段，为避免已在流程中的团队被升级阻断，缺失 tmbId 时保留旧任务可继续处理。
 * 新任务都会写入 tmbId，其他团队成员访问时会被拦截为 processing。
 */
export const isEnterpriseAuthTaskOperator = ({
  task,
  operator
}: {
  task?: EnterpriseAuthTaskType | null;
  operator: AuthOperator;
}) => !task?.tmbId || task.tmbId.toString() === operator.tmbId;

export const assertEnterpriseAuthTaskOperator = ({
  task,
  operator
}: {
  task?: EnterpriseAuthTaskType | null;
  operator: AuthOperator;
}) => {
  if (!isEnterpriseAuthTaskOperator({ task, operator })) {
    throw new Error(EnterpriseAuthErrEnum.processing);
  }
};
