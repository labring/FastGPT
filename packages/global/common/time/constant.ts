export enum CronJobTypeEnum {
  month = 'month',
  week = 'week',
  day = 'day',
  interval = 'interval'
}

export const defaultCronString = '0 0 * * *';

export const defaultValue = [CronJobTypeEnum.day, 0, 0];
