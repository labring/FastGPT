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
import { addDays } from 'date-fns';
import LineChartComponent from '@fastgpt/web/components/common/charts/LineChartComponent';
import BarChartComponent from '@fastgpt/web/components/common/charts/BarChartComponent';
import { theme } from '@fastgpt/web/styles/theme';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { AppLogTimespanEnum, offsetOptions } from '@fastgpt/global/core/app/logs/constants';
import { formatDateByTimespan } from '@fastgpt/global/core/app/logs/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type HeaderControlProps = {
  chatSources: ChatSourceEnum[];
  setChatSources: (value: ChatSourceEnum[]) => void;
  isSelectAllSource: boolean;
  setIsSelectAllSource: React.Dispatch<React.SetStateAction<boolean>>;
  dateRange: DateRangeType;
  setDateRange: (value: DateRangeType) => void;
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

const LogChart = ({
  chatSources,
  setChatSources,
  isSelectAllSource,
  setIsSelectAllSource,
  dateRange,
  setDateRange
}: HeaderControlProps) => {
  const { t } = useTranslation();

  const { appId } = useContextSelector(AppContext, (v) => v);
  const { feConfigs } = useSystemStore();

  const [userTimespan, setUserTimespan] = useState<AppLogTimespanEnum>(AppLogTimespanEnum.day);
  const [chatTimespan, setChatTimespan] = useState<AppLogTimespanEnum>(AppLogTimespanEnum.day);
  const [appTimespan, setAppTimespan] = useState<AppLogTimespanEnum>(AppLogTimespanEnum.day);

  const [offset, setOffset] = useState<string>(offsetOptions[0].value);

  const { data: chartData } = useRequest2(
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
    const user = (() => {
      if (!chartData?.userData || !userTimespan) return [];
      return chartData.userData.map((item) => {
        const { date, xLabel } = formatDateByTimespan(item.timestamp, userTimespan);
        return {
          x: date,
          xLabel,
          userCount: item.summary.userCount,
          newUserCount:
            userTimespan === 'day' && item.summary.retentionUserCount > 0
              ? item.summary.newUserCount - item.summary.retentionUserCount
              : item.summary.newUserCount,
          retentionUserCount: item.summary.retentionUserCount,
          points: item.summary.points,
          sourceCountMap: item.summary.sourceCountMap
        };
      });
    })();

    const chat = (() => {
      if (!chartData?.chatData || !chatTimespan) return [];
      return chartData.chatData.map((item) => {
        const { date, xLabel } = formatDateByTimespan(item.timestamp, chatTimespan);
        const pointsPerChat =
          item.summary.chatCount > 0
            ? Number((item.summary.points / item.summary.chatCount).toFixed(2))
            : 0;
        return {
          x: date,
          xLabel,
          chatItemCount: item.summary.chatItemCount,
          chatCount: item.summary.chatCount,
          pointsPerChat,
          errorCount: item.summary.errorCount,
          errorRate: item.summary.chatItemCount
            ? Number((item.summary.errorCount / item.summary.chatItemCount).toFixed(2))
            : 0
        };
      });
    })();

    const app = (() => {
      if (!chartData?.appData || !appTimespan) return [];
      return chartData.appData.map((item) => {
        const { date, xLabel } = formatDateByTimespan(item.timestamp, appTimespan);
        return {
          x: date,
          xLabel,
          goodFeedBackCount: item.summary.goodFeedBackCount,
          badFeedBackCount: item.summary.badFeedBackCount,
          avgDuration: item.summary.totalResponseTime / item.summary.chatCount
        };
      });
    })();

    const sumValues = (data: Record<string, any>[], key: string) =>
      data.reduce((sum, item) => sum + (item[key] || 0), 0);

    const avgValues = (data: Record<string, any>[], key: string) =>
      data.length > 0 ? data.reduce((sum, item) => sum + (item[key] || 0), 0) / data.length : 0;

    const cumulative = {
      userCount: sumValues(user, 'userCount'),
      points: sumValues(user, 'points'),
      chatItemCount: sumValues(chat, 'chatItemCount'),
      chatCount: sumValues(chat, 'chatCount'),
      pointsPerChat: avgValues(chat, 'pointsPerChat'),
      goodFeedBackCount: sumValues(app, 'goodFeedBackCount'),
      badFeedBackCount: sumValues(app, 'badFeedBackCount'),
      errorCount: sumValues(chat, 'errorCount'),
      errorRate: avgValues(chat, 'errorRate'),
      avgDuration: avgValues(app, 'avgDuration')
    };

    return { user, chat, app, cumulative };
  }, [
    chartData?.userData,
    chartData?.chatData,
    chartData?.appData,
    userTimespan,
    chatTimespan,
    appTimespan
  ]);

  return (
    <Flex flexDir={'column'} h={'full'}>
      <HeaderControl
        chatSources={chatSources}
        setChatSources={setChatSources}
        isSelectAllSource={isSelectAllSource}
        setIsSelectAllSource={setIsSelectAllSource}
        dateRange={dateRange}
        setDateRange={setDateRange}
      />
      <Flex flexDir={'column'} flex={'1 0 0'} h={0} overflowY={'auto'} px={[4, 8]}>
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
                        {t('app:logs_total')}: {formatChartData.cumulative.points}
                      </Flex>
                    }
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
                        color: theme.colors.primary['400']
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
                        {`${t('app:logs_total_avg_duration')}: ${formatChartData.cumulative.avgDuration.toFixed(2)}`}
                      </Flex>
                    }
                  />
                </Box>
              </Grid>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Flex>
    </Flex>
  );
};

export default React.memo(LogChart);

const HeaderControl = ({
  chatSources,
  setChatSources,
  isSelectAllSource,
  setIsSelectAllSource,
  dateRange,
  setDateRange
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
    <Flex
      flexDir={['column', 'row']}
      alignItems={['flex-start', 'center']}
      gap={3}
      pb={2}
      px={[4, 8]}
    >
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
  const { data: totalData } = useRequest2(
    async () => {
      return getAppTotalData({ appId });
    },
    {
      manual: !feConfigs?.isPlus,
      refreshDeps: [appId]
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
        value: totalData?.totalUsers || 0
      },
      {
        label: t('app:logs_total_chat'),
        icon: 'core/chat/chatLight',
        colorSchema: {
          icon: 'green.600',
          border: 'green.200',
          bg: 'green.50'
        },
        value: totalData?.totalChats || 0
      },
      {
        label: t('app:logs_total_points'),
        icon: 'support/bill/payRecordLight',
        colorSchema: {
          icon: 'yellow.600',
          border: 'yellow.200',
          bg: 'yellow.50'
        },
        value: totalData?.totalPoints || 0
      }
    ];
  }, [totalData]);

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
              <Box fontSize={'28px'} fontWeight={'medium'} color={'myGray.900'}>
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
