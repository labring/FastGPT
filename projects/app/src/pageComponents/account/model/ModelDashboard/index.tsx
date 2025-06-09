import React, { useMemo, useState } from 'react';
import type { BoxProps } from '@chakra-ui/react';
import { Box, Flex, Grid, HStack, useTheme } from '@chakra-ui/react';
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
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type ModelDashboardData = {
  x: string;
  totalCalls: number;
  errorCalls: number;
  errorRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
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

// Displays model usage statistics, token consumption and cost visualization
const ModelDashboard = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { feConfigs } = useSystemStore();

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
        timespan: 'day' as const
      };

      let data = await getDashboardV2(params);

      if (filterProps.model) {
        data = data.map((item) => {
          const filterModels = item.models.filter((model) => model.model === filterProps.model);
          return {
            ...item,
            models: filterModels
          };
        });
      }

      // Auto-fill missing days
      if (filterProps.dateRange.from && filterProps.dateRange.to) {
        const startDate = dayjs(filterProps.dateRange.from);
        const endDate = dayjs(filterProps.dateRange.to);
        const daysDiff = endDate.diff(startDate, 'day') + 1;

        // Create complete date list
        const completeDateList = Array.from({ length: daysDiff }, (_, i) =>
          startDate.add(i, 'day')
        );

        // Create a map of existing data by timestamp
        const existingDataMap = new Map(
          data.map((item) => [dayjs(item.timestamp * 1000).format('YYYY-MM-DD'), item])
        );

        // Fill missing days with empty data
        const completeData = completeDateList.map((date) => {
          const dateKey = date.format('YYYY-MM-DD');
          const existingItem = existingDataMap.get(dateKey);

          if (existingItem) {
            return existingItem;
          } else {
            // Create empty data structure for missing days
            return {
              timestamp: Math.floor(date.valueOf() / 1000),
              models: []
            };
          }
        });

        data = completeData;
      }

      return data;
    },
    {
      manual: false,
      refreshDeps: [filterProps.channelId, filterProps.dateRange, filterProps.model]
    }
  );

  // Process chart data - aggregate daily model calls, token usage and cost data
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
      const date = dayjs(item.timestamp * 1000).format('MM-DD');
      const totalCalls = item.models.reduce((acc, model) => acc + model.request_count, 0);
      const errorCalls = item.models.reduce((acc, model) => acc + model.exception_count, 0);
      const errorRate = totalCalls === 0 ? 0 : Number((errorCalls / totalCalls).toFixed(2));

      const inputTokens = item.models.reduce((acc, model) => acc + (model?.input_tokens || 0), 0);
      const outputTokens = item.models.reduce((acc, model) => acc + (model?.output_tokens || 0), 0);
      const totalTokens = item.models.reduce((acc, model) => acc + (model?.total_tokens || 0), 0);

      const totalCost = item.models.reduce((acc, model) => {
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
        totalCost
      };
    });
  }, [dashboardData, systemModelList]);

  const [tokensUsageType, setTokensUsageType] = useState<
    'inputTokens' | 'outputTokens' | 'totalTokens'
  >('totalTokens');
  console.log(chartData);
  return (
    <>
      <Box>{Tab}</Box>

      <HStack spacing={4}>
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
      </HStack>

      <MyBox flex={'1 0 0'} h={0} overflowY={'auto'} isLoading={isLoading}>
        {dashboardData && dashboardData.length > 0 && (
          <>
            <Box {...ChartsBoxStyles}>
              <LineChartComponent
                data={chartData}
                title={t('account_model:model_request_times')}
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
                HeaderRightChildren={
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
                    py={1}
                    px={5}
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
          </>
        )}
      </MyBox>
    </>
  );
};

export default React.memo(ModelDashboard);
