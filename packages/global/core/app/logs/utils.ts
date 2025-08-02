import dayjs from 'dayjs';
import { AppLogTimespanEnum } from './constants';

export const formatDateByTimespan = (timestamp: number, timespan: AppLogTimespanEnum) => {
  const date = new Date(timestamp);

  if (timespan === AppLogTimespanEnum.day) {
    return {
      date: dayjs(date).format('MM-DD'),
      xLabel: dayjs(date).format('YYYY-MM-DD')
    };
  } else if (timespan === AppLogTimespanEnum.week) {
    const startStr = dayjs(date).format('MM/DD');
    const endStr = dayjs(date).add(6, 'day').format('MM/DD');

    return {
      date: `${startStr}-${endStr}`,
      xLabel: `${startStr}-${endStr}`
    };
  } else if (timespan === AppLogTimespanEnum.month) {
    return {
      date: dayjs(date).format('YYYY-MM'),
      xLabel: dayjs(date).format('YYYY-MM')
    };
  } else {
    const year = date.getFullYear();
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    return {
      date: `${year}Q${quarter}`,
      xLabel: `${year}Q${quarter}`
    };
  }
};

export const calculateOffsetDates = (
  start: Date,
  end: Date,
  offset: number,
  timespan: AppLogTimespanEnum
) => {
  const offsetStart = new Date(start);
  const offsetEnd = new Date(end);

  if (timespan === AppLogTimespanEnum.quarter) {
    offsetStart.setMonth(offsetStart.getMonth() + offset * 3);
    offsetEnd.setMonth(offsetEnd.getMonth() + offset * 3);
  } else if (timespan === AppLogTimespanEnum.month) {
    offsetStart.setMonth(offsetStart.getMonth() + offset);
    offsetEnd.setMonth(offsetEnd.getMonth() + offset);
  } else if (timespan === AppLogTimespanEnum.week) {
    offsetStart.setDate(offsetStart.getDate() + offset * 7);
    offsetEnd.setDate(offsetEnd.getDate() + offset * 7);
  } else {
    offsetStart.setDate(offsetStart.getDate() + offset);
    offsetEnd.setDate(offsetEnd.getDate() + offset);
  }

  return { offsetStart, offsetEnd };
};
