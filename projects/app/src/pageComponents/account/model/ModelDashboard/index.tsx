import React, { useMemo, useState } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Grid, HStack, useTheme } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { addHours } from 'date-fns';
import dayjs from 'dayjs';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getChannelList, getDashboardV2 } from '@/web/core/ai/channel';
import { getSystemModelList } from '@/web/core/ai/config';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';
import LineChartComponent from '@fastgpt/web/components/common/charts/LineChartComponent';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import DataTableComponent from './DataTableComponent';

export type ModelDashboardData = {
  x: string;
  xLabel?: string;
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
  const from = addHours(new Date(), -24);
  from.setMinutes(0, 0, 0); // Set minutes to 0

  const to = addHours(new Date(), 1);
  to.setMinutes(0, 0, 0); // Set minutes to 0

  return { from, to };
};

const ModelDashboard = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { feConfigs } = useSystemStore();

  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

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
    timespan: 'minute' | 'hour' | 'day';
  }>({
    channelId: undefined,
    model: undefined,
    timespan: 'hour',
    dateRange: getDefaultDateRange()
  });

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
  // Model price map
  const modelPriceMap = useMemo(() => {
    const map = new Map<
      string,
      {
        inputPrice?: number;
        outputPrice?: number;
        charsPointsPrice?: number;
      }
    >();
    systemModelList.forEach((model) => {
      map.set(model.model, {
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        charsPointsPrice: model.charsPointsPrice
      });
    });
    return map;
  }, [systemModelList]);

  const computeTimespan = (hoursDiff: number) => {
    const options: { label: string; value: 'minute' | 'hour' | 'day' }[] = [];
    if (hoursDiff <= 1 * 24) {
      options.push({ label: t('account_model:timespan_minute'), value: 'minute' });
    }
    if (hoursDiff < 7 * 24) {
      options.push({ label: t('account_model:timespan_hour'), value: 'hour' });
    }
    if (hoursDiff >= 1 * 24) {
      options.push({ label: t('account_model:timespan_day'), value: 'day' });
    }

    const defaultTimespan: 'minute' | 'hour' | 'day' = (() => {
      if (hoursDiff < 1) {
        return 'minute';
      } else if (hoursDiff < 2 * 24) {
        return 'hour';
      } else {
        return 'day';
      }
    })();

    return { options, defaultTimespan };
  };
  const [timespanOptions, setTimespanOptions] = useState(computeTimespan(48).options);

  // Handle date range change with automatic timespan adjustment
  const handleDateRangeChange = (dateRange: DateRangeType) => {
    const newFilterProps = { ...filterProps, dateRange };

    // Computed timespan
    if (dateRange.from && dateRange.to) {
      const hoursDiff = dayjs(dateRange.to).diff(dayjs(dateRange.from), 'hour');
      const { options: newTimespanOptions, defaultTimespan: newDefaultTimespan } =
        computeTimespan(hoursDiff);

      setTimespanOptions(newTimespanOptions);
      newFilterProps.timespan = newDefaultTimespan;
    }

    setFilterProps(newFilterProps);
  };

  // Fetch dashboard data with date range and channel filters
  const { data: dashboardData = [], loading: isLoading } = useRequest2(
    async () => {
      const params = {
        channel: filterProps.channelId ? parseInt(filterProps.channelId) : undefined,
        model: filterProps.model,
        start_timestamp: filterProps.dateRange.from
          ? Math.floor(filterProps.dateRange.from.getTime())
          : undefined,
        end_timestamp: filterProps.dateRange.to
          ? Math.floor(filterProps.dateRange.to.getTime())
          : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timespan: filterProps.timespan
      };

      const data = await getDashboardV2(params);

      // Auto-fill missing periods based on timespan
      const startDate = dayjs(filterProps.dateRange.from);
      const currentTime = dayjs();
      const endDate = dayjs(filterProps.dateRange.to).isBefore(currentTime)
        ? dayjs(filterProps.dateRange.to)
        : currentTime;
      const timespan = filterProps.timespan;

      const { periodCount } = (() => {
        if (timespan === 'minute') {
          return {
            periodCount: endDate.diff(startDate, 'minute') + 1
          };
        } else if (timespan === 'hour') {
          return {
            periodCount: endDate.diff(startDate, 'hour') + 1
          };
        } else {
          return {
            periodCount: endDate.diff(startDate, 'day') + 1
          };
        }
      })();

      // Create complete period list
      const completePeriodList = Array.from({ length: periodCount }, (_, i) =>
        startDate.add(i, timespan)
      );

      // Create a map of existing data by timestamp
      const existingDataMap = new Map(
        data.map((item) => [dayjs(item.timestamp * 1000).format('YYYY-MM-DD HH:mm'), item])
      );

      // Fill missing periods with empty data
      return completePeriodList.map((period) => {
        const periodKey = period.format('YYYY-MM-DD HH:mm');
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

    return dashboardData.map((item) => {
      // Format date based on timespan
      const dateFormat = (() => {
        if (filterProps.timespan === 'minute') {
          return 'HH:mm';
        } else if (filterProps.timespan === 'hour') {
          return 'HH:00';
        } else {
          return 'MM-DD';
        }
      })();

      const date = dayjs(item.timestamp * 1000).format(dateFormat);
      const xLabel = dayjs(item.timestamp * 1000).format('YYYY-MM-DD HH:mm');
      const summary = item.summary || [];
      const totalCalls = summary.reduce((acc, model) => acc + (model.request_count || 0), 0);
      const errorCalls = summary.reduce((acc, model) => acc + (model.exception_count || 0), 0);
      const errorRate = totalCalls === 0 ? 0 : Number((errorCalls / totalCalls).toFixed(2));

      const inputTokens = summary.reduce((acc, model) => acc + (model.input_tokens || 0), 0);
      const outputTokens = summary.reduce((acc, model) => acc + (model?.output_tokens || 0), 0);
      const totalTokens = summary.reduce((acc, model) => acc + (model.total_tokens || 0), 0);

      const successCalls = totalCalls - errorCalls;
      const avgResponseTime = successCalls
        ? summary.reduce((acc, model) => acc + (model.total_time_milliseconds || 0), 0) /
          successCalls /
          1000
        : 0;
      const avgTtfb = successCalls
        ? summary.reduce((acc, model) => acc + (model.total_ttfb_milliseconds || 0), 0) /
          successCalls /
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
        xLabel: xLabel,
        totalCalls,
        errorCalls,
        errorRate,
        inputTokens,
        outputTokens,
        totalTokens,
        totalCost: Math.floor(totalCost),
        avgResponseTime: Math.round(avgResponseTime * 100) / 100,
        avgTtfb: Math.round(avgTtfb * 100) / 100,
        maxRpm,
        maxTpm
      };
    });
  }, [dashboardData, filterProps.model, filterProps.timespan, modelPriceMap]);

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
          {viewMode === 'chart' && (
            <HStack>
              <FormLabel>{t('account_model:timespan_label')}</FormLabel>
              <Box flex={'1 0 0'}>
                <MySelect<'minute' | 'hour' | 'day'>
                  bg={'myGray.50'}
                  list={timespanOptions}
                  value={filterProps.timespan}
                  onChange={(val) => {
                    setFilterProps({ ...filterProps, timespan: val });
                  }}
                />
              </Box>
            </HStack>
          )}
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

              {filterProps?.model && (
                <Grid mt={5} gridTemplateColumns={['1fr', '1fr 1fr']} gap={5}>
                  <Box {...ChartsBoxStyles}>
                    <LineChartComponent
                      data={chartData}
                      title={t('account_model:max_rpm')}
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
                      title={t('account_model:max_tpm')}
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
              )}
            </>
          )
        ) : (
          <DataTableComponent
            data={dashboardData}
            filterProps={filterProps}
            channelList={channelList}
            modelPriceMap={modelPriceMap}
            onViewDetail={handleViewDetail}
          />
        )}
      </MyBox>
    </>
  );
};

export default React.memo(ModelDashboard);
