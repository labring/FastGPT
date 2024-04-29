import dayjs from 'dayjs';
import cronParser from 'cron-parser';

export const formatTime2YMDHM = (time?: Date) =>
  time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '';
export const formatTime2YMD = (time?: Date) => (time ? dayjs(time).format('YYYY-MM-DD') : '');
export const formatTime2HM = (time: Date = new Date()) => dayjs(time).format('HH:mm');

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
