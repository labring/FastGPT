import React, { useMemo, useState } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Grid, HStack, useTheme } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { addDays } from 'date-fns';
import dayjs from 'dayjs';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getChannelList, getDashboardV2 } from '@/web/core/ai/channel';
import { getSystemModelList } from '@/web/core/ai/config';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import LineChartComponent from './LineChartComponent';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import DataTableComponent from './DataTableComponent';

export type ModelDashboardData = {
  x: string;
  totalCalls: number;
  errorCalls: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  avgResponseTime: number;
  avgTtfb: number;
  maxRpm: number;
  maxTpm: number;
};

const ChartsBoxStyles: BoxProps = {
  px: 5,
  pt: 4,
  pb: 8,
  h: '300px',
  border: 'base',
  borderRadius: 'md',
  overflow: 'hidden'
};

// Default date range: Past 7 days
const getDefaultDateRange = (): DateRangeType => {
  const from = addDays(new Date(), -7);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setHours(23, 59, 59, 999);

  return { from, to };
};

const calculateTimeDiffs = (from: Date, to: Date) => {
  const startDate = dayjs(from);
  const endDate = dayjs(to);
  return {
    daysDiff: endDate.diff(startDate, 'day'),
    hoursDiff: endDate.diff(startDate, 'hour')
  };
};

const getTimespanConfig = (daysDiff: number, hoursDiff: number) => {
  const options = [];
  if (daysDiff < 1) {
    options.push('minute' as const);
  }
  if (daysDiff <= 30) {
    options.push('hour' as const);
  }
  options.push('day' as const);

  let defaultTimespan: 'minute' | 'hour' | 'day';
  if (hoursDiff < 6) {
    defaultTimespan = 'minute';
  } else if (daysDiff <= 30) {
    defaultTimespan = 'hour';
  } else {
    defaultTimespan = 'day';
  }

  return { options, defaultTimespan };
};

const ModelDashboard = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { feConfigs } = useSystemStore();

  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [userHasManuallySelectedTimespan, setUserHasManuallySelectedTimespan] = useState(false);

  // view detail handler
  const handleViewDetail = (model: string) => {
    setFilterProps({
      ...filterProps,
      model
    });
    setViewMode('chart');
  };

  const [filterProps, setFilterProps] = useState<{
    channelId?: string;
    model?: string;
    dateRange: DateRangeType;
    timespan?: 'minute' | 'hour' | 'day';
  }>({
    channelId: undefined,
    model: undefined,
    timespan: 'day',
    dateRange: getDefaultDateRange()
  });

  // Fetch channel list with "All" option
  // Fetch channel list with "All" option
  const { data: channelList = [] } = useRequest2(
    async () => {
      const res = await getChannelList().then((res) =>
        res.map((item) => ({
          label: item.name,
          value: `${item.id}`
        }))
      );
      return [
        {
          label: t('common:All'),
          value: ''
        },
        ...res
      ];
    },
    {
      manual: false
    }
  );

  // Get model list filtered by selected channel
  const { data: systemModelList = [] } = useRequest2(getSystemModelList, {
    manual: false
  });
  const modelList = useMemo(() => {
    const res = systemModelList
      .map((item) => {
        const provider = getModelProvider(item.provider);
        return {
          order: provider.order,
          icon: provider.avatar,
          label: item.model,
          value: item.model
        };
      })
      .sort((a, b) => a.order - b.order);
    return [
      {
        label: t('common:All'),
        value: ''
      },
      ...res
    ];
  }, [systemModelList, t]);

  const timespanConfig = useMemo(() => {
    if (!filterProps.dateRange.from || !filterProps.dateRange.to) {
      return { options: [], defaultTimespan: 'day' as const };
    }

    const { daysDiff, hoursDiff } = calculateTimeDiffs(
      filterProps.dateRange.from,
      filterProps.dateRange.to
    );

    const { options, defaultTimespan } = getTimespanConfig(daysDiff, hoursDiff);

    return {
      options: options.map((value) => {
        const labelKey = (() => {
          if (value === 'minute') {
            return 'account_model:timespan_minute';
          } else if (value === 'hour') {
            return 'account_model:timespan_hour';
          } else {
            return 'account_model:timespan_day';
          }
        })();

        return {
          label: t(labelKey as any) as React.ReactNode,
          value: value as 'minute' | 'hour' | 'day'
        };
      }),
      defaultTimespan
    };
  }, [filterProps.dateRange, t]);

  const { options: timespanOptions, defaultTimespan: getDefaultTimespan } = timespanConfig;

  // Handle date range change with automatic timespan adjustment
  const handleDateRangeChange = (dateRange: DateRangeType) => {
    const newFilterProps = { ...filterProps, dateRange };

    if (dateRange.from && dateRange.to) {
      const { daysDiff, hoursDiff } = calculateTimeDiffs(dateRange.from, dateRange.to);
      const { options: newTimespanOptions, defaultTimespan: newDefaultTimespan } =
        getTimespanConfig(daysDiff, hoursDiff);

      const isCurrentTimespanAvailable = newTimespanOptions.includes(filterProps.timespan || 'day');

      if (!isCurrentTimespanAvailable) {
        // Current timespan not available, switch to best available
        const targetTimespan = (
          newTimespanOptions.includes(newDefaultTimespan)
            ? newDefaultTimespan
            : newTimespanOptions[0] || 'day'
        ) as 'minute' | 'hour' | 'day';
        newFilterProps.timespan = targetTimespan;
        setUserHasManuallySelectedTimespan(false);
      } else if (
        !userHasManuallySelectedTimespan &&
        newTimespanOptions.includes(newDefaultTimespan)
      ) {
        newFilterProps.timespan = newDefaultTimespan;
      }
    }

    setFilterProps(newFilterProps);
  };

  // Fetch dashboard data with date range and channel filters
  const { data: dashboardData = [], loading: isLoading } = useRequest2(
    async () => {
      const params = {
        channel: filterProps.channelId ? parseInt(filterProps.channelId) : 0,
        start_timestamp: filterProps.dateRange.from
          ? Math.floor(filterProps.dateRange.from.getTime())
          : undefined,
        end_timestamp: filterProps.dateRange.to
          ? Math.floor(filterProps.dateRange.to.getTime())
          : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timespan: filterProps.timespan || 'day'
      };

      let data = await getDashboardV2(params);

      if (filterProps.model) {
        data = data.map((item) => {
          const filterModels = item.summary.filter((model) => model.model === filterProps.model);
          return {
            ...item,
            summary: filterModels
          };
        });
      }

      // Auto-fill missing periods based on timespan
      if (filterProps.dateRange.from && filterProps.dateRange.to) {
        const startDate = dayjs(filterProps.dateRange.from);
        const endDate = dayjs(filterProps.dateRange.to);
        const timespan = filterProps.timespan || 'day';

        const { periodCount, periodUnit, formatString } = (() => {
          if (timespan === 'minute') {
            return {
              periodCount: endDate.diff(startDate, 'minute') + 1,
              periodUnit: 'minute' as dayjs.ManipulateType,
              formatString: 'YYYY-MM-DD HH:mm'
            };
          } else if (timespan === 'hour') {
            return {
              periodCount: endDate.diff(startDate, 'hour') + 1,
              periodUnit: 'hour' as dayjs.ManipulateType,
              formatString: 'YYYY-MM-DD HH'
            };
          } else {
            return {
              periodCount: endDate.diff(startDate, 'day') + 1,
              periodUnit: 'day' as dayjs.ManipulateType,
              formatString: 'YYYY-MM-DD'
            };
          }
        })();

        // Create complete period list
        const completePeriodList = Array.from({ length: periodCount }, (_, i) =>
          startDate.add(i, periodUnit)
        );

        // Create a map of existing data by timestamp
        const existingDataMap = new Map(
          data.map((item) => [dayjs(item.timestamp * 1000).format(formatString), item])
        );

        // Fill missing periods with empty data
        const completeData = completePeriodList.map((period) => {
          const periodKey = period.format(formatString);
          const existingItem = existingDataMap.get(periodKey);

          if (existingItem) {
            return existingItem;
          } else {
            // Create empty data structure for missing periods
            return {
              timestamp: Math.floor(period.valueOf() / 1000),
              summary: []
            };
          }
        });

        data = completeData;
      }

      return data;
    },
    {
      manual: false,
      refreshDeps: [
        filterProps.channelId,
        filterProps.dateRange,
        filterProps.model,
        filterProps.timespan
      ]
    }
  );

  // Process chart data - aggregate model calls, token usage and cost data based on timespan
  const chartData: ModelDashboardData[] = useMemo(() => {
    if (dashboardData.length === 0) {
      return [];
    }

    // Model price map
    const modelPriceMap = new Map<
      string,
      {
        inputPrice?: number;
        outputPrice?: number;
        charsPointsPrice?: number;
      }
    >();
    systemModelList.forEach((model) => {
      modelPriceMap.set(model.model, {
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        charsPointsPrice: model.charsPointsPrice
      });
    });

    return dashboardData.map((item) => {
      // Format date based on timespan
      const dateFormat = (() => {
        if (filterProps.timespan === 'minute') {
          return 'MM-DD HH:mm';
        } else if (filterProps.timespan === 'hour') {
          return 'MM-DD HH:00';
        } else {
          return 'MM-DD';
        }
      })();

      const date = dayjs(item.timestamp * 1000).format(dateFormat);
      const summary = item.summary || [];
      const totalCalls = summary.reduce((acc, model) => acc + (model.request_count || 0), 0);
      const errorCalls = summary.reduce((acc, model) => acc + (model.exception_count || 0), 0);
      const errorRate = totalCalls === 0 ? 0 : Number((errorCalls / totalCalls).toFixed(2));

      const inputTokens = summary.reduce((acc, model) => acc + (model.input_tokens || 0), 0);
      const outputTokens = summary.reduce((acc, model) => acc + (model?.output_tokens || 0), 0);
      const totalTokens = summary.reduce((acc, model) => acc + (model.total_tokens || 0), 0);

      const avgResponseTime =
        summary.length > 0
          ? summary.reduce((acc, model) => acc + (model.total_time_milliseconds || 0), 0) /
            summary.length /
            1000
          : 0;
      const avgTtfb =
        summary.length > 0
          ? summary.reduce((acc, model) => acc + (model.total_ttfb_milliseconds || 0), 0) /
            summary.length /
            1000
          : 0;

      const maxRpm = filterProps.model
        ? summary.reduce((acc, model) => Math.max(acc, model.max_rpm || 0), 0)
        : 0;
      const maxTpm = filterProps.model
        ? summary.reduce((acc, model) => Math.max(acc, model.max_tpm || 0), 0)
        : 0;

      const totalCost = summary.reduce((acc, model) => {
        const modelPricing = modelPriceMap.get(model.model);

        if (modelPricing) {
          const inputTokens = model.input_tokens || 0;
          const outputTokens = model.output_tokens || 0;
          const isIOPriceType =
            typeof modelPricing.inputPrice === 'number' && modelPricing.inputPrice > 0;

          const totalPoints = isIOPriceType
            ? (modelPricing.inputPrice || 0) * (inputTokens / 1000) +
              (modelPricing.outputPrice || 0) * (outputTokens / 1000)
            : ((modelPricing.charsPointsPrice || 0) * (inputTokens + outputTokens)) / 1000;

          return acc + totalPoints;
        }

        return acc;
      }, 0);

      return {
        x: date,
        totalCalls,
        errorCalls,
        errorRate,
        inputTokens,
        outputTokens,
        totalTokens,
        totalCost,
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        avgTtfb: Math.round(avgTtfb * 100) / 100,
        maxRpm,
        maxTpm
      };
    });
  }, [dashboardData, systemModelList, filterProps.timespan]);

  const [tokensUsageType, setTokensUsageType] = useState<
    'inputTokens' | 'outputTokens' | 'totalTokens'
  >('totalTokens');

  return (
    <>
      <Box>{Tab}</Box>

      <HStack spacing={4} justifyContent="space-between">
        <HStack spacing={4}>
          <HStack>
            <FormLabel>{t('common:user.Time')}</FormLabel>
            <Box>
              <DateRangePicker
                defaultDate={filterProps.dateRange}
                dateRange={filterProps.dateRange}
                position="bottom"
                onSuccess={handleDateRangeChange}
              />
            </Box>
          </HStack>
          <HStack>
            <FormLabel>{t('account_model:channel_name')}</FormLabel>
            <Box flex={'1 0 0'}>
              <MySelect<string>
                bg={'myGray.50'}
                isSearch
                list={channelList}
                placeholder={t('account_model:select_channel')}
                value={filterProps.channelId}
                onChange={(val) => setFilterProps({ ...filterProps, channelId: val })}
              />
            </Box>
          </HStack>
          <HStack>
            <FormLabel>{t('account_model:model_name')}</FormLabel>
            <Box flex={'1 0 0'}>
              <MySelect<string>
                bg={'myGray.50'}
                isSearch
                list={modelList}
                placeholder={t('account_model:select_model')}
                value={filterProps.model}
                onChange={(val) => setFilterProps({ ...filterProps, model: val })}
              />
            </Box>
          </HStack>
          <HStack>
            <FormLabel>{t('account_model:timespan_label')}</FormLabel>
            <Box flex={'1 0 0'}>
              <MySelect<'minute' | 'hour' | 'day'>
                bg={'myGray.50'}
                list={timespanOptions}
                value={filterProps.timespan}
                onChange={(val) => {
                  setFilterProps({ ...filterProps, timespan: val });
                  setUserHasManuallySelectedTimespan(true);
                }}
              />
            </Box>
          </HStack>
        </HStack>

        <FillRowTabs<'chart' | 'table'>
          list={[
            {
              label: t('account_model:view_chart'),
              value: 'chart'
            },
            {
              label: t('account_model:view_table'),
              value: 'table'
            }
          ]}
          py={1.5}
          px={4}
          value={viewMode}
          onChange={(val) => setViewMode(val)}
        />
      </HStack>

      <MyBox flex={'1 0 0'} h={0} overflowY={'auto'} isLoading={isLoading}>
        {viewMode === 'chart' ? (
          dashboardData &&
          dashboardData.length > 0 && (
            <>
              <Box {...ChartsBoxStyles}>
                <LineChartComponent
                  data={chartData}
                  title={t('account_model:model_request_times')}
                  enableCumulative={true}
                  lines={[
                    {
                      dataKey: 'totalCalls',
                      name: t('account_model:model_request_times'),
                      color: theme.colors.primary['600']
                    }
                  ]}
                  tooltipItems={[
                    {
                      label: t('account_model:model_request_times'),
                      dataKey: 'totalCalls',
                      color: theme.colors.primary['600']
                    }
                  ]}
                />
              </Box>

              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={t('account_model:model_error_request_times')}
                    enableCumulative={false}
                    lines={[
                      {
                        dataKey: 'errorCalls',
                        name: t('account_model:model_error_request_times'),
                        color: '#f98e1a'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:model_error_request_times'),
                        dataKey: 'errorCalls',
                        color: '#f98e1a'
                      }
                    ]}
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={t('account_model:model_error_rate')}
                    enableCumulative={false}
                    lines={[
                      {
                        dataKey: 'errorRate',
                        name: t('account_model:model_error_rate'),
                        color: '#e84738'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:model_error_rate'),
                        dataKey: 'errorRate',
                        color: '#e84738'
                      }
                    ]}
                  />
                </Box>
              </Grid>

              <Box mt={5} {...ChartsBoxStyles}>
                <LineChartComponent
                  data={chartData}
                  title={t('account_model:dashboard_token_usage')}
                  enableCumulative={true}
                  lines={[
                    {
                      dataKey: tokensUsageType,
                      name: t('account_model:dashboard_token_usage'),
                      color: theme.colors.primary['600']
                    }
                  ]}
                  tooltipItems={[
                    {
                      label: t('account_model:dashboard_token_usage'),
                      dataKey: tokensUsageType,
                      color: theme.colors.primary['600']
                    }
                  ]}
                  HeaderLeftChildren={
                    <FillRowTabs<'inputTokens' | 'outputTokens' | 'totalTokens'>
                      list={[
                        {
                          label: t('account_model:all'),
                          value: 'totalTokens'
                        },
                        {
                          label: t('account_model:input'),
                          value: 'inputTokens'
                        },
                        {
                          label: t('account_model:output'),
                          value: 'outputTokens'
                        }
                      ]}
                      py={0.5}
                      px={2}
                      value={tokensUsageType}
                      onChange={(val) => setTokensUsageType(val)}
                    />
                  }
                />
              </Box>

              {feConfigs?.isPlus && (
                <Box mt={5} {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={t('account_model:aipoint_usage')}
                    enableCumulative={true}
                    lines={[
                      {
                        dataKey: 'totalCost',
                        name: t('account_model:aipoint_usage'),
                        color: '#8774EE'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:aipoint_usage'),
                        dataKey: 'totalCost',
                        color: '#8774EE'
                      }
                    ]}
                  />
                </Box>
              )}

              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={t('account_model:avg_response_time')}
                    enableCumulative={false}
                    lines={[
                      {
                        dataKey: 'avgResponseTime',
                        name: t('account_model:avg_response_time'),
                        color: '#36B37E'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:avg_response_time'),
                        dataKey: 'avgResponseTime',
                        color: '#36B37E',
                        formatter: (value: number) => `${value.toFixed(2)}s`
                      }
                    ]}
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={t('account_model:avg_ttfb')}
                    enableCumulative={false}
                    lines={[
                      {
                        dataKey: 'avgTtfb',
                        name: t('account_model:avg_ttfb'),
                        color: '#FF5630'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:avg_ttfb'),
                        dataKey: 'avgTtfb',
                        color: '#FF5630',
                        formatter: (value: number) => `${value.toFixed(2)}s`
                      }
                    ]}
                  />
                </Box>
              </Grid>

              <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={`${t('account_model:max_rpm')}${!filterProps.model ? t('account_model:select_single_model_tip') : ''}`}
                    enableCumulative={false}
                    lines={[
                      {
                        dataKey: 'maxRpm',
                        name: t('account_model:max_rpm'),
                        color: '#6554C0'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:max_rpm'),
                        dataKey: 'maxRpm',
                        color: '#6554C0'
                      }
                    ]}
                  />
                </Box>
                <Box {...ChartsBoxStyles}>
                  <LineChartComponent
                    data={chartData}
                    title={`${t('account_model:max_tpm')}${!filterProps.model ? t('account_model:select_single_model_tip') : ''}`}
                    enableCumulative={false}
                    lines={[
                      {
                        dataKey: 'maxTpm',
                        name: t('account_model:max_tpm'),
                        color: '#FF8B00'
                      }
                    ]}
                    tooltipItems={[
                      {
                        label: t('account_model:max_tpm'),
                        dataKey: 'maxTpm',
                        color: '#FF8B00'
                      }
                    ]}
                  />
                </Box>
              </Grid>
            </>
          )
        ) : (
          <DataTableComponent
            data={dashboardData}
            filterProps={filterProps}
            systemModelList={systemModelList}
            onViewDetail={handleViewDetail}
          />
        )}
      </MyBox>
    </>
  );
};

export default React.memo(ModelDashboard);
