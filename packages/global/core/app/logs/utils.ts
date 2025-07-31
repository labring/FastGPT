import dayjs from 'dayjs';
import { AppLogTimespanEnum } from './constants';

export const formatDateByTimespan = (timestamp: number, timespan: string) => {
  const formatters = {
    week: (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + 6);

      const startStr = dayjs(date).format('MM/DD');
      const endStr = dayjs(weekEnd).format('MM/DD');

      return {
        date: `${startStr}-${endStr}`,
        xLabel: `${startStr}-${endStr}`
      };
    },
    month: (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      return {
        date: dayjs(date).format('YYYY-MM'),
        xLabel: dayjs(date).format('YYYY-MM')
      };
    },
    quarter: (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      const year = date.getFullYear();
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      return {
        date: `${year}Q${quarter}`,
        xLabel: `${year}Q${quarter}`
      };
    },
    day: (timestamp: number) => {
      const date = new Date(timestamp * 1000);
      return {
        date: dayjs(date).format('MM-DD'),
        xLabel: dayjs(date).format('YYYY-MM-DD')
      };
    }
  };

  const formatter = formatters[timespan as keyof typeof formatters] || formatters.day;
  return formatter(timestamp);
};

export const calculateOffsetDates = (
  start: Date,
  end: Date,
  offset: number,
  timespan: AppLogTimespanEnum
) => {
  if (timespan === AppLogTimespanEnum.week) {
    return {
      offsetStart: new Date(start.getTime() + offset * 7 * 24 * 60 * 60 * 1000),
      offsetEnd: new Date(end.getTime() + offset * 7 * 24 * 60 * 60 * 1000)
    };
  } else if (timespan === AppLogTimespanEnum.month) {
    const offsetStartMonth = new Date(start);
    const offsetEndMonth = new Date(end);
    offsetStartMonth.setMonth(offsetStartMonth.getMonth() + offset);
    offsetEndMonth.setMonth(offsetEndMonth.getMonth() + offset);
    return {
      offsetStart: offsetStartMonth,
      offsetEnd: offsetEndMonth
    };
  } else if (timespan === AppLogTimespanEnum.quarter) {
    const offsetStartQuarter = new Date(start);
    const offsetEndQuarter = new Date(end);
    offsetStartQuarter.setMonth(offsetStartQuarter.getMonth() + offset * 3);
    offsetEndQuarter.setMonth(offsetEndQuarter.getMonth() + offset * 3);
    return {
      offsetStart: offsetStartQuarter,
      offsetEnd: offsetEndQuarter
    };
  } else {
    return {
      offsetStart: new Date(start.getTime() + offset * 24 * 60 * 60 * 1000),
      offsetEnd: new Date(end.getTime() + offset * 24 * 60 * 60 * 1000)
    };
  }
};
