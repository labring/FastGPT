import type { BoxProps } from '@chakra-ui/react';
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
import { getAppChartDataV2, getAppTotalDataV2 } from '@/web/core/app/api/log';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { addDays } from 'date-fns';
import dayjs from 'dayjs';
import LineChartComponent from '@fastgpt/web/components/common/charts/LineChartComponent';
import BarChartComponent from '@fastgpt/web/components/common/charts/BarChartComponent';
import { theme } from '@fastgpt/web/styles/theme';
import MySelect from '@fastgpt/web/components/common/MySelect';

enum TimespanEnum {
  day = 'day',
  week = 'week',
  month = 'month',
  quarter = 'quarter'
}

const ChartsBoxStyles: BoxProps = {
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
}: {
  chatSources: ChatSourceEnum[];
  setChatSources: (value: ChatSourceEnum[]) => void;
  isSelectAllSource: boolean;
  setIsSelectAllSource: React.Dispatch<React.SetStateAction<boolean>>;
  dateRange: DateRangeType;
  setDateRange: (value: DateRangeType) => void;
}) => {
  const { t } = useTranslation();

  const { appId } = useContextSelector(AppContext, (v) => v);

  const [userTimespan, setUserTimespan] = useState<TimespanEnum>(TimespanEnum.day);
  const [chatTimespan, setChatTimespan] = useState<TimespanEnum>(TimespanEnum.day);
  const [appTimespan, setAppTimespan] = useState<TimespanEnum>(TimespanEnum.day);

  const sourceList = useMemo(
    () =>
      Object.entries(ChatSourceMap).map(([key, value]) => ({
        label: t(value.name as any),
        value: key as ChatSourceEnum
      })),
    [t]
  );

  const { data: totalData } = useRequest2(
    async () => {
      return getAppTotalDataV2({ appId });
    },
    {
      manual: false,
      refreshDeps: [appId]
    }
  );
  const totalDataArray = useMemo(() => {
    if (!totalData) return [];

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
        value: totalData.totalChat
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
  }, [totalData]);

  const { data: chartData } = useRequest2(
    async () => {
      return getAppChartDataV2({
        appId,
        dateStart: dateRange.from || new Date(),
        dateEnd: addDays(dateRange.to || new Date(), 1),

        offsetDays: 1,
        userTimespan,
        chatTimespan,
        appTimespan
      });
    },
    {
      manual: false,
      refreshDeps: [appId, dateRange.from, dateRange.to, userTimespan, chatTimespan, appTimespan]
    }
  );
  console.log('chartData', chartData);

  const formatedChartData = useMemo(() => {
    if (!chartData) return [];
    console.log(chartData);

    return chartData.list.map((item) => {
      const dateFormat = 'MM-DD';
      const date = dayjs(item.timestamp * 1000).format(dateFormat);
      const xLabel = dayjs(item.timestamp * 1000).format('YYYY-MM-DD');
      return {
        x: date,
        xLabel,
        userCount: item.summary.userCount,
        newUserCount: item.summary.newUserCount - item.summary.retentionUserCount,
        retentionUserCount: item.summary.retentionUserCount,
        points: item.summary.points,
        // sourceCountMap

        chatItemCount: item.summary.chatItemCount,
        chatCount: item.summary.chatCount,
        errorRate: item.summary.chatItemCount
          ? Number((item.summary.errorCount / item.summary.chatItemCount).toFixed(2))
          : 0,
        pointsPerChat: item.summary.chatCount
          ? Number((item.summary.points / item.summary.chatCount).toFixed(2))
          : 0,

        goodFeedBackCount: item.summary.goodFeedBackCount,
        badFeedBackCount: item.summary.badFeedBackCount,
        avgDuration: item.summary.chatCount
          ? Number((item.summary.totalResponseTime / item.summary.chatCount).toFixed(2))
          : 0,
        sourceCountMap: item.summary.sourceCountMap
      };
    });
  }, [chartData]);

  // 计算累计值
  const cumulativeValues = useMemo(() => {
    if (!formatedChartData.length) return {};

    return {
      userCount: formatedChartData.reduce((sum, item) => sum + item.userCount, 0),
      points: formatedChartData.reduce((sum, item) => sum + item.points, 0),
      chatItemCount: formatedChartData.reduce((sum, item) => sum + item.chatItemCount, 0),
      chatCount: formatedChartData.reduce((sum, item) => sum + item.chatCount, 0),
      goodFeedBackCount: formatedChartData.reduce((sum, item) => sum + item.goodFeedBackCount, 0),
      badFeedBackCount: formatedChartData.reduce((sum, item) => sum + item.badFeedBackCount, 0),

      errorRate:
        formatedChartData.reduce((sum, item) => sum + item.errorRate, 0) / formatedChartData.length,
      pointsPerChat:
        formatedChartData.reduce((sum, item) => sum + item.pointsPerChat, 0) /
        formatedChartData.length,
      avgDuration:
        formatedChartData.reduce((sum, item) => sum + item.avgDuration, 0) /
        formatedChartData.length
    };
  }, [formatedChartData]);
  console.log('formatedChartData', formatedChartData);

  return (
    <Flex flexDir={'column'} h={'full'}>
      {/* header */}
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

      <Flex flexDir={'column'} flex={'1 0 0'} h={0} overflowY={'auto'} px={[4, 8]}>
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

        {/* chart */}
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
                list={[
                  { label: t('app:logs_timespan_day'), value: TimespanEnum.day },
                  { label: t('app:logs_timespan_week'), value: TimespanEnum.week },
                  { label: t('app:logs_timespan_month'), value: TimespanEnum.month },
                  { label: t('app:logs_timespan_quarter'), value: TimespanEnum.quarter }
                ]}
                value={userTimespan}
                onChange={(value) => {
                  setUserTimespan(value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </AccordionButton>
            <AccordionPanel py={0}>
              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        累计：{cumulativeValues.userCount?.toLocaleString() || 0}
                      </Flex>
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <BarChartComponent
                    data={formatedChartData}
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
                        list={[
                          { label: 'T+1', value: '1' },
                          { label: 'T+3', value: '3' },
                          { label: 'T+7', value: '7' },
                          { label: 'T+14', value: '14' }
                        ]}
                        size={'sm'}
                        value={'1'}
                        onSelect={(value) => {
                          console.log(value);
                        }}
                      />
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        累计：{cumulativeValues.points?.toLocaleString() || 0}
                      </Flex>
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                    HeaderRightChildren={
                      <Flex>
                        <MultipleSelect
                          list={chatSources.map((item) => ({
                            label: t(ChatSourceMap[item].name as any),
                            value: item
                          }))}
                          value={[]}
                          onSelect={(value) => {
                            console.log(value);
                          }}
                          isSelectAll={true}
                          setIsSelectAll={() => {}}
                        />
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
              {t('app:logs_chat_data')}
              <Flex flex={1} />
              <MySelect
                list={[
                  { label: t('app:logs_timespan_day'), value: TimespanEnum.day },
                  { label: t('app:logs_timespan_week'), value: TimespanEnum.week },
                  { label: t('app:logs_timespan_month'), value: TimespanEnum.month },
                  { label: t('app:logs_timespan_quarter'), value: TimespanEnum.quarter }
                ]}
                value={userTimespan}
                onChange={(value) => {
                  setUserTimespan(value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </AccordionButton>
            <AccordionPanel py={0}>
              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        累计：{cumulativeValues.chatItemCount?.toLocaleString() || 0}
                      </Flex>
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                    HeaderRightChildren={
                      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
                        累计：{cumulativeValues.chatCount?.toLocaleString() || 0}
                      </Flex>
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                        累计：{cumulativeValues.errorRate?.toFixed(2) || 0}
                      </Flex>
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                        累计：{cumulativeValues.pointsPerChat?.toFixed(2) || 0}
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
                list={[
                  { label: t('app:logs_timespan_day'), value: TimespanEnum.day },
                  { label: t('app:logs_timespan_week'), value: TimespanEnum.week },
                  { label: t('app:logs_timespan_month'), value: TimespanEnum.month },
                  { label: t('app:logs_timespan_quarter'), value: TimespanEnum.quarter }
                ]}
                value={userTimespan}
                onChange={(value) => {
                  setUserTimespan(value);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            </AccordionButton>
            <AccordionPanel py={0}>
              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                        累计：好评 {cumulativeValues.goodFeedBackCount?.toLocaleString() || 0} /
                        差评 {cumulativeValues.badFeedBackCount?.toLocaleString() || 0}
                      </Flex>
                    }
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={formatedChartData}
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
                        累计：{cumulativeValues.avgDuration?.toFixed(2) || 0}
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
