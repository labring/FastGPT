import { z } from 'zod';
import type {
  AccountVerificationCapabilities,
  AccountVerificationMethod
} from '../verification/type';
import {
  AccountCancellationStatusEnum,
  AccountCancellationUnavailableReasonEnum,
  accountCancellationActiveStatuses,
  accountCancellationAllowedMethods,
  accountCancellationTimezone
} from './constants';

export const AccountCancellationStatusSchema = z.enum([
  AccountCancellationStatusEnum.pending,
  AccountCancellationStatusEnum.finalizing,
  AccountCancellationStatusEnum.completed
]);
export type AccountCancellationStatus = z.infer<typeof AccountCancellationStatusSchema>;

export const AccountCancellationPublicStatusSchema = z.enum(['none', 'pending']);
export type AccountCancellationPublicStatus = z.infer<typeof AccountCancellationPublicStatusSchema>;

export const TeamAccountCancellationStatusSchema = AccountCancellationStatusSchema.exclude([
  AccountCancellationStatusEnum.completed
]);
export type TeamAccountCancellationStatus = z.infer<typeof TeamAccountCancellationStatusSchema>;

export const AccountCancellationAllowedMethodSchema = z.enum(accountCancellationAllowedMethods);
export type AccountCancellationAllowedMethod = z.infer<
  typeof AccountCancellationAllowedMethodSchema
>;

export const AccountCancellationUnavailableReasonSchema = z.enum([
  AccountCancellationUnavailableReasonEnum.featureDisabled,
  AccountCancellationUnavailableReasonEnum.unsupportedTeamMode,
  AccountCancellationUnavailableReasonEnum.rootAccount,
  AccountCancellationUnavailableReasonEnum.accountForbidden,
  AccountCancellationUnavailableReasonEnum.emptyUsername,
  AccountCancellationUnavailableReasonEnum.verificationUnavailable,
  AccountCancellationUnavailableReasonEnum.passwordVerificationNotAllowed
]);
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

export type AccountCancellationResolverInput = {
  username?: string | null;
  capabilities: AccountVerificationCapabilities;
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

export type AccountCancellationVerificationMethod = Exclude<
  AccountVerificationMethod,
  'oldPassword'
>;

export const accountCancellationDefaultTimezone = accountCancellationTimezone;
export const accountCancellationActiveStatusValues = accountCancellationActiveStatuses;
