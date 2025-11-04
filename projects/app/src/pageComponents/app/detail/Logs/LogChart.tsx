import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  Grid
} from '@chakra-ui/react';
import type { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import DateRangePicker from '@fastgpt/web/components/common/DateRangePicker';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { AppContext } from '../context';
import { useContextSelector } from 'use-context-selector';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppChartData, getAppTotalData } from '@/web/core/app/api/log';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  addDays,
  startOfDay,
  startOfWeek,
  endOfWeek,
  differenceInDays,
  differenceInMonths,
  differenceInQuarters,
  eachWeekOfInterval
} from 'date-fns';
import dayjs from 'dayjs';
import LineChartComponent from '@fastgpt/web/components/common/charts/LineChartComponent';
import BarChartComponent from '@fastgpt/web/components/common/charts/BarChartComponent';
import { theme } from '@fastgpt/web/styles/theme';
import MySelect from '@fastgpt/web/components/common/MySelect';
import {
  AppLogTimespanEnum,
  fakeChartData,
  offsetOptions
} from '@fastgpt/global/core/app/logs/constants';
import { formatDateByTimespan } from '@fastgpt/global/core/app/logs/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyBox from '@fastgpt/web/components/common/MyBox';

export type HeaderControlProps = {
  appId: string;
  showSourceSelector?: boolean;
  chatSources: ChatSourceEnum[];
  setChatSources: (value: ChatSourceEnum[]) => void;
  isSelectAllSource: boolean;
  setIsSelectAllSource: React.Dispatch<React.SetStateAction<boolean>>;
  dateRange: DateRangeType;
  setDateRange: (value: DateRangeType) => void;
  px?: [number, number];
};

const chartBoxStyles = {
  px: 5,
  pt: 4,
  pb: 8,
  h: '300px',
  border: 'base',
  borderRadius: 'md',
  overflow: 'hidden',
  bg: 'white'
};

const formatWeekDate = (date: Date) => {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });

  const startStr = dayjs(weekStart).format('MM/DD');
  const endStr = dayjs(weekEnd).format('MM/DD');

  return {
    date: `${startStr}-${endStr}`,
    xLabel: `${startStr}-${endStr}`
  };
};

const generateCompleteTimeSeries = (
  dateRange: DateRangeType,
  timespan: AppLogTimespanEnum
): string[] => {
  if (!dateRange.from || !dateRange.to) return [];

  const start = startOfDay(new Date(dateRange.from));
  const end = startOfDay(new Date(dateRange.to));

  const timespanConfig = {
    [AppLogTimespanEnum.day]: {
      count: differenceInDays(end, start) + 1,
      addUnit: (date: Date, i: number) => date.setDate(date.getDate() + i),
      format: (date: Date) => formatDateByTimespan(date.getTime(), timespan)
    },
    [AppLogTimespanEnum.week]: {
      dates: eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }),
      format: (date: Date) => formatWeekDate(date)
    },
    [AppLogTimespanEnum.month]: {
      count: differenceInMonths(end, start) + 1,
      addUnit: (date: Date, i: number) => date.setMonth(date.getMonth() + i),
      format: (date: Date) => formatDateByTimespan(date.getTime(), timespan)
    },
    [AppLogTimespanEnum.quarter]: {
      count: differenceInQuarters(end, start) + 1,
      addUnit: (date: Date, i: number) => date.setMonth(date.getMonth() + i * 3),
      format: (date: Date) => formatDateByTimespan(date.getTime(), timespan)
    }
  };

  const config = timespanConfig[timespan];
  const dates: string[] = [];

  if ('dates' in config) {
    config.dates.forEach((date) => {
      const { date: formattedDate } = config.format(date);
      dates.push(formattedDate);
    });
  } else {
    for (let i = 0; i < config.count; i++) {
      const date = new Date(start);
      config.addUnit(date, i);
      const { date: formattedDate } = config.format(date);
      dates.push(formattedDate);
    }
  }

  return [...new Set(dates)];
};

const LogChart = ({
  appId,
  chatSources,
  setChatSources,
  isSelectAllSource,
  setIsSelectAllSource,
  dateRange,
  setDateRange,
  showSourceSelector = true,
  px = [4, 8]
}: HeaderControlProps) => {
  const { t } = useTranslation();

  const { feConfigs } = useSystemStore();

  const [userTimespan, setUserTimespan] = useState<AppLogTimespanEnum>(AppLogTimespanEnum.day);
  const [chatTimespan, setChatTimespan] = useState<AppLogTimespanEnum>(AppLogTimespanEnum.day);
  const [appTimespan, setAppTimespan] = useState<AppLogTimespanEnum>(AppLogTimespanEnum.day);

  const [offset, setOffset] = useState<string>(offsetOptions[0].value);

  const { data: chartData, loading } = useRequest2(
    async () => {
      return getAppChartData({
        appId,
        dateStart: dateRange.from || new Date(),
        dateEnd: addDays(dateRange.to || new Date(), 1),
        offset: parseInt(offset),
        source: chatSources,
        userTimespan,
        chatTimespan,
        appTimespan
      });
    },
    {
      manual: !feConfigs?.isPlus,
      refreshDeps: [
        appId,
        dateRange.from,
        dateRange.to,
        offset,
        chatSources,
        userTimespan,
        chatTimespan,
        appTimespan
      ]
    }
  );

  const formatChartData = useMemo(() => {
    if (!feConfigs?.isPlus) return fakeChartData;

    const formatTimestamp = (timestamp: number, timespan: AppLogTimespanEnum) => {
      return timespan === AppLogTimespanEnum.week
        ? formatWeekDate(new Date(timestamp))
        : formatDateByTimespan(timestamp, timespan);
    };

    const processChartData = <T extends Record<string, any>>(
      rawData: any[] | undefined,
      timespan: AppLogTimespanEnum | undefined,
      mapper: (item: any, dateInfo: { date: string; xLabel: string }) => Omit<T, 'x' | 'xLabel'>,
      defaultValues: Omit<T, 'x' | 'xLabel'>
    ): T[] => {
      if (!timespan) return [];

      const data = rawData || [];
      const completeDates = generateCompleteTimeSeries(dateRange, timespan);

      const dataMap = new Map<string, T>();
      data.forEach((item) => {
        const dateInfo = formatTimestamp(item.timestamp, timespan);
        const mappedItem = {
          x: dateInfo.date,
          xLabel: dateInfo.xLabel,
          ...mapper(item, dateInfo)
        } as unknown as T;
        dataMap.set(dateInfo.date, mappedItem);
      });

      return completeDates.map(
        (date) => dataMap.get(date) || ({ x: date, xLabel: date, ...defaultValues } as unknown as T)
      );
    };

    const createDefaultValues = (keys: string[], specialValues: Record<string, any> = {}) => {
      return keys.reduce((acc, key) => ({ ...acc, [key]: specialValues[key] || 0 }), {});
    };

    const user = processChartData(
      chartData?.userData,
      userTimespan,
      (item) => ({
        userCount: item.summary.userCount,
        newUserCount:
          userTimespan === 'day' && item.summary.retentionUserCount > 0
            ? item.summary.newUserCount - item.summary.retentionUserCount
            : item.summary.newUserCount,
        retentionUserCount: item.summary.retentionUserCount,
        points: item.summary.points,
        sourceCountMap: item.summary.sourceCountMap
      }),
      createDefaultValues(
        ['userCount', 'newUserCount', 'retentionUserCount', 'points', 'sourceCountMap'],
        {
          sourceCountMap: Object.keys(ChatSourceMap).reduce(
            (acc, key) => ({ ...acc, [key]: 0 }),
            {}
          )
        }
      )
    );

    const chat = processChartData(
      chartData?.chatData,
      chatTimespan,
      (item) => {
        const pointsPerChat =
          item.summary.chatCount > 0
            ? Number((item.summary.points / item.summary.chatCount).toFixed(2))
            : 0;
        return {
          chatItemCount: item.summary.chatItemCount,
          chatCount: item.summary.chatCount,
          pointsPerChat,
          errorCount: item.summary.errorCount,
          errorRate: item.summary.chatItemCount
            ? Number(((item.summary.errorCount / item.summary.chatItemCount) * 100).toFixed(2))
            : 0
        };
      },
      createDefaultValues([
        'chatItemCount',
        'chatCount',
        'pointsPerChat',
        'errorCount',
        'errorRate'
      ])
    );

    const app = processChartData(
      chartData?.appData,
      appTimespan,
      (item) => ({
        goodFeedBackCount: item.summary.goodFeedBackCount,
        badFeedBackCount: item.summary.badFeedBackCount,
        avgDuration: item.summary.totalResponseTime / item.summary.chatCount
      }),
      createDefaultValues(['goodFeedBackCount', 'badFeedBackCount', 'avgDuration'])
    );

    const calculateStats = (
      data: Record<string, any>[],
      metrics: { [key: string]: 'sum' | 'avg' }
    ) => {
      return Object.entries(metrics).reduce(
        (acc, [key, type]) => {
          const values = data.map((item) => item[key] || 0);
          acc[key] =
            type === 'sum'
              ? values.reduce((sum, val) => sum + val, 0)
              : values.length > 0
                ? values.reduce((sum, val) => sum + val, 0) / values.length
                : 0;
          return acc;
        },
        {} as Record<string, number>
      );
    };

    const cumulative = {
      ...calculateStats(user, { userCount: 'sum', points: 'sum' }),
      ...calculateStats(chat, {
        chatItemCount: 'sum',
        chatCount: 'sum',
        pointsPerChat: 'avg',
        errorCount: 'sum'
      }),
      ...calculateStats(app, {
        goodFeedBackCount: 'sum',
        badFeedBackCount: 'sum',
        avgDuration: 'avg'
      })
    };

    const totalChatItems = cumulative.chatItemCount || 0;
    const totalErrors = cumulative.errorCount || 0;
    cumulative.errorRate =
      totalChatItems > 0 ? Number(((totalErrors / totalChatItems) * 100).toFixed(2)) : 0;

    return { user, chat, app, cumulative };
  }, [
    feConfigs?.isPlus,
    chartData?.userData,
    chartData?.chatData,
    chartData?.appData,
    userTimespan,
    chatTimespan,
    appTimespan,
    dateRange
  ]);

  return (
    <MyBox isLoading={loading} display={'flex'} flexDir={'column'} h={'full'}>
      <HeaderControl
        px={px}
        appId={appId}
        chatSources={chatSources}
        setChatSources={setChatSources}
        isSelectAllSource={isSelectAllSource}
        setIsSelectAllSource={setIsSelectAllSource}
        dateRange={dateRange}
        setDateRange={setDateRange}
        showSourceSelector={showSourceSelector}
      />
      <Flex flexDir={'column'} flex={'1 0 0'} h={0} overflowY={'auto'} px={px}>
        <TotalData appId={appId} />
        <Accordion defaultIndex={[0, 1, 2]} allowMultiple reduceMotion>
          <AccordionItem border={'none'}>
            <AccordionButton
              fontSize={'24px'}
              fontWeight={'medium'}
              color={'myGray.900'}
              alignItems={'center'}
              borderRadius={'md'}
              pl={0}
              pr={4}
            >
              <AccordionIcon w={5} color={'myGray.600'} mr={1} />
              {t('app:logs_user_data')}
              <Flex flex={1} />
              <MySelect
                list={Object.values(AppLogTimespanEnum).map((option) => ({
                  label: t(`app:logs_timespan_${option}`),
                  value: option
                }))}
                value={userTimespan}
                onChange={(value) => {
                  setUserTimespan(value);
                  setOffset(offsetOptions[0].value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </AccordionButton>
            <AccordionPanel py={0}>
              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.user}
                    title={t('app:logs_user_count')}
                    description={t('app:logs_user_count_description')}
                    lines={[
                      {
                        dataKey: 'userCount',
                        name: t('app:logs_user_count'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_user_count'),
                        dataKey: 'userCount',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    showAverage={true}
                    averageKey="userCount"
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {t('app:logs_total')}: {formatChartData.cumulative.userCount}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <BarChartComponent
                    data={formatChartData.user}
                    title={t('app:logs_user_retention')}
                    description={t('app:logs_user_retention_description')}
                    bars={[
                      {
                        dataKey: 'retentionUserCount',
                        name: t('app:logs_user_retention'),
                        color: theme.colors.primary['400'],
                        stackId: 'userRetention'
                      },
                      {
                        dataKey: 'newUserCount',
                        name: t('app:logs_new_user_count'),
                        color: theme.colors.primary['100'],
                        stackId: 'userRetention'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_new_user_count'),
                        dataKey: 'newUserCount',
                        color: theme.colors.primary['100'],
                        customValue: (data) => data.newUserCount + data.retentionUserCount
                      },
                      {
                        label: t('app:logs_user_retention'),
                        dataKey: 'retentionUserCount',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    HeaderRightChildren={
                      <MySelect
                        list={offsetOptions}
                        size={'sm'}
                        value={offset}
                        onChange={(value) => {
                          setOffset(value);
                        }}
                      />
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.user}
                    title={t('app:logs_points')}
                    description={t('app:logs_points_description')}
                    lines={[
                      {
                        dataKey: 'points',
                        name: t('app:logs_points'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_points'),
                        dataKey: 'points',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    showAverage={true}
                    averageKey="points"
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {t('app:logs_total')}: {formatChartData.cumulative.points.toFixed(2)}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.user}
                    title={t('app:logs_source_count')}
                    description={t('app:logs_source_count_description')}
                    lines={Object.entries(ChatSourceMap).map(([key, value]) => ({
                      dataKey: `sourceCountMap.${key}`,
                      name: t(value.name as any),
                      color: value.color
                    }))}
                    tooltipItems={Object.entries(ChatSourceMap).map(([key, value]) => ({
                      dataKey: `sourceCountMap.${key}`,
                      label: t(value.name as any),
                      color: value.color,
                      customValue: (data) => data.sourceCountMap[key as ChatSourceEnum]
                    }))}
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
              </Grid>
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem border={'none'} mt={4}>
            <AccordionButton
              fontSize={'24px'}
              fontWeight={'medium'}
              color={'myGray.900'}
              alignItems={'center'}
              borderRadius={'md'}
              pl={0}
              pr={4}
            >
              <AccordionIcon w={5} color={'myGray.600'} mr={1} />
              {t('app:logs_chat_data')}
              <Flex flex={1} />
              <MySelect
                list={Object.values(AppLogTimespanEnum).map((option) => ({
                  label: t(`app:logs_timespan_${option}`),
                  value: option
                }))}
                value={chatTimespan}
                onChange={(value) => {
                  setChatTimespan(value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </AccordionButton>
            <AccordionPanel py={0}>
              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.chat}
                    title={t('app:logs_chat_item_count')}
                    description={t('app:logs_chat_item_count_description')}
                    lines={[
                      {
                        dataKey: 'chatItemCount',
                        name: t('app:logs_chat_item_count'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_chat_item_count'),
                        dataKey: 'chatItemCount',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    showAverage={true}
                    averageKey="chatItemCount"
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {t('app:logs_total')}: {formatChartData.cumulative.chatItemCount}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.chat}
                    title={t('app:logs_chat_count')}
                    description={t('app:logs_chat_count_description')}
                    lines={[
                      {
                        dataKey: 'chatCount',
                        name: t('app:logs_chat_count'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_chat_count'),
                        dataKey: 'chatCount',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    showAverage={true}
                    averageKey="chatCount"
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {t('app:logs_total')}: {formatChartData.cumulative.chatCount}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.chat}
                    title={t('app:logs_error_rate')}
                    description={t('app:logs_error_rate_description')}
                    lines={[
                      {
                        dataKey: 'errorRate',
                        name: t('app:logs_error_rate'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_error_rate'),
                        dataKey: 'errorRate',
                        color: theme.colors.primary['400'],
                        formatter: (value) => `${value}%`
                      }
                    ]}
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {t('app:logs_total_error', {
                          count: formatChartData.cumulative.errorCount,
                          rate: formatChartData.cumulative.errorRate.toFixed(2)
                        })}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.chat}
                    title={t('app:logs_points_per_chat')}
                    description={t('app:logs_points_per_chat_description')}
                    lines={[
                      {
                        dataKey: 'pointsPerChat',
                        name: t('app:logs_points_per_chat'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_points_per_chat'),
                        dataKey: 'pointsPerChat',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {`${t('app:logs_total_avg_points')}: ${formatChartData.cumulative.pointsPerChat.toFixed(2)}`}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
              </Grid>
            </AccordionPanel>
          </AccordionItem>
          <AccordionItem border={'none'} mt={4}>
            <AccordionButton
              fontSize={'24px'}
              fontWeight={'medium'}
              color={'myGray.900'}
              alignItems={'center'}
              borderRadius={'md'}
              pl={0}
              pr={4}
            >
              <AccordionIcon w={5} color={'myGray.600'} mr={1} />
              {t('app:logs_app_result')}
              <Flex flex={1} />
              <MySelect
                list={Object.values(AppLogTimespanEnum).map((option) => ({
                  label: t(`app:logs_timespan_${option}`),
                  value: option
                }))}
                value={appTimespan}
                onChange={(value) => {
                  setAppTimespan(value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </AccordionButton>
            <AccordionPanel py={0}>
              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.app}
                    title={t('app:logs_user_feedback')}
                    description={t('app:logs_user_feedback_description')}
                    lines={[
                      {
                        dataKey: 'goodFeedBackCount',
                        name: t('app:logs_good_feedback'),
                        color: theme.colors.primary['400']
                      },
                      {
                        dataKey: 'badFeedBackCount',
                        name: t('app:logs_bad_feedback'),
                        color: theme.colors.yellow['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_good_feedback'),
                        dataKey: 'goodFeedBackCount',
                        color: theme.colors.primary['400']
                      },
                      {
                        label: t('app:logs_bad_feedback'),
                        dataKey: 'badFeedBackCount',
                        color: theme.colors.yellow['400']
                      }
                    ]}
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {t('app:logs_total_feedback', {
                          goodFeedBack:
                            formatChartData.cumulative.goodFeedBackCount?.toLocaleString() || 0,
                          badFeedBack:
                            formatChartData.cumulative.badFeedBackCount?.toLocaleString() || 0
                        })}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
                <Box {...chartBoxStyles}>
                  <LineChartComponent
                    data={formatChartData.app}
                    title={t('app:logs_average_response_time')}
                    description={t('app:logs_average_response_time_description')}
                    lines={[
                      {
                        dataKey: 'avgDuration',
                        name: t('app:logs_average_response_time'),
                        color: theme.colors.primary['400']
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('app:logs_average_response_time'),
                        dataKey: 'avgDuration',
                        color: theme.colors.primary['400']
                      }
                    ]}
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        {`${t('app:logs_total_avg_duration')}: ${formatChartData.cumulative.avgDuration.toFixed(2)}s`}
                      </Flex>
                    }
                    blur={!feConfigs?.isPlus}
                  />
                </Box>
              </Grid>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Flex>
    </MyBox>
  );
};

export default React.memo(LogChart);

const HeaderControl = ({
  chatSources,
  setChatSources,
  isSelectAllSource,
  setIsSelectAllSource,
  dateRange,
  setDateRange,
  showSourceSelector = true,
  px = [4, 8]
}: HeaderControlProps) => {
  const { t } = useTranslation();

  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  return (
    <Flex flexDir={['column', 'row']} alignItems={['flex-start', 'center']} gap={3} pb={2} px={px}>
      {showSourceSelector && (
        <Flex>
          <MultipleSelect<ChatSourceEnum>
            list={sourceList}
            value={chatSources}
            onSelect={setChatSources}
            isSelectAll={isSelectAllSource}
            setIsSelectAll={setIsSelectAllSource}
            h={10}
            w={'226px'}
            bg={'white'}
            rounded={'8px'}
            tagStyle={{
              px: 1,
              py: 1,
              borderRadius: 'sm',
              bg: 'myGray.100',
              color: 'myGray.900'
            }}
            borderColor={'myGray.200'}
            formLabel={t('app:logs_source')}
            formLabelFontSize={'sm'}
          />
        </Flex>
      )}
      <Flex>
        <DateRangePicker
          defaultDate={dateRange}
          onSuccess={(date) => {
            setDateRange(date);
          }}
          bg={'white'}
          h={10}
          w={'240px'}
          rounded={'8px'}
          borderColor={'myGray.200'}
          formLabel={t('app:logs_date')}
          _hover={{
            borderColor: 'primary.300'
          }}
        />
      </Flex>
    </Flex>
  );
};

const TotalData = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const {
    data: totalData = {
      totalUsers: 0,
      totalChats: 0,
      totalPoints: 0
    }
  } = useRequest2(
    async () => {
      if (feConfigs?.isPlus) {
        return await getAppTotalData({ appId });
      }
      return {
        totalUsers: 455,
        totalChats: 22112,
        totalPoints: 112233
      };
    },
    {
      manual: false,
      refreshDeps: [appId, feConfigs?.isPlus]
    }
  );

  const totalDataArray = useMemo(() => {
    return [
      {
        label: t('app:logs_total_users'),
        icon: 'support/user/usersLight',
        colorSchema: {
          icon: 'primary.600',
          border: 'primary.200',
          bg: 'primary.50'
        },
        value: totalData.totalUsers
      },
      {
        label: t('app:logs_total_chat'),
        icon: 'core/chat/chatLight',
        colorSchema: {
          icon: 'green.600',
          border: 'green.200',
          bg: 'green.50'
        },
        value: totalData.totalChats
      },
      {
        label: t('app:logs_total_points'),
        icon: 'support/bill/payRecordLight',
        colorSchema: {
          icon: 'yellow.600',
          border: 'yellow.200',
          bg: 'yellow.50'
        },
        value: totalData.totalPoints
      }
    ];
  }, [t, totalData.totalChats, totalData.totalPoints, totalData.totalUsers]);

  return (
    <>
      <Flex gap={4} mt={2} flexWrap={'wrap'}>
        {totalDataArray.map((item, index) => (
          <Flex
            key={index}
            bg={'white'}
            borderRadius={'12px'}
            px={8}
            py={6}
            flex={1}
            border={'1px solid'}
            borderColor={'myGray.200'}
            alignItems={'center'}
          >
            <Flex flexDir={'column'} flex={1}>
              <Box fontSize={'sm'} color={'myGray.500'} mb={1}>
                {item.label}
              </Box>
              <Box
                fontSize={'28px'}
                fontWeight={'medium'}
                color={'myGray.900'}
                filter={feConfigs?.isPlus ? 'none' : 'blur(7.5px)'}
              >
                {item.value.toLocaleString()}
              </Box>
            </Flex>
            <Flex
              w={12}
              h={12}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'lg'}
              bg={item.colorSchema.bg}
              border={'1px solid'}
              borderColor={item.colorSchema.border}
            >
              <MyIcon name={item.icon as any} w={6} h={6} color={item.colorSchema.icon} />
            </Flex>
          </Flex>
        ))}
      </Flex>
      <Flex alignItems={'center'} gap={2} mt={3} mb={10}>
        <MyIcon name="common/info" w={4} color={'primary.600'} />
        <Box fontSize={'sm'} color={'myGray.600'}>
          {t('app:logs_total_tips')}
        </Box>
      </Flex>
    </>
  );
};
