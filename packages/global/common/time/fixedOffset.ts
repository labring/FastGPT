import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

/** 将明确的 ±HH:MM 固定偏移转换成毫秒；不接受 IANA 时区，避免混淆日历规则与固定偏移。 */
export const getFixedOffsetMilliseconds = (offset: string) => {
  const match = /^([+-])([01]\d|2[0-3]):([0-5]\d)$/.exec(offset);
  if (!match) throw new RangeError('Invalid fixed UTC offset');
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
};

/**
 * 输出固定偏移下的日历时间，输入先按其原始偏移或服务器本地时间解析。
 * 使用 UTC 镜像的日历字段格式化，避免 Day.js utcOffset 的本地 DST 运算造成一小时误差。
 * format 用于日期/时间字段，不用于 Z、Unix 时间戳等代表绝对时刻的 token；查询仍使用原始时间。
 */
export const formatDateWithOffset = ({
  time,
  offset,
  format
}: {
  time: string | Date | number;
  offset: string;
  format: string;
}) => dayjs.utc(new Date(time).getTime() + getFixedOffsetMilliseconds(offset)).format(format);
