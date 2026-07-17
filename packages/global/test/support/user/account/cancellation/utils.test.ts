import { describe, expect, it } from 'vitest';
import { AccountCancellationReminderEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import {
  deriveAccountCancellationSchedule,
  getAccountCancellationReminderAt,
  isAccountCancellationCancelable
} from '@fastgpt/global/support/user/account/cancellation/utils';

describe('deriveAccountCancellationSchedule', () => {
  it('derives a complete wait period and local-day reminders', () => {
    const requestedAt = new Date('2026-07-01T10:20:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt);

    expect(schedule.waitEndsAt.toISOString()).toBe('2026-07-16T10:20:00.000Z');
    expect(schedule.cleanupLocalDate).toBe('2026-07-16');
    expect(schedule.sevenDayReminderAt.toISOString()).toBe('2026-07-09T02:00:00.000Z');
    expect(schedule.oneDayReminderAt.toISOString()).toBe('2026-07-15T02:00:00.000Z');
    expect(schedule.finalNoticeAt.toISOString()).toBe('2026-07-16T02:00:00.000Z');
    expect(schedule.scheduledCancelAt.toISOString()).toBe('2026-07-16T16:00:00.000Z');
  });

  it('uses the configured timezone for a DST transition', () => {
    const requestedAt = new Date('2026-03-01T17:00:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt, 'America/New_York');

    expect(schedule.cleanupLocalDate).toBe('2026-03-16');
    expect(schedule.finalNoticeAt.toISOString()).toBe('2026-03-16T14:00:00.000Z');
    expect(schedule.scheduledCancelAt.toISOString()).toBe('2026-03-17T04:00:00.000Z');
  });

  it('shares reminder calculation with the schedule helper', () => {
    const requestedAt = new Date('2026-07-01T00:00:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt);
    expect(
      getAccountCancellationReminderAt({
        requestedAt,
        reminder: AccountCancellationReminderEnum.today
      })
    ).toEqual(schedule.finalNoticeAt);
  });

  it('allows cancellation only before the derived local midnight', () => {
    const requestedAt = new Date('2026-07-01T10:20:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt);
    expect(isAccountCancellationCancelable(requestedAt, new Date('2026-07-16T15:59:59.999Z'))).toBe(
      true
    );
    expect(isAccountCancellationCancelable(requestedAt, schedule.scheduledCancelAt)).toBe(false);
  });

  it('rejects invalid dates and timezones', () => {
    expect(() => deriveAccountCancellationSchedule(new Date('invalid'))).toThrow();
    expect(() => deriveAccountCancellationSchedule(new Date(), 'invalid/zone')).toThrow();
  });
});
