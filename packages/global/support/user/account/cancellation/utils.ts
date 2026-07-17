import {
  accountCancellationTimezone,
  accountCancellationWaitDays,
  AccountCancellationReminderEnum
} from './constants';
import type { AccountCancellationSchedule } from './type';

const dayInMilliseconds = 24 * 60 * 60 * 1000;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const getFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

const parseDateParts = (date: Date, timeZone: string): LocalDateParts => {
  const values = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)])
  ) as Record<string, number>;

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second
  };
};

const assertValidTimeZone = (timeZone: string) => {
  try {
    getFormatter(timeZone).format();
  } catch {
    throw new Error(`Invalid account cancellation timezone: ${timeZone}`);
  }
};

const getTimeZoneOffset = (date: Date, timeZone: string) => {
  const parts = parseDateParts(date, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return localAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/** 将指定时区的墙上时间转换为 UTC，避免依赖进程机器时区。 */
const localDateTimeToUtc = (
  parts: Omit<LocalDateParts, 'second'> & { second?: number },
  timeZone: string
) => {
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0
  );
  let candidate = localAsUtc;

  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = getTimeZoneOffset(new Date(candidate), timeZone);
    const next = localAsUtc - offset;
    if (next === candidate) break;
    candidate = next;
  }

  return new Date(candidate);
};

const addLocalDays = ({ year, month, day }: LocalDateParts, days: number) => {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
};

const formatLocalDate = ({ year, month, day }: LocalDateParts) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const atLocalTime = (date: ReturnType<typeof addLocalDays>, hour: number, timeZone: string) =>
  localDateTimeToUtc({ ...date, hour, minute: 0, second: 0 }, timeZone);

/**
 * 从唯一持久化时间推导注销等待期的全部时间点。
 * waitEndsAt 使用完整的 UTC 24 小时周期，提醒和最终清理则使用显式配置时区的自然日。
 */
export const deriveAccountCancellationSchedule = (
  requestedAt: Date,
  timeZone = accountCancellationTimezone
): AccountCancellationSchedule => {
  if (!(requestedAt instanceof Date) || Number.isNaN(requestedAt.getTime())) {
    throw new Error('Invalid account cancellation requestedAt');
  }
  assertValidTimeZone(timeZone);

  const normalizedRequestedAt = new Date(requestedAt.getTime());
  const waitEndsAt = new Date(
    normalizedRequestedAt.getTime() + accountCancellationWaitDays * dayInMilliseconds
  );
  const waitEndsLocal = parseDateParts(waitEndsAt, timeZone);
  const cleanupDate = {
    year: waitEndsLocal.year,
    month: waitEndsLocal.month,
    day: waitEndsLocal.day
  };
  const cleanupLocalDate = formatLocalDate(waitEndsLocal);

  return {
    requestedAt: normalizedRequestedAt,
    waitEndsAt,
    cleanupLocalDate,
    sevenDayReminderAt: atLocalTime(addLocalDays(waitEndsLocal, -7), 10, timeZone),
    oneDayReminderAt: atLocalTime(addLocalDays(waitEndsLocal, -1), 10, timeZone),
    finalNoticeAt: atLocalTime(cleanupDate, 10, timeZone),
    scheduledCancelAt: atLocalTime(addLocalDays(waitEndsLocal, 1), 0, timeZone),
    timezone: timeZone
  };
};

export const getAccountCancellationReminderAt = ({
  requestedAt,
  reminder,
  timeZone = accountCancellationTimezone
}: {
  requestedAt: Date;
  reminder: AccountCancellationReminderEnum;
  timeZone?: string;
}) => {
  const schedule = deriveAccountCancellationSchedule(requestedAt, timeZone);
  if (reminder === AccountCancellationReminderEnum.sevenDays) return schedule.sevenDayReminderAt;
  if (reminder === AccountCancellationReminderEnum.oneDay) return schedule.oneDayReminderAt;
  return schedule.finalNoticeAt;
};

export const isAccountCancellationCancelable = (requestedAt: Date, now = new Date()) =>
  now.getTime() < deriveAccountCancellationSchedule(requestedAt).scheduledCancelAt.getTime();

export const isAccountCancellationMethod = (method: string) =>
  method === 'code' || method === 'wechat' || method.startsWith('oauth/');
