import dayjs from 'dayjs';
import cronParser from 'cron-parser';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { i18nT } from '../../../web/i18n/utils';

dayjs.extend(utc);
dayjs.extend(timezone);

export const formatTime2YMDHMW = (time?: Date) => dayjs(time).format('YYYY-MM-DD HH:mm:ss dddd');
export const formatTime2YMDHMS = (time?: Date) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '';
export const formatTime2YMDHM = (time?: Date) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '';
export const formatTime2YMD = (time?: Date) => (time ? dayjs(time).format('YYYY-MM-DD') : '');
export const formatTime2HM = (time: Date = new Date()) => dayjs(time).format('HH:mm');

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
    const date = interval.next().toString();
    return new Date(date);
  } catch (error) {
    return new Date('2099');
  }
};
