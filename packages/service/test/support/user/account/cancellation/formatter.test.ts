import { describe, expect, it } from 'vitest';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import {
  formatTeamAccountCancellationSummary,
  maskAccount
} from '@fastgpt/service/support/user/account/cancellation/formatter';

describe('maskAccount', () => {
  it.each([
    ['customer@example.com', 'cu***@example.com'],
    ['13812345678', '138****5678'],
    ['abcd', 'a***'],
    ['abcde', 'ab***de'],
    ['', '']
  ])('masks %s without exposing the full account', (account, expected) => {
    expect(maskAccount(account)).toBe(expected);
  });
});

describe('formatTeamAccountCancellationSummary', () => {
  it('keeps pending status and exposes the derived scheduled cleanup time', () => {
    const summary = formatTeamAccountCancellationSummary({
      status: AccountCancellationStatus.pending,
      requestedAt: new Date('2026-07-01T10:20:00.000Z')
    });

    expect(summary).toEqual({
      status: AccountCancellationStatus.pending,
      scheduledCancelAt: new Date('2026-07-16T16:00:00.000Z')
    });
  });

  it('keeps finalizing status and hides the scheduled cleanup time', () => {
    const summary = formatTeamAccountCancellationSummary({
      status: AccountCancellationStatus.finalizing,
      requestedAt: new Date('2026-07-01T10:20:00.000Z')
    });

    expect(summary).toEqual({
      status: AccountCancellationStatus.finalizing
    });
  });
});
