export const accountCancellationWaitDays = 15;
export const accountCancellationTimezone = 'Asia/Shanghai';

export enum AccountCancellationStatusEnum {
  pending = 'pending',
  finalizing = 'finalizing',
  completed = 'completed'
}

export const accountCancellationActiveStatuses = [
  AccountCancellationStatusEnum.pending,
  AccountCancellationStatusEnum.finalizing
] as const;

export const accountCancellationAllowedMethods = [
  'code',
  'wechat',
  'oauth/github',
  'oauth/google',
  'oauth/microsoft',
  'oauth/wecom',
  'oauth/sso'
] as const;

export enum AccountCancellationReminderEnum {
  sevenDays = '7d',
  oneDay = '1d',
  today = 'today'
}

export enum AccountCancellationUnavailableReasonEnum {
  featureDisabled = 'feature_disabled',
  unsupportedTeamMode = 'unsupported_team_mode',
  rootAccount = 'root_account',
  accountForbidden = 'account_forbidden',
  emptyUsername = 'empty_username',
  verificationUnavailable = 'verification_unavailable',
  passwordVerificationNotAllowed = 'password_verification_not_allowed'
}

export const accountCancellationStatusMap = {
  [AccountCancellationStatusEnum.pending]: { label: 'Pending' },
  [AccountCancellationStatusEnum.finalizing]: { label: 'Finalizing' },
  [AccountCancellationStatusEnum.completed]: { label: 'Completed' }
};
