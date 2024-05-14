import dayjs from 'dayjs';
import cronParser from 'cron-parser';

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
    return '刚刚';
  }

  // 如果时间是今天，展示几时:几分
  if (now.isSame(target, 'day')) {
    return target.format('HH:mm');
  }

  // 如果是昨天，展示昨天
  if (now.subtract(1, 'day').isSame(target, 'day')) {
    return '昨天';
  }

  // 如果是前天，展示前天
  if (now.subtract(2, 'day').isSame(target, 'day')) {
    return '前天';
  }

  // 如果是今年，展示某月某日
  if (now.isSame(target, 'year')) {
    return target.format('MM/DD');
  }

  // 如果是更久之前，展示某年某月某日
  return target.format('YYYY/M/D');
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
