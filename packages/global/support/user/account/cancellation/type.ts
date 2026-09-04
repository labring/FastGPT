import { z } from 'zod';
import {
  AccountCancellationStatus as AccountCancellationStatusValues,
  AccountCancellationReminder as AccountCancellationReminderValues,
  AccountCancellationUnavailableReason as AccountCancellationUnavailableReasonValues
} from './constants';
import type {
  AccountExternalVerificationMethod,
  OAuthAccountVerificationProvider
} from '../verification/type';

export const AccountCancellationStatusSchema = z.enum(AccountCancellationStatusValues);
export type AccountCancellationStatus = z.infer<typeof AccountCancellationStatusSchema>;

export const TeamAccountCancellationStatusSchema = AccountCancellationStatusSchema.exclude([
  AccountCancellationStatusValues.completed
]);
export type TeamAccountCancellationStatus = z.infer<typeof TeamAccountCancellationStatusSchema>;

export const AccountCancellationReminderSchema = z.enum(AccountCancellationReminderValues);
export type AccountCancellationReminder = z.infer<typeof AccountCancellationReminderSchema>;

export const AccountCancellationUnavailableReasonSchema = z.enum(
  AccountCancellationUnavailableReasonValues
);

export type AccountCancellationSchedule = {
  requestedAt: Date;
  waitEndsAt: Date;
  cleanupDate: string;
  sevenDayReminderAt: Date;
  oneDayReminderAt: Date;
  finalNoticeAt: Date;
  scheduledCancelAt: Date;
};
export type TeamAccountCancellationSummary = {
  status: TeamAccountCancellationStatus;
  scheduledCancelAt?: Date | string;
};

export type AccountCancellationVerificationCapabilities = {
  emailCode: boolean;
  phoneCode: boolean;
  accountCancellation?: boolean;
  wechat: boolean;
  oauth: Record<OAuthAccountVerificationProvider, boolean>;
};

export type AccountCancellationResolverInput = {
  username?: string | null;
  capabilities: AccountCancellationVerificationCapabilities;
};

export type AccountCancellationResolveResult =
  | {
      status: 'supported';
      method: AccountExternalVerificationMethod;
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
