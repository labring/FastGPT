import React, { useCallback, useMemo } from 'react';
import MultipleRowSelect from './MultipleRowSelect';
import { useTranslation } from 'next-i18next';
import { type MultipleSelectProps } from './type';
import { cronParser2Fields } from '@fastgpt/global/common/string/time';

type CronType = 'month' | 'week' | 'day' | 'interval';

type CronFieldType = [CronType, number, number];

enum CronJobTypeEnum {
  month = 'month',
  week = 'week',
  day = 'day',
  interval = 'interval'
}

export const defaultCronString = '0 0 * * *';

export const defaultValue = [CronJobTypeEnum.day, 0, 0];

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
  cronString = '',
  t: any // i18nT
) => {
  const cronField = cronString2Fields(cronString);
  if (!cronField) {
    return t('common:not_open');
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

  return t('common:not_open');
};

const CronSelector = ({
  cronString,
  onChange
}: {
  cronString?: string;
  onChange: (e: string) => void;
}) => {
  const { t } = useTranslation();

  const hoursOptions = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        label: `${i < 10 ? '0' : ''}${i}:00`,
        value: i
      })),
    []
  );
  const weekOptions = useMemo(() => {
    return [
      {
        label: t('app:week.Sunday'),
        value: 0,
        children: hoursOptions
      },
      {
        label: t('app:week.Monday'),
        value: 1,
        children: hoursOptions
      },
      {
        label: t('app:week.Tuesday'),
        value: 2,
        children: hoursOptions
      },
      {
        label: t('app:week.Wednesday'),
        value: 3,
        children: hoursOptions
      },
      {
        label: t('app:week.Thursday'),
        value: 4,
        children: hoursOptions
      },
      {
        label: t('app:week.Friday'),
        value: 5,
        children: hoursOptions
      },
      {
        label: t('app:week.Saturday'),
        value: 6,
        children: hoursOptions
      }
    ];
  }, [hoursOptions, t]);
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        label: i + 1 + t('app:month.unit'),
        value: i + 1,
        children: hoursOptions
      })),
    [hoursOptions, t]
  );
  const intervalOptions = useMemo(
    () => [
      {
        label: t('app:interval.per_hour'),
        value: 1
      },
      {
        label: t('app:interval.2_hours'),
        value: 2
      },
      {
        label: t('app:interval.3_hours'),
        value: 3
      },
      {
        label: t('app:interval.4_hours'),
        value: 4
      },
      {
        label: t('app:interval.6_hours'),
        value: 6
      },
      {
        label: t('app:interval.12_hours'),
        value: 12
      }
    ],
    [t]
  );

  const cronField = cronString2Fields(cronString) as CronFieldType;

  const formatLabel = cronString2Label(cronString ?? '', t);

  const cronConfig2cronString = useCallback(
    (e: CronFieldType) => {
      const str = (() => {
        if (e[0] === CronJobTypeEnum.month) {
          return `0 ${e[2]} ${e[1]} * *`;
        } else if (e[0] === CronJobTypeEnum.week) {
          return `0 ${e[2]} * * ${e[1]}`;
        } else if (e[0] === CronJobTypeEnum.day) {
          return `0 ${e[1]} * * *`;
        } else if (e[0] === CronJobTypeEnum.interval) {
          return `0 */${e[1]} * * *`;
        } else {
          return '';
        }
      })();
      onChange(str);
    },
    [onChange]
  );

  const cronSelectList = useMemo<MultipleSelectProps['list']>(
    () => [
      {
        label: t('app:cron.every_day'),
        value: CronJobTypeEnum.day,
        children: hoursOptions
      },
      {
        label: t('app:cron.every_week'),
        value: CronJobTypeEnum.week,
        children: weekOptions
      },
      {
        label: t('app:cron.every_month'),
        value: CronJobTypeEnum.month,
        children: monthOptions
      },
      {
        label: t('app:cron.interval'),
        value: CronJobTypeEnum.interval,
        children: intervalOptions
      }
    ],
    [hoursOptions, intervalOptions, monthOptions, t, weekOptions]
  );

  return (
    <MultipleRowSelect
      label={formatLabel}
      value={cronField}
      list={cronSelectList}
      onSelect={(e) => {
        cronConfig2cronString(e as CronFieldType);
      }}
      changeOnEverySelect
    />
  );
};

export default React.memo(CronSelector);
