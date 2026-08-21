import { describe, expect, it } from 'vitest';
import {
  AccountCancellationAllowedMethodSchema,
  AccountCancellationReminderSchema,
  AccountCancellationStatusSchema,
  AccountCancellationUnavailableReasonSchema,
  TeamAccountCancellationStatusSchema
} from '@fastgpt/global/support/user/account/cancellation/type';
import {
  AccountCancellationReminder,
  AccountCancellationStatus,
  AccountCancellationUnavailableReason,
  accountCancellationAllowedMethods
} from '@fastgpt/global/support/user/account/cancellation/constants';

describe('account cancellation schemas', () => {
  it('accepts and rejects cancellation statuses', () => {
    expect(
      AccountCancellationStatusSchema.safeParse(AccountCancellationStatus.pending).success
    ).toBe(true);
    expect(
      AccountCancellationStatusSchema.safeParse(AccountCancellationStatus.finalizing).success
    ).toBe(true);
    expect(
      AccountCancellationStatusSchema.safeParse(AccountCancellationStatus.completed).success
    ).toBe(true);
    expect(AccountCancellationStatusSchema.safeParse('unknown').success).toBe(false);
    expect(
      TeamAccountCancellationStatusSchema.safeParse(AccountCancellationStatus.completed).success
    ).toBe(false);
  });

  it('covers reminders, unavailable reasons, and allowed methods', () => {
    expect(
      Object.values(AccountCancellationReminder).every(
        (value) => AccountCancellationReminderSchema.safeParse(value).success
      )
    ).toBe(true);
    expect(
      Object.values(AccountCancellationUnavailableReason).every(
        (value) => AccountCancellationUnavailableReasonSchema.safeParse(value).success
      )
    ).toBe(true);
    expect(
      accountCancellationAllowedMethods.every(
        (value) => AccountCancellationAllowedMethodSchema.safeParse(value).success
      )
    ).toBe(true);
    expect(AccountCancellationAllowedMethodSchema.safeParse('oauth/unknown').success).toBe(false);
  });
});
