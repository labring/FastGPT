import { serviceEnv } from '@fastgpt/service/env';

type DailyTrainingWindow = {
  startMinute: number;
  endMinute: number;
};

const parseTime = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

/**
 * 将已通过环境变量校验的 `HH:mm-HH:mm` 转换为当天分钟数区间。
 * 开始时间包含在窗口内，结束时间不包含；跨午夜窗口由调用方统一处理。
 */
export const parseDatasetTrainingWindow = (value: string): DailyTrainingWindow => ({
  startMinute: parseTime(value.slice(0, 5)),
  endMinute: parseTime(value.slice(6))
});

/** 按指定 IANA 时区读取当前本地分钟，避免容器系统时区改变调度语义。 */
export const getMinuteInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);

  return hour * 60 + minute;
};

/**
 * 判断给定分钟是否落在每日训练窗口内，支持普通窗口和跨午夜窗口。
 * 采用左闭右开区间，确保相邻窗口在边界时刻不会重复领取任务。
 */
export const isMinuteInDatasetTrainingWindow = (
  minute: number,
  { startMinute, endMinute }: DailyTrainingWindow
) =>
  startMinute < endMinute
    ? minute >= startMinute && minute < endMinute
    : minute >= startMinute || minute < endMinute;

/**
 * 判断当前是否允许领取新的知识库训练任务。
 * 未配置执行窗口时保持原有全天执行行为；窗口关闭后已领取任务继续完成。
 */
export const isDatasetTrainingWindowOpen = (date = new Date()) => {
  const window = serviceEnv.DATASET_TRAINING_WINDOW;
  if (!window) return true;

  return isMinuteInDatasetTrainingWindow(
    getMinuteInTimeZone(date, serviceEnv.DATASET_TRAINING_TIMEZONE),
    parseDatasetTrainingWindow(window)
  );
};
