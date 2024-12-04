import React, { useCallback, useRef } from 'react';
import MultipleRowSelect from './MultipleRowSelect';
import { useTranslation } from 'next-i18next';
import { MultipleSelectProps } from './type';
import { CronJobTypeEnum } from '@fastgpt/global/common/time/constant';
import { cronString2Fields, cronString2Label } from '@fastgpt/global/common/time/cron';
import { CronFieldType } from '@fastgpt/global/common/time/type';

const ScheduleTimeSelect = ({
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

export default React.memo(ScheduleTimeSelect);
