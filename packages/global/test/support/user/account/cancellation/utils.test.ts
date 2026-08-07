import { describe, expect, it } from 'vitest';
import { AccountCancellationReminderEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import {
  deriveAccountCancellationSchedule,
  getAccountCancellationPendingDueCutoff,
  getAccountCancellationReminderAt,
  getAccountCancellationReminderRequestedAtWindow,
  isAccountCancellationAnonymizedUsername,
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

  it('derives requestedAt query windows for reminders from the configured local day', () => {
    const now = new Date('2026-07-09T02:00:00.000Z');

    expect(
      getAccountCancellationReminderRequestedAtWindow({
        now,
        reminder: AccountCancellationReminderEnum.sevenDays
      })
    ).toEqual({
      start: new Date('2026-06-30T16:00:00.000Z'),
      end: new Date('2026-07-01T16:00:00.000Z')
    });
    expect(
      getAccountCancellationReminderRequestedAtWindow({
        now,
        reminder: AccountCancellationReminderEnum.oneDay
      })
    ).toEqual({
      start: new Date('2026-06-24T16:00:00.000Z'),
      end: new Date('2026-06-25T16:00:00.000Z')
    });
    expect(
      getAccountCancellationReminderRequestedAtWindow({
        now,
        reminder: AccountCancellationReminderEnum.today
      })
    ).toEqual({
      start: new Date('2026-06-23T16:00:00.000Z'),
      end: new Date('2026-06-24T16:00:00.000Z')
    });
  });

  it('derives the exclusive pending due cutoff from the configured local day', () => {
    expect(
      getAccountCancellationPendingDueCutoff({
        now: new Date('2026-07-16T16:00:00.000Z')
      })
    ).toEqual(new Date('2026-07-01T16:00:00.000Z'));
  });

  it('keeps requestedAt query windows aligned with the fixed wait period across DST', () => {
    const window = getAccountCancellationReminderRequestedAtWindow({
      now: new Date('2026-03-09T14:00:00.000Z'),
      reminder: AccountCancellationReminderEnum.today,
      timeZone: 'America/New_York'
    });

    expect(window).toEqual({
      start: new Date('2026-02-22T04:00:00.000Z'),
      end: new Date('2026-02-23T04:00:00.000Z')
    });
    expect(
      deriveAccountCancellationSchedule(window.start, 'America/New_York').finalNoticeAt
    ).toEqual(new Date('2026-03-09T14:00:00.000Z'));
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
