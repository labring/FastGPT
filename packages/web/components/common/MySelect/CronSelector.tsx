import React, { useCallback, useRef } from 'react';
import MultipleRowSelect from './MultipleRowSelect';
import { useTranslation } from 'next-i18next';
import { MultipleSelectProps } from './type';
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

const CronSelector = ({
  cronString,
  onChange
}: {
  cronString?: string;
  onChange: (e: string) => void;
}) => {
  const { t } = useTranslation();

  const get24HoursOptions = () => {
    return Array.from({ length: 24 }, (_, i) => ({
      label: `${i < 10 ? '0' : ''}${i}:00`,
      value: i
    }));
  };
  const getRoute = (i: number) => {
    const { t } = useTranslation();
    switch (i) {
      case 0:
        return t('app:week.Sunday');
      case 1:
        return t('app:week.Monday');
      case 2:
        return t('app:week.Tuesday');
      case 3:
        return t('app:week.Wednesday');
      case 4:
        return t('app:week.Thursday');
      case 5:
        return t('app:week.Friday');
      case 6:
        return t('app:week.Saturday');
      default:
        return t('app:week.Sunday');
    }
  };
  const getWeekOptions = () => {
    return Array.from({ length: 7 }, (_, i) => {
      return {
        label: getRoute(i),
        value: i,
        children: get24HoursOptions()
      };
    });
  };
  const getMonthOptions = () => {
    return Array.from({ length: 28 }, (_, i) => ({
      label: i + 1 + t('app:month.unit'),
      value: i + 1,
      children: get24HoursOptions()
    }));
  };
  const getInterValOptions = () => {
    // 每n小时
    return [
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
    ];
  };

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

  const cronSelectList = useRef<MultipleSelectProps['list']>([
    {
      label: t('app:cron.every_day'),
      value: CronJobTypeEnum.day,
      children: get24HoursOptions()
    },
    {
      label: t('app:cron.every_week'),
      value: CronJobTypeEnum.week,
      children: getWeekOptions()
    },
    {
      label: t('app:cron.every_month'),
      value: CronJobTypeEnum.month,
      children: getMonthOptions()
    },
    {
      label: t('app:cron.interval'),
      value: CronJobTypeEnum.interval,
      children: getInterValOptions()
    }
  ]);

  return (
    <MultipleRowSelect
      label={formatLabel}
      value={cronField}
      list={cronSelectList.current}
      onSelect={(e) => {
        cronConfig2cronString(e as CronFieldType);
      }}
      changeOnEverySelect
    />
  );
};

export default React.memo(CronSelector);
