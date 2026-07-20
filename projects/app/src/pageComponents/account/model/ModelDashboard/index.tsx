import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Grid, HStack, useTheme } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { addDays } from 'date-fns';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getUsageStats, getModelListPage } from '@/web/core/ai/config';
import AreaChartComponent from '@fastgpt/web/components/common/charts/AreaChartComponent';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { modelTypeList } from '@fastgpt/global/core/ai/constants';
import { useDebounceFn } from 'ahooks';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { UsageStatsResponse } from '@fastgpt/global/openapi/core/ai/model/api';

const ChartsBoxStyles = {
  px: 5,
  pt: 4,
  pb: 8,
  h: '300px',
  border: 'base',
  borderRadius: 'md',
  overflow: 'hidden'
} as const;

// Fixed categorical order for the model distribution pie (validated against the
// adjacent-pair floors; the legend list beside it is the table view).
const PIE_COLORS = ['#3370ff', '#f98e1a', '#00c98d', '#8774ee', '#ff8b00', '#e84738'];
const OTHER_COLOR = '#CBD5E1';
const MAX_PIE_SLICES = 6;

type TrendType = 'calls' | 'tokens' | 'points';

const getDefaultDateRange = (): DateRangeType => {
  const from = addDays(new Date(), -7);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

/**
 * Model monitor (design §14.2). Aggregates the usage_items of the models the
 * current user can access (AUTH-TC08) into metric cards, a call trend and a
 * per-model distribution. usage_items carry no latency/error fields, so the
 * monitor reports calls/tokens/points only.
 */
const ModelMonitor = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [filterProps, setFilterProps] = useState<{
    modelId?: string;
    type?: ModelTypeEnum;
    dateRange: DateRangeType;
  }>({
    modelId: undefined,
    type: undefined,
    dateRange: getDefaultDateRange()
  });

  const [trendType, setTrendType] = useState<TrendType>('calls');

  const { data: stats, loading: isLoading } = useRequest(
    (): Promise<UsageStatsResponse> =>
      getUsageStats({
        modelId: filterProps.modelId,
        type: filterProps.type || undefined,
        dateStart: filterProps.dateRange.from?.toISOString(),
        dateEnd: filterProps.dateRange.to?.toISOString(),
        unit: 'day',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }),
    {
      manual: false,
      refreshDeps: [filterProps]
    }
  );

  // ── Model dropdown: lazy load with pagination + remote search (design §5.1) ──
  const [modelSearch, setModelSearch] = useState('');
  const {
    ScrollData: ModelScrollData,
    data: loadedModels,
    isLoading: isLoadingModels,
    fetchData: fetchModelList
  } = useScrollPagination(
    (params: { pageNum?: number; pageSize?: number }) =>
      getModelListPage({
        ...params,
        type: filterProps.type || undefined,
        search: modelSearch,
        isActive: 'active'
      }),
    {
      pageSize: 20,
      refreshDeps: [filterProps.type, modelSearch]
    }
  );

  // Type change resets the selected model (options are type-filtered)
  const prevTypeRef = useRef(filterProps.type);
  useEffect(() => {
    if (prevTypeRef.current === filterProps.type) return;
    prevTypeRef.current = filterProps.type;
    setFilterProps((prev) => ({ ...prev, modelId: undefined }));
    fetchModelList({ init: true, silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProps.type]);

  const { run: onDebouncedModelSearch } = useDebounceFn(
    () => {
      fetchModelList({ init: true, silent: true });
    },
    { wait: 300 }
  );

  const modelOptions = useMemo(() => {
    const models = loadedModels.map((item) => ({
      label: item.name || item.model,
      value: item.id
    }));
    return [{ label: t('common:All'), value: '' }, ...models];
  }, [loadedModels, t]);

  const typeOptions = useMemo(
    () => [
      { label: t('common:All'), value: '' },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

  // ── Trend chart data: single selected metric per chart (one axis) ──
  const trendData = useMemo(
    () =>
      (stats?.trend ?? []).map((item) => ({
        x: item.date,
        xLabel: item.date,
        value: item[trendType]
      })),
    [stats, trendType]
  );

  const trendTitleMap: Record<TrendType, string> = {
    calls: t('account_model:total_call_volume'),
    tokens: t('account_model:dashboard_token_usage'),
    points: t('account_model:aipoint_usage')
  };
  const trendColorMap: Record<TrendType, string> = {
    calls: theme.colors.primary['600'],
    tokens: '#8774EE',
    points: '#36B37E'
  };

  // ── Model distribution: top slices by points, the rest folded into Other ──
  const pieData = useMemo(() => {
    const dist = stats?.modelDistribution ?? [];
    const top = dist.slice(0, MAX_PIE_SLICES);
    const rest = dist.slice(MAX_PIE_SLICES);
    const restPoints = rest.reduce((acc, item) => acc + (item.points || 0), 0);

    const data = top.map((item, index) => ({
      ...item,
      color: PIE_COLORS[index % PIE_COLORS.length]
    }));
    if (restPoints > 0) {
      data.push({
        modelId: 'other',
        name: t('account_model:other'),
        calls: 0,
        points: restPoints,
        color: OTHER_COLOR
      });
    }
    return data;
  }, [stats, t]);

  const totalPoints = useMemo(
    () => pieData.reduce((acc, item) => acc + (item.points || 0), 0),
    [pieData]
  );

  const metricCards = [
    {
      label: t('account_model:total_call_volume'),
      value: stats?.totalCalls ?? 0,
      color: theme.colors.primary['600']
    },
    {
      label: t('account_model:dashboard_token_usage'),
      value: stats?.totalTokens ?? 0,
      color: '#8774EE'
    },
    {
      label: t('account_model:aipoint_usage'),
      value: stats?.totalPoints ?? 0,
      color: '#36B37E'
    }
  ];

  return (
    <>
      <Box>{Tab}</Box>

      <HStack spacing={4} flexWrap={'wrap'}>
        <HStack>
          <FormLabel>{t('account_model:model_name')}</FormLabel>
          <Box flex={'1 0 0'} minW={'180px'}>
            <MySelect<string>
              bg={'myGray.50'}
              isSearch
              list={modelOptions}
              ScrollData={ModelScrollData}
              isLoading={isLoadingModels}
              placeholder={t('account_model:select_model')}
              value={filterProps.modelId ?? ''}
              onSearchChange={(val) => {
                setModelSearch(val);
                onDebouncedModelSearch();
              }}
              customOnClose={() => {
                if (modelSearch) {
                  setModelSearch('');
                  fetchModelList({ init: true, silent: true });
                }
              }}
              onChange={(val) => setFilterProps({ ...filterProps, modelId: val })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('account_model:model_type')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<string>
              bg={'myGray.50'}
              list={typeOptions}
              placeholder={t('account_model:select_model_type')}
              value={filterProps.type ?? ''}
              onChange={(val) => setFilterProps({ ...filterProps, type: val as ModelTypeEnum })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('common:user.Time')}</FormLabel>
          <Box>
            <DateRangePicker
              defaultDate={filterProps.dateRange}
              dateRange={filterProps.dateRange}
              onSuccess={(e) => setFilterProps({ ...filterProps, dateRange: e })}
            />
          </Box>
        </HStack>
      </HStack>

      <MyBox flex={'1 0 0'} h={0} overflowY={'auto'} isLoading={isLoading}>
        {/* Metric cards */}
        <Grid gridTemplateColumns={['1fr', 'repeat(3, 1fr)']} gap={4}>
          {metricCards.map((card) => (
            <Flex
              key={card.label}
              border={'base'}
              borderRadius={'md'}
              p={4}
              bg={'white'}
              flexDirection={'column'}
              gap={2}
            >
              <Box fontSize={'sm'} color={'myGray.600'}>
                {card.label}
              </Box>
              <Box fontSize={'2xl'} fontWeight={'bold'} color={card.color}>
                {formatNumber(card.value)}
              </Box>
            </Flex>
          ))}
        </Grid>

        {/* Call trend */}
        <Box mt={4} {...ChartsBoxStyles}>
          <AreaChartComponent
            data={trendData}
            title={trendTitleMap[trendType]}
            enableIncremental={false}
            enableCumulative={false}
            lines={[
              { dataKey: 'value', name: trendTitleMap[trendType], color: trendColorMap[trendType] }
            ]}
            tooltipItems={[
              { label: trendTitleMap[trendType], dataKey: 'value', color: trendColorMap[trendType] }
            ]}
            HeaderLeftChildren={
              <FillRowTabs<TrendType>
                list={[
                  { label: t('account_model:total_call_volume'), value: 'calls' },
                  { label: t('account_model:dashboard_token_usage'), value: 'tokens' },
                  { label: t('account_model:aipoint_usage'), value: 'points' }
                ]}
                py={0.5}
                px={2}
                value={trendType}
                onChange={setTrendType}
              />
            }
          />
        </Box>

        {/* Model distribution: pie + legend list (table view) */}
        <Box mt={4} {...ChartsBoxStyles} h={'auto'}>
          <Box fontSize={'sm'} color={'myGray.900'} fontWeight={'medium'} mb={4}>
            {t('account_model:model_distribution')}
          </Box>
          <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={4}>
            <Box h={'240px'}>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      formatter={(value: any) => formatNumber(Number(value)).toLocaleString()}
                    />
                    <Pie
                      data={pieData}
                      dataKey="points"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={90}
                      paddingAngle={2}
                      strokeWidth={2}
                    >
                      {pieData.map((item) => (
                        <Cell key={item.modelId} fill={item.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Flex
                  h={'100%'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  color={'myGray.500'}
                >
                  {t('account_model:dashboard_no_data')}
                </Flex>
              )}
            </Box>
            <Box overflowY={'auto'} maxH={'240px'}>
              {pieData.map((item) => {
                const percent =
                  totalPoints > 0 ? `${((item.points / totalPoints) * 100).toFixed(1)}%` : '0%';
                return (
                  <HStack key={item.modelId} spacing={3} py={1.5} fontSize={'sm'}>
                    <Box w={3} h={3} borderRadius={'full'} bg={item.color} flexShrink={0} />
                    <Box flex={'1 1 0'} noOfLines={1} minW={0}>
                      {item.name}
                    </Box>
                    <Box color={'myGray.500'}>{formatNumber(item.points)}</Box>
                    <Box color={'myGray.500'} w={'52px'} textAlign={'right'}>
                      {percent}
                    </Box>
                  </HStack>
                );
              })}
              {pieData.length === 0 && (
                <Box color={'myGray.500'} fontSize={'sm'}>
                  {t('account_model:dashboard_no_data')}
                </Box>
              )}
            </Box>
          </Grid>
        </Box>
      </MyBox>
    </>
  );
};

export default React.memo(ModelMonitor);
