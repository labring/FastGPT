import nodeCron from 'node-cron';

export const setCron = (time: string, cb: () => void) => {
  // second minute hour day month week
  return nodeCron.schedule(time, cb);
};
