import React, { useMemo, useState } from 'react';
import { Box, Flex, HStack, useTheme } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
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

export type ModelUsageData = {
  model: string;
  request_count: number;
  used_amount: number;
  exception_count: number;
  input_tokens: number;
  output_tokens?: number;
  total_tokens: number;
};

export type DashboardDataEntry = {
  timestamp: number;
  models: Array<ModelUsageData>;
};

export type ModelDashboardData = {
  date: string;
  successCalls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
};

// Displays model usage statistics, token consumption and cost visualization
const ModelDashboard = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [filterProps, setFilterProps] = useState<{
    channelId?: string;
    model?: string;
    dateRange: DateRangeType;
  }>({
    channelId: undefined,
    model: undefined,
    dateRange: {
      from: (() => {
        const today = addDays(new Date(), -7);
        today.setHours(0, 0, 0, 0);
        return today;
      })(),
      to: (() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return today;
      })()
    }
  });

  // Fetch channel list with "All" option
  const { data: channelList = [] } = useRequest2(
    async () => {
      const res = await getChannelList().then((res) =>
        res.map((item) => ({
          label: item.name,
          value: `${item.id}`,
          models: item.models || []
        }))
      );
      return [
        {
          label: t('common:All'),
          value: undefined,
          models: [] as string[]
        },
        ...res
      ];
    },
    {
      manual: false
    }
  );

  // Get model list filtered by selected channel
  const { data: modelList = [] } = useRequest2(
    async () => {
      const systemModelList = await getSystemModelList();

      const formatModelList = () => {
        if (filterProps.channelId) {
          const selectedChannel = channelList.find(
            (channel) => channel.value === filterProps.channelId
          );
          if (selectedChannel && selectedChannel.models.length > 0) {
            const channelModels = systemModelList
              .filter((item) => selectedChannel.models.includes(item.model))
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
                value: undefined
              },
              ...channelModels
            ];
          }
        }

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
            value: undefined
          },
          ...res
        ];
      };

      return formatModelList();
    },
    {
      manual: false,
      refreshDeps: [filterProps.channelId, channelList, t]
    }
  );

  // Fetch dashboard data with date range and channel filters
  const { data: dashboardData, loading: isLoading } = useRequest2(
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
        timespan: 'day' as const
      };

      const result = await getDashboardV2(params);

      if (result && Array.isArray(result)) {
        return result;
      }

      return [];
    },
    {
      manual: false,
      refreshDeps: [filterProps.channelId, filterProps.dateRange]
    }
  );

  // Get system model list for price calculation
  const { data: systemModelList = [] } = useRequest2(getSystemModelList, {
    manual: false
  });

  // Process chart data - aggregate daily model calls, token usage and cost data
  const chartData = useMemo(() => {
    if (!dashboardData || !Array.isArray(dashboardData) || dashboardData.length === 0) {
      return [];
    }

    // model price
    const modelPriceMap = new Map<
      string,
      {
        inputPrice?: number;
        outputPrice?: number;
        charsPointsPrice?: number;
      }
    >();

    systemModelList.forEach(
      (model: {
        model: string;
        inputPrice?: number;
        outputPrice?: number;
        charsPointsPrice?: number;
      }) => {
        modelPriceMap.set(model.model, {
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
          charsPointsPrice: model.charsPointsPrice
        });
      }
    );

    const dailyStats = new Map<
      string,
      {
        errorCalls: number;
        successCalls: number;
        inputTokens: number;
        outputTokens: number;
        inputCost: number;
        outputCost: number;
        timestamp: number;
      }
    >();

    dashboardData.forEach((dayData) => {
      let timestamp = dayData.timestamp;

      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      if (timestamp < 10000000000) {
        timestamp = timestamp * 1000;
      }

      if (timestamp > now || timestamp < thirtyDaysAgo) {
        timestamp = now;
      }

      const date = dayjs(timestamp).format('MM-DD');

      if (!dailyStats.has(date)) {
        dailyStats.set(date, {
          errorCalls: 0,
          successCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          inputCost: 0,
          outputCost: 0,
          timestamp: timestamp
        });
      }

      const existing = dailyStats.get(date)!;

      const modelsToProcess = filterProps.model
        ? dayData.models.filter((model: ModelUsageData) => model.model === filterProps.model)
        : dayData.models;

      modelsToProcess.forEach((model: ModelUsageData) => {
        const successCalls = model.request_count - model.exception_count;
        existing.successCalls += successCalls;
        existing.errorCalls += model.exception_count;
        existing.inputTokens += model.input_tokens || 0;
        existing.outputTokens += model.output_tokens || 0;

        const modelPricing = modelPriceMap.get(model.model);
        if (modelPricing) {
          const inputTokens = model.input_tokens || 0;
          const outputTokens = model.output_tokens || 0;

          const isIOPriceType =
            typeof modelPricing.inputPrice === 'number' && modelPricing.inputPrice > 0;

          if (isIOPriceType) {
            existing.inputCost += (modelPricing.inputPrice || 0) * (inputTokens / 1000);
            existing.outputCost += (modelPricing.outputPrice || 0) * (outputTokens / 1000);
          } else if (modelPricing.charsPointsPrice) {
            const totalTokens = inputTokens + outputTokens;
            const totalCost = (modelPricing.charsPointsPrice || 0) * (totalTokens / 1000);

            const totalUsedTokens = inputTokens + outputTokens;
            if (totalUsedTokens > 0) {
              existing.inputCost += totalCost * (inputTokens / totalUsedTokens);
              existing.outputCost += totalCost * (outputTokens / totalUsedTokens);
            }
          }
        }
      });
    });

    // Convert to an array and sort it
    const processedData = Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        errorCalls: stats.errorCalls,
        successCalls: stats.successCalls,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        inputCost: stats.inputCost,
        outputCost: stats.outputCost,
        totalCost: stats.inputCost + stats.outputCost
      }))
      .sort((a, b) => {
        const currentYear = new Date().getFullYear();
        const dateA = dayjs(`${currentYear}-${a.date}`, 'YYYY-MM-DD');
        const dateB = dayjs(`${currentYear}-${b.date}`, 'YYYY-MM-DD');

        if (!dateA.isValid() || !dateB.isValid()) {
          return a.date.localeCompare(b.date);
        }

        return dateA.isBefore(dateB) ? -1 : dateA.isAfter(dateB) ? 1 : 0;
      });

    return processedData;
  }, [
    dashboardData,
    filterProps.dateRange,
    filterProps.model,
    filterProps.channelId,
    systemModelList
  ]);

  // Calculate total statistics
  const totalStats = useMemo(() => {
    return chartData.reduce(
      (acc, curr) => ({
        errorCalls: acc.errorCalls + curr.errorCalls,
        successCalls: acc.successCalls + curr.successCalls,
        inputTokens: acc.inputTokens + curr.inputTokens,
        outputTokens: acc.outputTokens + curr.outputTokens,
        inputCost: acc.inputCost + curr.inputCost,
        outputCost: acc.outputCost + curr.outputCost,
        totalCost: acc.totalCost + curr.totalCost
      }),
      {
        errorCalls: 0,
        successCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
      }
    );
  }, [chartData]);

  return (
    <>
      <Box>{Tab}</Box>

      <HStack spacing={4} mt={4}>
        <HStack>
          <FormLabel>{t('common:user.Time')}</FormLabel>
          <Box>
            <DateRangePicker
              defaultDate={filterProps.dateRange}
              dateRange={filterProps.dateRange}
              position="bottom"
              onSuccess={(e) => setFilterProps({ ...filterProps, dateRange: e })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('account_model:dashboard_channel')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<string | undefined>
              bg={'myGray.50'}
              isSearch
              list={channelList}
              placeholder={t('account_model:select_channel')}
              value={filterProps.channelId}
              onChange={(val) => {
                setFilterProps({
                  ...filterProps,
                  channelId: val || undefined,
                  model: undefined
                });
              }}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('account_model:dashboard_model')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<string | undefined>
              bg={'myGray.50'}
              isSearch
              list={modelList}
              placeholder={t('account_model:select_model')}
              value={filterProps.model}
              onChange={(val) => setFilterProps({ ...filterProps, model: val || undefined })}
            />
          </Box>
        </HStack>
      </HStack>

      <MyBox overflowY={'auto'} isLoading={isLoading}>
        <Flex
          flexDirection={{ base: 'column', md: 'row' }}
          gap={6}
          fontSize={'20px'}
          fontWeight={'medium'}
          my={6}
        >
          <Flex>
            <Box color={'black'}>{t('account_model:dashboard_total_calls')}</Box>
            <Box color={'primary.600'} ml={2}>
              {`${formatNumber(totalStats.successCalls + totalStats.errorCalls)}`}
            </Box>
          </Flex>
          <Flex>
            <Box color={'black'}>{t('account_model:dashboard_total_cost_label')}</Box>
            <Box color={'purple.600'} ml={2}>
              {`${totalStats.totalCost.toFixed(0)} ${t('account_model:dashboard_points')}`}
            </Box>
          </Flex>
        </Flex>

        {!isLoading && (!dashboardData || dashboardData.length === 0) && (
          <Box textAlign="center" py={12} color="myGray.500" fontSize="md">
            <Box mb={2}>{t('account_model:dashboard_no_data')}</Box>
          </Box>
        )}

        {!isLoading && dashboardData && dashboardData.length > 0 && (
          <>
            <LineChartComponent
              data={chartData}
              title={t('account_model:dashboard_call_trend')}
              xAxisConfig={{
                dataKey: 'date',
                padding: { left: 40, right: 40 },
                tickMargin: 10,
                tickSize: 0,
                tick: { fontSize: '12px', color: theme.colors.myGray['500'], fontWeight: '500' }
              }}
              lines={[
                {
                  dataKey: 'successCalls',
                  name: t('account_model:dashboard_success_calls'),
                  color: theme.colors.primary['600']
                },
                {
                  dataKey: 'errorCalls',
                  name: t('account_model:dashboard_error_calls'),
                  color: theme.colors.yellow['400']
                }
              ]}
              tooltipItems={[
                {
                  label: t('account_model:dashboard_success_calls'),
                  dataKey: 'successCalls',
                  color: theme.colors.primary['600']
                },
                {
                  label: t('account_model:dashboard_error_calls'),
                  dataKey: 'errorCalls',
                  color: theme.colors.yellow['400']
                }
              ]}
            />

            <Box mt={8}>
              <LineChartComponent
                data={chartData}
                title={t('account_model:dashboard_token_trend')}
                xAxisConfig={{
                  dataKey: 'date',
                  padding: { left: 40, right: 40 },
                  tickMargin: 10,
                  tickSize: 0,
                  tick: { fontSize: '12px', color: theme.colors.myGray['500'], fontWeight: '500' }
                }}
                lines={[
                  {
                    dataKey: 'inputTokens',
                    name: t('account_model:dashboard_input_tokens'),
                    color: theme.colors.primary['600']
                  },
                  {
                    dataKey: 'outputTokens',
                    name: t('account_model:dashboard_output_tokens'),
                    color: theme.colors.yellow['400']
                  },
                  {
                    dataKey: (data: ModelDashboardData) => data.inputTokens + data.outputTokens,
                    name: t('account_model:dashboard_total_tokens'),
                    color: theme.colors.adora['600']
                  }
                ]}
                tooltipItems={[
                  {
                    label: t('account_model:dashboard_input_tokens'),
                    dataKey: 'inputTokens',
                    color: theme.colors.primary['600'],
                    formatter: (value) => formatNumber(value).toString()
                  },
                  {
                    label: t('account_model:dashboard_output_tokens'),
                    dataKey: 'outputTokens',
                    color: theme.colors.yellow['400'],
                    formatter: (value) => formatNumber(value).toString()
                  },
                  {
                    label: t('account_model:dashboard_total_tokens'),
                    color: theme.colors.adora['600'],
                    customValue: (data: ModelDashboardData) => data.inputTokens + data.outputTokens,
                    formatter: (value) => formatNumber(value).toString()
                  }
                ]}
              />
            </Box>

            <Box mt={8}>
              <LineChartComponent
                data={chartData}
                title={t('account_model:dashboard_cost_trend')}
                xAxisConfig={{
                  dataKey: 'date',
                  padding: { left: 40, right: 40 },
                  tickMargin: 10,
                  tickSize: 0,
                  tick: { fontSize: '12px', color: theme.colors.myGray['500'], fontWeight: '500' }
                }}
                lines={[
                  {
                    dataKey: 'totalCost',
                    name: t('account_model:dashboard_total_cost'),
                    color: theme.colors.adora['600']
                  }
                ]}
                tooltipItems={[
                  {
                    label: t('account_model:dashboard_total_cost'),
                    dataKey: 'totalCost',
                    color: theme.colors.adora['600'],
                    formatter: (value) =>
                      `${value.toFixed(1)} ${t('account_model:dashboard_points')}`
                  }
                ]}
              />
            </Box>
          </>
        )}
      </MyBox>
    </>
  );
};

export default React.memo(ModelDashboard);
