import z from 'zod';

export const EnterpriseAuthMaxTimes = 3;
export const EnterpriseAuthTrialDays = 15;
export const EnterpriseAuthTaskExpireHours = 24;
export const EnterpriseAuthAmountMaxErrorTimes = 3;

export const TeamEnterpriseAuthStatusSchema = z.enum([
  'unverified',
  'verifying',
  'verified',
  'failed'
]);
export const TeamEnterpriseAuthStatusEnum = TeamEnterpriseAuthStatusSchema.enum;
export type TeamEnterpriseAuthStatusEnum = z.infer<typeof TeamEnterpriseAuthStatusSchema>;

export const TeamEnterpriseAuthTaskStatusSchema = z.enum([
  'starting',
  'info_failed',
  'pending_amount',
  'amount_failed',
  /**
   * 事务内临时态：仅用于金额验证成功后防止并发重复发放权益。
   * 不允许作为长期业务状态存在，也不参与 pending 任务恢复或统一社会信用代码锁。
   */
  'granting',
  'canceled',
  'expired',
  'failed',
  'verified',
  'service_failed'
]);
export const TeamEnterpriseAuthTaskStatusEnum = TeamEnterpriseAuthTaskStatusSchema.enum;
export type TeamEnterpriseAuthTaskStatusEnum = z.infer<typeof TeamEnterpriseAuthTaskStatusSchema>;

export const EnterpriseAuthPendingTaskStatuses = [
  TeamEnterpriseAuthTaskStatusEnum.starting,
  TeamEnterpriseAuthTaskStatusEnum.pending_amount,
  TeamEnterpriseAuthTaskStatusEnum.amount_failed
] as const;

export const EnterpriseAuthLockedTaskStatuses = [
  TeamEnterpriseAuthTaskStatusEnum.starting,
  TeamEnterpriseAuthTaskStatusEnum.pending_amount,
  TeamEnterpriseAuthTaskStatusEnum.amount_failed,
  TeamEnterpriseAuthTaskStatusEnum.verified
] as const;

const EnterpriseAuthErrValueSchema = z.enum([
  'enterpriseAuthDisabled',
  'enterpriseAuthServiceNotConfigured',
  'enterpriseAuthNoRemainingTimes',
  'enterpriseAuthAlreadyVerified',
  'enterpriseAuthEnterpriseOccupied',
  'enterpriseAuthTooFrequent',
  'enterpriseAuthServiceError',
  'enterpriseAuthServiceTimeout',
  'enterpriseAuthInfoFailed',
  'enterpriseAuthTaskNotFound',
  'enterpriseAuthTaskExpired',
  'enterpriseAuthAmountError',
  'enterpriseAuthAmountFailed',
  'enterpriseAuthProcessing'
]);
export const EnterpriseAuthErrEnum = {
  disabled: EnterpriseAuthErrValueSchema.enum.enterpriseAuthDisabled,
  serviceNotConfigured: EnterpriseAuthErrValueSchema.enum.enterpriseAuthServiceNotConfigured,
  noRemainingTimes: EnterpriseAuthErrValueSchema.enum.enterpriseAuthNoRemainingTimes,
  alreadyVerified: EnterpriseAuthErrValueSchema.enum.enterpriseAuthAlreadyVerified,
  enterpriseOccupied: EnterpriseAuthErrValueSchema.enum.enterpriseAuthEnterpriseOccupied,
  tooFrequent: EnterpriseAuthErrValueSchema.enum.enterpriseAuthTooFrequent,
  serviceError: EnterpriseAuthErrValueSchema.enum.enterpriseAuthServiceError,
  serviceTimeout: EnterpriseAuthErrValueSchema.enum.enterpriseAuthServiceTimeout,
  infoFailed: EnterpriseAuthErrValueSchema.enum.enterpriseAuthInfoFailed,
  taskNotFound: EnterpriseAuthErrValueSchema.enum.enterpriseAuthTaskNotFound,
  taskExpired: EnterpriseAuthErrValueSchema.enum.enterpriseAuthTaskExpired,
  amountError: EnterpriseAuthErrValueSchema.enum.enterpriseAuthAmountError,
  amountFailed: EnterpriseAuthErrValueSchema.enum.enterpriseAuthAmountFailed,
  processing: EnterpriseAuthErrValueSchema.enum.enterpriseAuthProcessing
} as const;
export const EnterpriseAuthErrSchema = z.enum(EnterpriseAuthErrEnum);
export type EnterpriseAuthErrEnum = z.infer<typeof EnterpriseAuthErrSchema>;
