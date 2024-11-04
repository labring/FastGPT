import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  Switch,
  Textarea,
  HStack
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { AppScheduledTriggerConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/common/MyModal';
import dynamic from 'next/dynamic';
import type { MultipleSelectProps } from '@fastgpt/web/components/common/MySelect/type.d';
import { cronParser2Fields } from '@fastgpt/global/common/string/time';
import TimezoneSelect from '@fastgpt/web/components/common/MySelect/TimezoneSelect';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
const MultipleRowSelect = dynamic(
  () => import('@fastgpt/web/components/common/MySelect/MultipleRowSelect')
);
import { i18nT } from '@fastgpt/web/i18n/utils';
// options type:
enum CronJobTypeEnum {
  month = 'month',
  week = 'week',
  day = 'day',
  interval = 'interval'
}
type CronType = 'month' | 'week' | 'day' | 'interval';

const defaultValue = ['day', 0, 0];
const defaultCronString = '0 0 * * *';

type CronFieldType = [CronType, number, number];

const ScheduledTriggerConfig = ({
  value,
  onChange
}: {
  value?: AppScheduledTriggerConfigType;
  onChange: (e?: AppScheduledTriggerConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const timezone = value?.timezone;
  const cronString = value?.cronString;
  const defaultPrompt = value?.defaultPrompt;

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
      label: `${i + 1}` + t('app:month.unit'),
      value: i,
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

  const onUpdate = useCallback(
    ({
      cronString,
      timezone,
      defaultPrompt
    }: {
      cronString?: string;
      timezone?: string;
      defaultPrompt?: string;
    }) => {
      onChange({
        cronString: cronString ?? value?.cronString ?? '',
        timezone: timezone ?? value?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultPrompt: defaultPrompt ?? value?.defaultPrompt ?? ''
      });
    },
    [onChange, value]
  );

  /* cron string to config field */
  const cronConfig = useMemo(() => {
    if (!cronString) {
      return;
    }
    const cronField = cronParser2Fields(cronString);

    if (!cronField) {
      return;
    }

    if (cronField.dayOfMonth.length !== 31) {
      return {
        isOpen: true,
        cronField: [CronJobTypeEnum.month, cronField.dayOfMonth[0], cronField.hour[0]]
      };
    }
    if (cronField.dayOfWeek.length !== 8) {
      return {
        isOpen: true,
        cronField: [CronJobTypeEnum.week, cronField.dayOfWeek[0], cronField.hour[0]]
      };
    }
    if (cronField.hour.length === 1) {
      return {
        isOpen: true,
        cronField: [CronJobTypeEnum.day, cronField.hour[0], 0]
      };
    }
    return {
      isOpen: true,
      cronField: [CronJobTypeEnum.interval, 24 / cronField.hour.length, 0]
    };
  }, [cronString]);
  const isOpenSchedule = cronConfig?.isOpen ?? false;
  const cronField = (cronConfig?.cronField || defaultValue) as CronFieldType;

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
      onUpdate({ cronString: str });
    },
    [onUpdate]
  );

  // cron config to show label
  const formatLabel = useMemo(() => {
    if (!isOpenSchedule) {
      return t('common:common.Not open');
    }

    if (cronField[0] === 'month') {
      return t('core.app.schedule.Every month', {
        day: cronField[1],
        hour: cronField[2]
      });
    }
    if (cronField[0] === 'week') {
      return t('core.app.schedule.Every week', {
        day: cronField[1] === 0 ? t('app:day') : cronField[1],
        hour: cronField[2]
      });
    }
    if (cronField[0] === 'day') {
      return t('core.app.schedule.Every day', {
        hour: cronField[1]
      });
    }
    if (cronField[0] === 'interval') {
      return t('core.app.schedule.Interval', {
        interval: cronField[1]
      });
    }

    return t('common:common.Not open');
  }, [cronField, isOpenSchedule, t]);

  useEffect(() => {
    if (!value?.timezone) {
      onUpdate({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    }
  }, []);

  const Render = useMemo(() => {
    return (
      <>
        <Flex alignItems={'center'}>
          <MyIcon name={'core/app/schedulePlan'} w={'20px'} />
          <HStack ml={2} flex={1} spacing={1}>
            <FormLabel color={'myGray.600'}>{t('common:core.app.Interval timer run')}</FormLabel>
            <QuestionTip label={t('common:core.app.Interval timer tip')} />
          </HStack>
          <MyTooltip label={t('common:core.app.Config schedule plan')}>
            <Button
              variant={'transparentBase'}
              iconSpacing={1}
              size={'sm'}
              mr={'-5px'}
              color={'myGray.600'}
              onClick={onOpen}
            >
              {formatLabel}
            </Button>
          </MyTooltip>
        </Flex>

        <MyModal
          isOpen={isOpen}
          onClose={onClose}
          iconSrc={'core/app/schedulePlan'}
          title={t('common:core.app.Interval timer config')}
          overflow={'unset'}
        >
          <ModalBody>
            <Flex justifyContent={'space-between'} alignItems={'center'}>
              <FormLabel flex={'0 0 80px'}>{t('common:core.app.schedule.Open schedule')}</FormLabel>
              <Switch
                isChecked={isOpenSchedule}
                onChange={(e) => {
                  if (e.target.checked) {
                    onUpdate({ cronString: defaultCronString });
                  } else {
                    onUpdate({ cronString: '' });
                  }
                }}
              />
            </Flex>
            {isOpenSchedule && (
              <>
                <Flex alignItems={'center'} mt={5}>
                  <FormLabel flex={'0 0 80px'}>{t('app:execute_time')}</FormLabel>
                  <Box flex={'1 0 0'}>
                    <MultipleRowSelect
                      label={formatLabel}
                      value={cronField}
                      list={cronSelectList.current}
                      onSelect={(e) => {
                        cronConfig2cronString(e as CronFieldType);
                      }}
                    />
                  </Box>
                </Flex>
                <Flex alignItems={'center'} mt={5}>
                  <FormLabel flex={'0 0 80px'}>{t('app:time_zone')}</FormLabel>
                  <Box flex={'1 0 0'}>
                    <TimezoneSelect
                      value={timezone}
                      onChange={(e) => {
                        onUpdate({ timezone: e });
                      }}
                    />
                  </Box>
                </Flex>
                <Box mt={5}>
                  <FormLabel mb={1}>{t('common:core.app.schedule.Default prompt')}</FormLabel>
                  <Textarea
                    value={defaultPrompt}
                    rows={8}
                    bg={'myGray.50'}
                    placeholder={t('common:core.app.schedule.Default prompt placeholder')}
                    onChange={(e) => {
                      onUpdate({ defaultPrompt: e.target.value });
                    }}
                  />
                </Box>
              </>
            )}
          </ModalBody>
        </MyModal>
      </>
    );
  }, [
    cronConfig2cronString,
    cronField,
    defaultPrompt,
    formatLabel,
    isOpen,
    isOpenSchedule,
    onClose,
    onOpen,
    onUpdate,
    t,
    timezone
  ]);

  return Render;
};

export default React.memo(ScheduledTriggerConfig);
