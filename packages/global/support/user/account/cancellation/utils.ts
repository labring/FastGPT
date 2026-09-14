import {
  accountCancellationWaitDays,
  AccountCancellationReminder as AccountCancellationReminderValues
} from './constants';
import { accountExternalVerificationMethods } from '../verification/constants';
import type { AccountCancellationReminder, AccountCancellationSchedule } from './type';

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const reminderUtcHour = 2;
const finalizeUtcHour = 16;
const accountCancellationAnonymizedUsernameReg = /-[a-z][a-zA-Z0-9]{7}-delete$/;
const legacyAccountCancellationUsernameRegs = [/-deleted$/, /^deleted-[a-f0-9]{32}$/];

type UtcDateParts = {
  year: number;
  month: number;
  day: number;
};

const getUtcDateParts = (date: Date): UtcDateParts => {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};

const addUtcDays = ({ year, month, day }: UtcDateParts, days: number): UtcDateParts => {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};

const formatUtcDate = ({ year, month, day }: UtcDateParts) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const atUtcHour = ({ year, month, day }: UtcDateParts, hour: number) =>
  new Date(Date.UTC(year, month - 1, day, hour));

/** 返回目标注销执行日对应的 requestedAt UTC 半开区间。 */
const getFinalizeWindow = ({ now, daysFromToday }: { now: Date; daysFromToday: number }) => {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('Invalid account cancellation current time');
  }

  const targetDate = addUtcDays(getUtcDateParts(now), daysFromToday);
  return {
    start: atUtcHour(addUtcDays(targetDate, -1), finalizeUtcHour),
    end: atUtcHour(targetDate, finalizeUtcHour)
  };
};

/**
 * 从唯一持久化时间推导注销等待期的全部时间点。
 * 等待期使用完整的 UTC 24 小时周期，提醒和最终清理由固定 UTC Cron 时间驱动。
 */
export const deriveAccountCancellationSchedule = (
  requestedAt: Date
): AccountCancellationSchedule => {
  if (!(requestedAt instanceof Date) || Number.isNaN(requestedAt.getTime())) {
    throw new Error('Invalid account cancellation requestedAt');
  }

  const normalizedRequestedAt = new Date(requestedAt.getTime());
  const waitEndsAt = new Date(
    normalizedRequestedAt.getTime() + accountCancellationWaitDays * dayInMilliseconds
  );
  const waitEndsDate = getUtcDateParts(waitEndsAt);
  const sameDayFinalizeAt = atUtcHour(waitEndsDate, finalizeUtcHour);
  // 等待期结束时间命中或超过当天执行点时，顺延到下一次 Cron。
  const cleanupDate =
    waitEndsAt.getTime() < sameDayFinalizeAt.getTime() ? waitEndsDate : addUtcDays(waitEndsDate, 1);

  return {
    requestedAt: normalizedRequestedAt,
    waitEndsAt,
    cleanupDate: formatUtcDate(cleanupDate),
    sevenDayReminderAt: atUtcHour(addUtcDays(cleanupDate, -7), reminderUtcHour),
    oneDayReminderAt: atUtcHour(addUtcDays(cleanupDate, -1), reminderUtcHour),
    finalNoticeAt: atUtcHour(cleanupDate, reminderUtcHour),
    scheduledCancelAt: atUtcHour(cleanupDate, finalizeUtcHour)
  };
};

export const getAccountCancellationReminderAt = ({
  requestedAt,
  reminder
}: {
  requestedAt: Date;
  reminder: AccountCancellationReminder;
}) => {
  const schedule = deriveAccountCancellationSchedule(requestedAt);
  if (reminder === AccountCancellationReminderValues.sevenDays) return schedule.sevenDayReminderAt;
  if (reminder === AccountCancellationReminderValues.oneDay) return schedule.oneDayReminderAt;
  return schedule.finalNoticeAt;
};

/**
 * 反推出指定自然日应发送某类提醒的 requestedAt 半开区间，供数据库范围查询使用。
 * 区间与每日 16:00 UTC 的最终注销执行点保持一致。
 */
export const getAccountCancellationReminderRequestedAtWindow = ({
  now,
  reminder
}: {
  now: Date;
  reminder: AccountCancellationReminder;
}) => {
  const reminderDaysBeforeCleanup = (() => {
    if (reminder === AccountCancellationReminderValues.sevenDays) return 7;
    if (reminder === AccountCancellationReminderValues.oneDay) return 1;
    return 0;
  })();
  const cleanupDayWindow = getFinalizeWindow({
    now,
    daysFromToday: reminderDaysBeforeCleanup
  });
  const waitPeriodMs = accountCancellationWaitDays * dayInMilliseconds;

  return {
    start: new Date(cleanupDayWindow.start.getTime() - waitPeriodMs),
    end: new Date(cleanupDayWindow.end.getTime() - waitPeriodMs)
  };
};

/**
 * 返回到期 pending 的 requestedAt 排他上界。
 * 当前自然日开始前已进入计划清理时间的记录满足 requestedAt < cutoff。
 */
export const getAccountCancellationPendingDueCutoff = ({ now }: { now: Date }) => {
  const finalizeWindowEnd = getFinalizeWindow({
    now,
    daysFromToday: 0
  }).end;

  return new Date(finalizeWindowEnd.getTime() - accountCancellationWaitDays * dayInMilliseconds);
};

export const isAccountCancellationMethod = (method: string) =>
  (accountExternalVerificationMethods as readonly string[]).includes(method);

/**
 * 判断用户名是否由账号注销流程生成，同时兼容已落库的历史匿名用户名格式。
 */
export const isAccountCancellationAnonymizedUsername = (username: string) =>
  accountCancellationAnonymizedUsernameReg.test(username) ||
  legacyAccountCancellationUsernameRegs.some((reg) => reg.test(username));
