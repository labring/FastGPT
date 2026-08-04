import { describe, expect, it } from 'vitest';
import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { formatTeamAccountCancellationSummary } from '@fastgpt/service/support/user/account/cancellation/formatter';

describe('formatTeamAccountCancellationSummary', () => {
  it('keeps pending status and exposes the derived scheduled cleanup time', () => {
    const summary = formatTeamAccountCancellationSummary({
      status: AccountCancellationStatusEnum.pending,
      requestedAt: new Date('2026-07-01T10:20:00.000Z')
    });

    expect(summary).toEqual({
      status: AccountCancellationStatusEnum.pending,
      scheduledCancelAt: new Date('2026-07-16T16:00:00.000Z')
    });
  });

  it('keeps finalizing status and hides the scheduled cleanup time', () => {
    const summary = formatTeamAccountCancellationSummary({
      status: AccountCancellationStatusEnum.finalizing,
      requestedAt: new Date('2026-07-01T10:20:00.000Z')
    });

    expect(summary).toEqual({
      status: AccountCancellationStatusEnum.finalizing
    });
  });
});
