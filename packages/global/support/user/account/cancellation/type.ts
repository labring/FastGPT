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

export const AccountCancellationSummarySchema = z.object({
  status: TeamAccountCancellationStatusSchema,
  scheduledCancelAt: z.union([z.date(), z.iso.datetime({ offset: true })]).optional()
});
export type AccountCancellationSummary = z.infer<typeof AccountCancellationSummarySchema>;

export const AccountCancellationAllowedMethodSchema = z.enum(accountCancellationAllowedMethods);
export type AccountCancellationAllowedMethod = z.infer<
  typeof AccountCancellationAllowedMethodSchema
>;

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
