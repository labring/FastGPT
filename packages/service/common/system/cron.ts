import nodeCron, { type ScheduleOptions } from 'node-cron';

export const setCron = (time: string, cb: () => void, options?: ScheduleOptions) => {
  // second minute hour day month week
  return nodeCron.schedule(time, cb, options);
};
