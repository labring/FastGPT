import dayjs from 'dayjs';
import cronParser from 'cron-parser';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { i18nT } from '../i18n/utils';

dayjs.extend(utc);
dayjs.extend(timezone);

export const formatTime2YMDHMW = (time?: Date | number) =>
  dayjs(time).format('YYYY-MM-DD HH:mm:ss dddd');
export const formatTime2YMDHMS = (time?: Date | number) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '';
export const formatTime2YMDHM = (time?: Date | number) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '';
export const formatTime2YMDHMUtc = (time?: Date | number) =>
  time ? dayjs.utc(time).format('YYYY-MM-DD HH:mm') : '';

/**
 * UTC 毫秒时间戳 → Date 对象（UTC 字段值填入本地字段）
 * 用于 DateTimePicker：使其以 UTC 时间显示，而非本地时间
 */
export const utcTsToDisplayDate = (ts: number): Date => {
  const d = new Date(ts);
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    0,
    0
  );
};

/**
 * DateTimePicker 返回的 Date（本地字段实际表示 UTC 值）→ UTC 毫秒时间戳
 */
export const displayDateToUtcTs = (date: Date): number =>
  Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0
  );

/**
 * datetime-local 字符串（如 "2024-01-15T10:30"）→ UTC 毫秒时间戳
 * 将字符串中的时间字段直接作为 UTC 值处理
 */
export const datetimeLocalToUtcTs = (str: string): number => {
  const [datePart, timePart = '00:00'] = str.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min] = timePart.split(':').map(Number);
  return Date.UTC(y, m - 1, d, h, min);
};

/**
 * UTC 毫秒时间戳 → datetime-local 字符串（如 "2024-01-15T10:30"），以 UTC 时间表示
 */
export const utcTsToDatetimeLocal = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const formatTime2YMD = (time?: Date | number) =>
  time ? dayjs(time).format('YYYY-MM-DD') : '';
export const formatTime2HM = (time: Date = new Date()) => dayjs(time).format('HH:mm');

/**
 * 格式化为带时区偏移的 ISO-8601 字符串
 */
export const formatToISOWithTimezone = (time?: Date | number) =>
  time ? dayjs(time).format('YYYY-MM-DDTHH:mm:ss.SSSZ') : '';

/**
 * 格式化时间成聊天格式
 */
export const formatTimeToChatTime = (time: Date) => {
  const now = dayjs();
  const target = dayjs(time);

  // 如果传入时间小于60秒，返回刚刚
  if (now.diff(target, 'second') < 60) {
    return i18nT('common:just_now');
  }

  // 如果时间是今天，展示几时:几分
  //用#占位，i18n生效后replace成:
  if (now.isSame(target, 'day')) {
    return target.format('HH#mm');
  }

  // 如果是昨天，展示昨天
  if (now.subtract(1, 'day').isSame(target, 'day')) {
    return i18nT('common:yesterday');
  }

  // 如果是今年，展示某月某日
  if (now.isSame(target, 'year')) {
    return target.format('MM-DD');
  }

  // 如果是更久之前，展示某年某月某日
  return target.format('YYYY-M-D');
};

export const formatTimeToChatItemTime = (time: Date) => {
  const now = dayjs();
  const target = dayjs(time);
  const detailTime = target.format('HH#mm');

  // 如果时间是今天，展示几时:几分
  if (now.isSame(target, 'day')) {
    return detailTime;
  }

  // 如果是昨天，展示昨天+几时:几分
  if (now.subtract(1, 'day').isSame(target, 'day')) {
    return i18nT('common:yesterday_detail_time');
  }

  // 如果是今年，展示某月某日+几时:几分
  if (now.isSame(target, 'year')) {
    return target.format('MM-DD') + ' ' + detailTime;
  }

  // 如果是更久之前，展示某年某月某日+几时:几分
  return target.format('YYYY-M-D') + ' ' + detailTime;
};

/* cron time parse */
export const cronParser2Fields = (cronString: string) => {
  try {
    const cronField = cronParser.parseExpression(cronString).fields;
    return cronField;
  } catch (error) {
    return null;
  }
};
// 根据cron表达式和时区获取下一个时间
export const getNextTimeByCronStringAndTimezone = ({
  cronString,
  timezone
}: {
  cronString: string;
  timezone: string;
}) => {
  try {
    const options = {
      currentDate: dayjs().tz(timezone).format(),
      tz: timezone
    };
    const interval = cronParser.parseExpression(cronString, options);
    const date = String(interval.next());

    return new Date(date);
  } catch (error) {
    console.log(`getNextTimeByCronStringAndTimezone error: ${cronString}`, error);
    return new Date();
  }
};
