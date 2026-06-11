export const EnterpriseAuthMaxTimes = 3;
export const EnterpriseAuthTrialDays = 15;
export const EnterpriseAuthGrantPoints = 25000;
export const EnterpriseAuthAmountMaxErrorTimes = 3;

export enum TeamEnterpriseAuthStatusEnum {
  unverified = 'unverified',
  verifying = 'verifying',
  verified = 'verified',
  failed = 'failed'
}

export enum TeamEnterpriseAuthTaskStatusEnum {
  starting = 'starting',
  info_failed = 'info_failed',
  pending_amount = 'pending_amount',
  amount_failed = 'amount_failed',
  /**
   * 事务内临时态：仅用于金额验证成功后防止并发重复发放权益。
   * 不允许作为长期业务状态存在，也不参与 pending 任务恢复或统一社会信用代码锁。
   */
  granting = 'granting',
  canceled = 'canceled',
  expired = 'expired',
  failed = 'failed',
  verified = 'verified',
  service_failed = 'service_failed'
}

export const EnterpriseAuthPendingTaskStatuses = [
  TeamEnterpriseAuthTaskStatusEnum.starting,
  TeamEnterpriseAuthTaskStatusEnum.pending_amount,
  TeamEnterpriseAuthTaskStatusEnum.amount_failed
] as const;

export enum EnterpriseAuthErrEnum {
  disabled = 'enterpriseAuthDisabled',
  serviceNotConfigured = 'enterpriseAuthServiceNotConfigured',
  noRemainingTimes = 'enterpriseAuthNoRemainingTimes',
  alreadyVerified = 'enterpriseAuthAlreadyVerified',
  enterpriseOccupied = 'enterpriseAuthEnterpriseOccupied',
  tooFrequent = 'enterpriseAuthTooFrequent',
  serviceError = 'enterpriseAuthServiceError',
  serviceTimeout = 'enterpriseAuthServiceTimeout',
  infoFailed = 'enterpriseAuthInfoFailed',
  taskNotFound = 'enterpriseAuthTaskNotFound',
  taskExpired = 'enterpriseAuthTaskExpired',
  amountError = 'enterpriseAuthAmountError',
  amountFailed = 'enterpriseAuthAmountFailed',
  processing = 'enterpriseAuthProcessing'
}
