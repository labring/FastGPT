import { describe, expect, it } from 'vitest';
import { AccountCancellationReminder } from '@fastgpt/global/support/user/account/cancellation/constants';
import {
  deriveAccountCancellationSchedule,
  getAccountCancellationPendingDueCutoff,
  getAccountCancellationReminderAt,
  getAccountCancellationReminderRequestedAtWindow,
  isAccountCancellationAnonymizedUsername
} from '@fastgpt/global/support/user/account/cancellation/utils';

describe('deriveAccountCancellationSchedule', () => {
  it('derives a complete wait period and local-day reminders', () => {
    const requestedAt = new Date('2026-07-01T10:20:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt);

    expect(schedule.waitEndsAt.toISOString()).toBe('2026-07-16T10:20:00.000Z');
    expect(schedule.cleanupDate).toBe('2026-07-16');
    expect(schedule.sevenDayReminderAt.toISOString()).toBe('2026-07-09T02:00:00.000Z');
    expect(schedule.oneDayReminderAt.toISOString()).toBe('2026-07-15T02:00:00.000Z');
    expect(schedule.finalNoticeAt.toISOString()).toBe('2026-07-16T02:00:00.000Z');
    expect(schedule.scheduledCancelAt.toISOString()).toBe('2026-07-16T16:00:00.000Z');
  });

  it('defers finalization to the next UTC cron when the wait period ends after 16:00', () => {
    const requestedAt = new Date('2026-07-01T20:20:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt);

    expect(schedule.waitEndsAt.toISOString()).toBe('2026-07-16T20:20:00.000Z');
    expect(schedule.cleanupDate).toBe('2026-07-17');
    expect(schedule.finalNoticeAt.toISOString()).toBe('2026-07-17T02:00:00.000Z');
    expect(schedule.scheduledCancelAt.toISOString()).toBe('2026-07-17T16:00:00.000Z');
  });

  it('shares reminder calculation with the schedule helper', () => {
    const requestedAt = new Date('2026-07-01T00:00:00.000Z');
    const schedule = deriveAccountCancellationSchedule(requestedAt);
    expect(
      getAccountCancellationReminderAt({
        requestedAt,
        reminder: AccountCancellationReminder.today
      })
    ).toEqual(schedule.finalNoticeAt);
  });

  it('derives requestedAt query windows from UTC execution days', () => {
    const now = new Date('2026-07-09T02:00:00.000Z');

    expect(
      getAccountCancellationReminderRequestedAtWindow({
        now,
        reminder: AccountCancellationReminder.sevenDays
      })
    ).toEqual({
      start: new Date('2026-06-30T16:00:00.000Z'),
      end: new Date('2026-07-01T16:00:00.000Z')
    });
    expect(
      getAccountCancellationReminderRequestedAtWindow({
        now,
        reminder: AccountCancellationReminder.oneDay
      })
    ).toEqual({
      start: new Date('2026-06-24T16:00:00.000Z'),
      end: new Date('2026-06-25T16:00:00.000Z')
    });
    expect(
      getAccountCancellationReminderRequestedAtWindow({
        now,
        reminder: AccountCancellationReminder.today
      })
    ).toEqual({
      start: new Date('2026-06-23T16:00:00.000Z'),
      end: new Date('2026-06-24T16:00:00.000Z')
    });
  });

  it('derives the exclusive pending due cutoff from the UTC execution time', () => {
    expect(
      getAccountCancellationPendingDueCutoff({
        now: new Date('2026-07-16T16:00:00.000Z')
      })
    ).toEqual(new Date('2026-07-01T16:00:00.000Z'));
  });

  it('rejects invalid dates', () => {
    expect(() => deriveAccountCancellationSchedule(new Date('invalid'))).toThrow();
  });
});

describe('isAccountCancellationAnonymizedUsername', () => {
  it('matches the current username-random-delete format', () => {
    expect(isAccountCancellationAnonymizedUsername('user@example.com-a1B2c3D4-delete')).toBe(true);
  });

  it('keeps historical anonymized usernames recognizable', () => {
    expect(isAccountCancellationAnonymizedUsername('user@example.com-deleted')).toBe(true);
    expect(isAccountCancellationAnonymizedUsername(`deleted-${'a'.repeat(32)}`)).toBe(true);
  });

  it('does not treat ordinary delete-like usernames as anonymized', () => {
    expect(isAccountCancellationAnonymizedUsername('user-delete')).toBe(false);
    expect(isAccountCancellationAnonymizedUsername('user-12345678-delete')).toBe(false);
    expect(isAccountCancellationAnonymizedUsername('user-a1B2c3D4-delete-suffix')).toBe(false);
    expect(isAccountCancellationAnonymizedUsername(`deleted-${'g'.repeat(32)}`)).toBe(false);
  });
});
