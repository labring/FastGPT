import { z } from 'zod';
import {
  AccountCancellationStatus as AccountCancellationStatusValues,
  AccountCancellationReminder as AccountCancellationReminderValues,
  AccountCancellationUnavailableReason as AccountCancellationUnavailableReasonValues,
  accountCancellationAllowedMethods
} from './constants';

export const AccountCancellationStatusSchema = z.enum(AccountCancellationStatusValues);
export type AccountCancellationStatus = z.infer<typeof AccountCancellationStatusSchema>;

export const TeamAccountCancellationStatusSchema = AccountCancellationStatusSchema.exclude([
  AccountCancellationStatusValues.completed
]);
export type TeamAccountCancellationStatus = z.infer<typeof TeamAccountCancellationStatusSchema>;

export const AccountCancellationAllowedMethodSchema = z.enum(accountCancellationAllowedMethods);
export type AccountCancellationAllowedMethod = z.infer<
  typeof AccountCancellationAllowedMethodSchema
>;

export const AccountCancellationReminderSchema = z.enum(AccountCancellationReminderValues);
export type AccountCancellationReminder = z.infer<typeof AccountCancellationReminderSchema>;

export const AccountCancellationUnavailableReasonSchema = z.enum(
  AccountCancellationUnavailableReasonValues
);
export type AccountCancellationUnavailableReason = z.infer<
  typeof AccountCancellationUnavailableReasonSchema
>;

export type AccountCancellationRecordType = {
  _id: string;
  userId: string;
  status: AccountCancellationStatus;
  requestedAt: Date;
};

export type AccountCancellationSchedule = {
  requestedAt: Date;
  waitEndsAt: Date;
  cleanupLocalDate: string;
  sevenDayReminderAt: Date;
  oneDayReminderAt: Date;
  finalNoticeAt: Date;
  scheduledCancelAt: Date;
  timezone: string;
};

export type AccountCancellationUserState = {
  status: 'pending';
  requestedAt: Date;
  scheduledCancelAt?: Date;
  canCancelCancellation: boolean;
};

export type TeamAccountCancellationSummary = {
  status: TeamAccountCancellationStatus;
  scheduledCancelAt?: Date | string;
};

export type AccountCancellationOAuthProvider = 'github' | 'google' | 'microsoft' | 'wecom' | 'sso';

export type AccountCancellationVerificationCapabilities = {
  emailCode: boolean;
  phoneCode: boolean;
  accountCancellation?: boolean;
  wechat: boolean;
  oauth: Record<AccountCancellationOAuthProvider, boolean>;
};

export type AccountCancellationResolverInput = {
  username?: string | null;
  capabilities: AccountCancellationVerificationCapabilities;
};

export type AccountCancellationResolveResult =
  | {
      status: 'supported';
      method: AccountCancellationAllowedMethod;
      accountKind: string;
      unsupportedReason?: undefined;
    }
  | {
      status: 'unsupported';
      method?: undefined;
      accountKind: 'invalid' | string;
      unsupportedReason:
        | 'empty_username'
        | 'password_verification_not_allowed'
        | 'verification_unavailable';
    };

export type AccountCancellationAccessPreset =
  | 'normal'
  | 'selfCancellation'
  | 'teamEscape'
  | 'tokenLogin';

export type AccountCancellationVerificationMethod = AccountCancellationAllowedMethod;
