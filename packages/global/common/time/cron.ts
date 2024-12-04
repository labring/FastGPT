import { cronParser2Fields } from '../string/time';
import { CronJobTypeEnum, defaultValue } from './constant';

export const cronString2Fields = (cronString?: string) => {
  if (!cronString) {
    return undefined;
  }
  const cronField = cronParser2Fields(cronString);

  if (!cronField) {
    return defaultValue;
  }

  if (cronField.dayOfMonth.length !== 31) {
    return [CronJobTypeEnum.month, cronField.dayOfMonth[0], cronField.hour[0]];
  }
  if (cronField.dayOfWeek.length !== 8) {
    return [CronJobTypeEnum.week, cronField.dayOfWeek[0], cronField.hour[0]];
  }
  if (cronField.hour.length === 1) {
    return [CronJobTypeEnum.day, cronField.hour[0], 0];
  }
  return [CronJobTypeEnum.interval, 24 / cronField.hour.length, 0];
};

export const cronString2Label = (
  cronString: string,
  t: any // i18nT
) => {
  const cronField = cronString2Fields(cronString);
  if (!cronField) {
    return t('common:common.Not open');
  }

  if (cronField[0] === 'month') {
    return t('common:core.app.schedule.Every month', {
      day: cronField[1],
      hour: cronField[2]
    });
  }
  if (cronField[0] === 'week') {
    const weekMap = {
      0: t('app:week.Sunday'),
      1: t('app:week.Monday'),
      2: t('app:week.Tuesday'),
      3: t('app:week.Wednesday'),
      4: t('app:week.Thursday'),
      5: t('app:week.Friday'),
      6: t('app:week.Saturday')
    };
    return t('common:core.app.schedule.Every week', {
      day: weekMap[cronField[1] as keyof typeof weekMap],
      hour: cronField[2]
    });
  }
  if (cronField[0] === 'day') {
    return t('common:core.app.schedule.Every day', {
      hour: cronField[1]
    });
  }
  if (cronField[0] === 'interval') {
    return t('common:core.app.schedule.Interval', {
      interval: cronField[1]
    });
  }

  return t('common:common.Not open');
};
