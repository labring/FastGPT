import React, { useMemo, useState } from 'react';
import { Box, Flex, HStack } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { addDays } from 'date-fns';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps
} from 'recharts';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';
import dayjs from 'dayjs';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getChannelList, getDashboardV2 } from '@/web/core/ai/channel';
import { getSystemModelList } from '@/web/core/ai/config';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';

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

const CallsTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  const data = payload?.[0]?.payload as ModelDashboardData;

  if (active && data) {
    return (
      <Box
        bg={'white'}
        p={3}
        borderRadius={'md'}
        border={'0.5px solid'}
        borderColor={'myGray.200'}
        boxShadow={
          '0px 24px 48px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        }
      >
        <Box fontSize={'mini'} color={'myGray.600'} mb={3}>
          {data.date}
        </Box>
        <Box fontSize={'14px'} color={'#11B6FC'} fontWeight={'medium'} mb={1}>
          {`成功次数: ${formatNumber(data.successCalls)}`}
        </Box>
        <Box fontSize={'14px'} color={'#FDB022'} fontWeight={'medium'}>
          {`错误次数: ${formatNumber(data.errorCalls)}`}
        </Box>
      </Box>
    );
  }
  return null;
};

const TokensTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  const data = payload?.[0]?.payload as ModelDashboardData;

  if (active && data) {
    return (
      <Box
        bg={'white'}
        p={3}
        borderRadius={'md'}
        border={'0.5px solid'}
        borderColor={'myGray.200'}
        boxShadow={
          '0px 24px 48px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        }
      >
        <Box fontSize={'mini'} color={'myGray.600'} mb={3}>
          {data.date}
        </Box>
        <Box fontSize={'14px'} color={'#11B6FC'} fontWeight={'medium'} mb={1}>
          {`输入Tokens: ${formatNumber(data.inputTokens)}`}
        </Box>
        <Box fontSize={'14px'} color={'#FDB022'} fontWeight={'medium'} mb={1}>
          {`输出Tokens: ${formatNumber(data.outputTokens)}`}
        </Box>
      </Box>
    );
  }
  return null;
};

const CostTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  const data = payload?.[0]?.payload as ModelDashboardData;

  if (active && data) {
    return (
      <Box
        bg={'white'}
        p={3}
        borderRadius={'md'}
        border={'0.5px solid'}
        borderColor={'myGray.200'}
        boxShadow={
          '0px 24px 48px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        }
      >
        <Box fontSize={'mini'} color={'myGray.600'} mb={3}>
          {data.date}
        </Box>
        <Box fontSize={'14px'} color={'#11B6FC'} fontWeight={'medium'} mb={1}>
          {`输入成本: ${data.inputCost.toFixed(0)} 积分`}
        </Box>
        <Box fontSize={'14px'} color={'#FDB022'} fontWeight={'medium'} mb={1}>
          {`输出成本: ${data.outputCost.toFixed(0)} 积分`}
        </Box>
        <Box fontSize={'14px'} color={'#8B5CF6'} fontWeight={'medium'}>
          {`总成本: ${data.totalCost.toFixed(0)} 积分`}
        </Box>
      </Box>
    );
  }
  return null;
};

const processDashboardV2DataToChart = (
  dashboardData: Array<{
    timestamp: number;
    models: Array<{
      model: string;
      request_count: number;
      used_amount: number;
      exception_count: number;
      input_tokens: number;
      output_tokens?: number;
      total_tokens: number;
    }>;
  }>,
  dateRange: DateRangeType,
  selectedModel?: string,
  systemModelList: Array<{
    model: string;
    inputPrice?: number;
    outputPrice?: number;
    charsPointsPrice?: number;
  }> = []
): ModelDashboardData[] => {
  if (!dashboardData || dashboardData.length === 0) {
    return [];
  }

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

    const modelsToProcess = selectedModel
      ? dayData.models.filter((model) => model.model === selectedModel)
      : dayData.models;

    modelsToProcess.forEach((model) => {
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

  const result = Array.from(dailyStats.entries())
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

  return result;
};

const ModelDashboard = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();

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

  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});

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

  const { data: systemModelList = [] } = useRequest2(getSystemModelList, {
    manual: false
  });

  const modelList = useMemo(() => {
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
  }, [systemModelList, t, filterProps.channelId, channelList]);

  const { data: channelData, loading: isLoadingChannel } = useRequest2(
    async () => {
      if (!filterProps.channelId) {
        return null;
      }

      const params = {
        channel: parseInt(filterProps.channelId)
      };

      const result = await getDashboardV2(params);

      if (result && result.data) {
        return result.data;
      } else if (Array.isArray(result)) {
        return result;
      }

      return [];
    },
    {
      manual: false,
      refreshDeps: [filterProps.channelId]
    }
  );

  const { data: dashboardData, loading: isLoadingDashboard } = useRequest2(
    async () => {
      if (filterProps.channelId && channelData) {
        return channelData;
      }

      const params = {
        channel: 0
      };

      const result = await getDashboardV2(params);

      if (result && result.data) {
        return result.data;
      } else if (Array.isArray(result)) {
        return result;
      }

      return [];
    },
    {
      manual: false,
      refreshDeps: [filterProps.channelId, filterProps.model, channelData]
    }
  );

  const isLoading = isLoadingChannel || isLoadingDashboard;

  const chartData = useMemo(() => {
    if (!dashboardData || !Array.isArray(dashboardData) || dashboardData.length === 0) {
      return [];
    }

    const allProcessedData = processDashboardV2DataToChart(
      dashboardData,
      filterProps.dateRange,
      filterProps.model,
      systemModelList
    );

    const filteredData = allProcessedData.filter((item) => {
      try {
        const currentYear = new Date().getFullYear();
        const itemDate = dayjs(`${currentYear}-${item.date}`, 'YYYY-MM-DD');
        const fromDate = dayjs(filterProps.dateRange.from);
        const toDate = dayjs(filterProps.dateRange.to);

        if (!itemDate.isValid() || !fromDate.isValid() || !toDate.isValid()) {
          return false;
        }

        return (
          (itemDate.isAfter(fromDate, 'day') || itemDate.isSame(fromDate, 'day')) &&
          (itemDate.isBefore(toDate, 'day') || itemDate.isSame(toDate, 'day'))
        );
      } catch (error) {
        return false;
      }
    });

    return filteredData;
  }, [
    dashboardData,
    filterProps.dateRange,
    filterProps.model,
    filterProps.channelId,
    channelData,
    systemModelList
  ]);

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
          <FormLabel>渠道</FormLabel>
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
          <FormLabel>模型</FormLabel>
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
            <Box color={'black'}>{`总调用次数:`}</Box>
            <Box color={'primary.600'} ml={2}>
              {`${formatNumber(totalStats.successCalls + totalStats.errorCalls)}`}
            </Box>
          </Flex>
          <Flex>
            <Box color={'black'}>{`总成本:`}</Box>
            <Box color={'purple.600'} ml={2}>
              {`${totalStats.totalCost.toFixed(0)} 积分`}
            </Box>
          </Flex>
        </Flex>

        {!isLoading && (!dashboardData || dashboardData.length === 0) && (
          <Box textAlign="center" py={12} color="myGray.500" fontSize="md">
            <Box mb={2}>暂无数据</Box>
            <Box fontSize="sm" color="myGray.400">
              请尝试调整筛选条件或时间范围
            </Box>
          </Box>
        )}

        {!isLoading && dashboardData && dashboardData.length > 0 && (
          <>
            <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'}>
              模型调用次数趋势
            </Flex>
            <ResponsiveContainer width="100%" height={424} className="mt-4">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  padding={{ left: 40, right: 40 }}
                  tickMargin={10}
                  tickSize={0}
                  tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
                  interval={Math.max(Math.floor(chartData.length / 7), 0)}
                />
                <YAxis
                  axisLine={false}
                  tickSize={0}
                  tickMargin={12}
                  tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
                />
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <Tooltip content={<CallsTooltip />} />
                <Legend
                  onClick={(e) => {
                    setHiddenLines((prev) => ({
                      ...prev,
                      // @ts-ignore
                      [e.dataKey]: !prev[e.dataKey]
                    }));
                  }}
                />
                <Line
                  type="monotone"
                  name="成功次数"
                  dataKey="successCalls"
                  stroke="#11B6FC"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['successCalls']}
                />
                <Line
                  type="monotone"
                  name="错误次数"
                  dataKey="errorCalls"
                  stroke="#FDB022"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['errorCalls']}
                />
              </LineChart>
            </ResponsiveContainer>

            <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'} mt={8}>
              Tokens使用趋势
            </Flex>
            <ResponsiveContainer width="100%" height={424} className="mt-4">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  padding={{ left: 40, right: 40 }}
                  tickMargin={10}
                  tickSize={0}
                  tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
                  interval={Math.max(Math.floor(chartData.length / 7), 0)}
                />
                <YAxis
                  axisLine={false}
                  tickSize={0}
                  tickMargin={12}
                  tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
                />
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <Tooltip content={<TokensTooltip />} />
                <Legend
                  onClick={(e) => {
                    setHiddenLines((prev) => ({
                      ...prev,
                      // @ts-ignore
                      [e.dataKey]: !prev[e.dataKey]
                    }));
                  }}
                />
                <Line
                  type="monotone"
                  name="输入Tokens"
                  dataKey="inputTokens"
                  stroke="#11B6FC"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['inputTokens']}
                />
                <Line
                  type="monotone"
                  name="输出Tokens"
                  dataKey="outputTokens"
                  stroke="#FDB022"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['outputTokens']}
                />
              </LineChart>
            </ResponsiveContainer>

            <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'} mt={8}>
              成本趋势（积分）
            </Flex>
            <ResponsiveContainer width="100%" height={424} className="mt-4">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  padding={{ left: 40, right: 40 }}
                  tickMargin={10}
                  tickSize={0}
                  tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
                  interval={Math.max(Math.floor(chartData.length / 7), 0)}
                />
                <YAxis
                  axisLine={false}
                  tickSize={0}
                  tickMargin={12}
                  tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
                />
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <Tooltip content={<CostTooltip />} />
                <Legend
                  onClick={(e) => {
                    setHiddenLines((prev) => ({
                      ...prev,
                      // @ts-ignore
                      [e.dataKey]: !prev[e.dataKey]
                    }));
                  }}
                />
                <Line
                  type="monotone"
                  name="输入成本"
                  dataKey="inputCost"
                  stroke="#11B6FC"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['inputCost']}
                />
                <Line
                  type="monotone"
                  name="输出成本"
                  dataKey="outputCost"
                  stroke="#FDB022"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['outputCost']}
                />
                <Line
                  type="monotone"
                  name="总成本"
                  dataKey="totalCost"
                  stroke="#8B5CF6"
                  strokeWidth={2.5}
                  dot={false}
                  hide={hiddenLines['totalCost']}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </MyBox>
    </>
  );
};

export default React.memo(ModelDashboard);
