export const accountCancellationWaitDays = 15;

export const AccountCancellationStatus = {
  pending: 'pending',
  finalizing: 'finalizing',
  completed: 'completed'
} as const;

export const accountCancellationActiveStatuses = [
  AccountCancellationStatus.pending,
  AccountCancellationStatus.finalizing
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

export const AccountCancellationReminder = {
  sevenDays: '7d',
  oneDay: '1d',
  today: 'today'
} as const;

export const AccountCancellationReminderBit = {
  sevenDays: 4,
  oneDay: 2,
  today: 1
} as const;

export const AccountCancellationUnavailableReason = {
  featureDisabled: 'feature_disabled',
  unsupportedTeamMode: 'unsupported_team_mode',
  rootAccount: 'root_account',
  accountForbidden: 'account_forbidden',
  emptyUsername: 'empty_username',
  verificationUnavailable: 'verification_unavailable',
  passwordVerificationNotAllowed: 'password_verification_not_allowed'
} as const;

export const accountCancellationStatusMap = {
  [AccountCancellationStatus.pending]: { label: 'Pending' },
  [AccountCancellationStatus.finalizing]: { label: 'Finalizing' },
  [AccountCancellationStatus.completed]: { label: 'Completed' }
};
