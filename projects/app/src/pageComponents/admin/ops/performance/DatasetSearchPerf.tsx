'use client';
import React, { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Input,
  Skeleton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import LineChartComponent from '@fastgpt/web/components/common/charts/LineChartComponent';
import type {
  DatasetIndexScale,
  DatasetSearchModeMetricValue,
  OpsPerfEventReason
} from '@fastgpt/global/common/opsPerf/constants';
import type { DatasetSearchPerfEventItem } from '@fastgpt/global/openapi/admin/ops/performance';
import { getDatasetSearchPerfEvents, getDatasetSearchPerfOverview } from '@/web/admin/ops/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { EventWaterfallCard } from './EventWaterfallCard';

const CardBoxStyle = {
  bg: 'white',
  p: 5,
  borderRadius: 'xl',
  borderWidth: '1px',
  borderColor: 'myGray.200',
  shadow: 'xs'
} as const;

const ModelPerfTableColWidths = ['36%', '14%', '16%', '20%', '14%'] as const;

const formatPct = (ratio: number) => `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.01 ? 2 : 1)}%`;
const formatMs = (ms: number) => `${Math.round(ms).toLocaleString()} ms`;

/** 运维看板 → 性能分析 → 知识库搜索性能主视图。 */
export default function DatasetSearchPerf(): JSX.Element {
  const { t, i18n } = useSafeTranslation();
  const compactNumberFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(i18n?.language || 'zh-CN', {
        notation: 'compact',
        maximumFractionDigits: 1
      });
    } catch {
      return new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 1
      });
    }
  }, [i18n?.language]);
  const formatCompactCount = (n: number) =>
    n < 10_000 ? n.toLocaleString(i18n?.language || undefined) : compactNumberFormatter.format(n);
  const datasetSynonymEnabled = useSystemStore(
    (state) => state.feConfigs?.datasetSynonymEnabled === true
  );

  // 全局筛选条件
  const [rangeHours, setRangeHours] = useState<number>(24);
  const [searchMode, setSearchMode] = useState<DatasetSearchModeMetricValue | 'all'>('all');
  const [indexScale, setIndexScale] = useState<DatasetIndexScale | 'all'>('all');
  const [stageSortMode, setStageSortMode] = useState<'order' | 'impact'>('order');

  // 单点排查筛选与详情弹窗
  const [eventReason, setEventReason] = useState<OpsPerfEventReason | 'all'>('all');
  const [datasetIdFilter, setDatasetIdFilter] = useState<string>('');
  const [detailEvent, setDetailEvent] = useState<DatasetSearchPerfEventItem | undefined>(undefined);

  const scaleLabelMap = useMemo<Record<DatasetIndexScale, string>>(
    () => ({
      s_10k: t('admin:ops_perf_scale_s_10k'),
      m_100k: t('admin:ops_perf_scale_m_100k'),
      l_500k: t('admin:ops_perf_scale_l_500k'),
      xl_2m: t('admin:ops_perf_scale_xl_2m'),
      xxl_2m_plus: t('admin:ops_perf_scale_xxl_2m_plus'),
      unknown: t('admin:ops_perf_scale_unknown')
    }),
    [t]
  );

  const modeLabelMap = useMemo<Record<string, string>>(
    () => ({
      embedding: t('common:core.dataset.search.mode.embedding'),
      fullTextRecall: t('common:core.dataset.search.mode.fullTextRecall'),
      mixedRecall: t('common:core.dataset.search.mode.mixedRecall'),
      unknown: t('admin:ops_perf_scale_unknown')
    }),
    [t]
  );

  const reasonLabelMap = useMemo<Record<OpsPerfEventReason, { label: string; color: string }>>(
    () => ({
      error: { label: t('admin:ops_perf_reason_error'), color: 'red' },
      degraded: { label: t('admin:ops_perf_reason_degraded'), color: 'yellow' },
      sample: { label: t('admin:ops_perf_reason_sample'), color: 'blue' }
    }),
    [t]
  );

  const stageLabelMap = useMemo<Record<string, string>>(
    () => ({
      queryExtension: t('admin:ops_perf_stage_query_extension'),
      imageCaption: t('admin:ops_perf_stage_image_caption'),
      filter: t('admin:ops_perf_stage_filter'),
      embeddingApi: t('admin:ops_perf_stage_embedding_api'),
      vectorRoute: t('admin:ops_perf_stage_vector_route'),
      vectorLeaseWait: t('admin:ops_perf_stage_vector_lease_wait'),
      vectorRecall: t('admin:ops_perf_stage_vector_recall'),
      vectorHydrate: t('admin:ops_perf_stage_vector_hydrate'),
      fullTextRecall: t('admin:ops_perf_stage_fulltext_recall'),
      fullTextHydrate: t('admin:ops_perf_stage_fulltext_hydrate'),
      rerank: t('admin:ops_perf_stage_rerank'),
      postProcess: datasetSynonymEnabled
        ? t('admin:ops_perf_stage_post_process_synonym')
        : t('admin:ops_perf_stage_post_process')
    }),
    [datasetSynonymEnabled, t]
  );

  const {
    data: overview,
    loading: overviewLoading,
    runAsync: refreshOverview
  } = useRequest(
    () =>
      getDatasetSearchPerfOverview({
        rangeHours,
        ...(searchMode !== 'all' ? { searchMode } : {}),
        ...(indexScale !== 'all' ? { indexScale } : {})
      }),
    {
      manual: false,
      refreshDeps: [rangeHours, searchMode, indexScale]
    }
  );

  const eventQueryParams = useMemo(
    () => ({
      rangeHours,
      ...(eventReason !== 'all' ? { reason: eventReason } : {}),
      ...(searchMode !== 'all' ? { searchMode } : {}),
      ...(indexScale !== 'all' ? { indexScale } : {}),
      ...(datasetIdFilter.trim() ? { datasetId: datasetIdFilter.trim() } : {})
    }),
    [rangeHours, eventReason, searchMode, indexScale, datasetIdFilter]
  );

  const {
    data: eventList,
    isLoading: eventsLoading,
    Pagination: EventsPagination,
    total: eventsTotal,
    pageSize: eventsPageSize,
    getData: refreshEvents
  } = usePagination(getDatasetSearchPerfEvents, {
    defaultPageSize: 20,
    pageSizeOptions: [20, 50, 100],
    pageSizeCacheKey: 'admin-ops-perf-dataset-search-events',
    params: eventQueryParams,
    refreshDeps: [eventQueryParams]
  });

  const handleRefreshAll = () => {
    void Promise.all([refreshOverview(), refreshEvents(1)]);
  };

  // 趋势图数据格式化（适配 LineChartComponent 的 x / xLabel 字段约定）
  const trendChartData = useMemo(() => {
    if (!overview?.meta || !Array.isArray(overview.trend)) return [];
    const fmt = overview.meta.bucketGranularity === 'hour' ? 'MM-DD HH:00' : 'MM-DD';
    return overview.trend.map((pt) => {
      const timeLabel = dayjs(pt.bucketTime).format(fmt);
      return {
        ...pt,
        x: timeLabel,
        xLabel: `${timeLabel}（${pt.count.toLocaleString()} ${t('admin:ops_perf_unit_calls')}）`
      };
    });
  }, [overview, t]);

  const trendLines = useMemo(
    () => [
      { dataKey: 'p99Ms', name: 'P99', color: '#EF4444', type: 'monotone' as const },
      { dataKey: 'p95Ms', name: 'P95', color: '#F59E0B', type: 'monotone' as const },
      { dataKey: 'p50Ms', name: 'P50', color: '#3B82F6', type: 'monotone' as const },
      {
        dataKey: 'avgMs',
        name: t('admin:ops_perf_avg_label'),
        color: '#10B981',
        type: 'monotone' as const,
        strokeWidth: 1.5,
        strokeDasharray: '4 3'
      }
    ],
    [t]
  );

  const trendTooltipItems = useMemo(
    () => [
      { label: 'P99', dataKey: 'p99Ms', color: '#EF4444', formatter: formatMs },
      { label: 'P95', dataKey: 'p95Ms', color: '#F59E0B', formatter: formatMs },
      { label: 'P50', dataKey: 'p50Ms', color: '#3B82F6', formatter: formatMs },
      {
        label: t('admin:ops_perf_avg_label'),
        dataKey: 'avgMs',
        color: '#10B981',
        formatter: formatMs
      },
      { label: t('admin:ops_perf_reason_error'), dataKey: 'errorCount', color: '#EF4444' }
    ],
    [t]
  );

  // 阶段拆解表排序
  const displayedStages = useMemo(() => {
    if (!Array.isArray(overview?.stageStats)) return [];
    if (stageSortMode === 'impact') {
      return [...overview.stageStats].sort(
        (a, b) => b.globalContributionMs - a.globalContributionMs
      );
    }
    return overview.stageStats;
  }, [overview, stageSortMode]);

  const maxStageContribution = useMemo(
    () => Math.max(...displayedStages.map((s) => s.globalContributionMs), 1),
    [displayedStages]
  );

  const maxScaleP95 = useMemo(
    () => Math.max(...(overview?.indexScaleStats?.map((s) => s.p95Ms) ?? [1]), 1),
    [overview]
  );

  const rangeOptions = useMemo(
    () => [
      { label: t('admin:ops_perf_range_24h'), value: 24 },
      { label: t('admin:ops_perf_range_7d'), value: 168 },
      { label: t('admin:ops_perf_range_30d'), value: 720 }
    ],
    [t]
  );

  const searchModeOptions = useMemo(
    () => [
      { label: t('admin:ops_perf_mode_all'), value: 'all' as const },
      { label: modeLabelMap.mixedRecall, value: 'mixedRecall' as const },
      { label: modeLabelMap.embedding, value: 'embedding' as const },
      { label: modeLabelMap.fullTextRecall, value: 'fullTextRecall' as const }
    ],
    [modeLabelMap, t]
  );

  const indexScaleOptions = useMemo(
    () => [
      { label: t('admin:ops_perf_scale_all'), value: 'all' as const },
      { label: scaleLabelMap.s_10k, value: 's_10k' as const },
      { label: scaleLabelMap.m_100k, value: 'm_100k' as const },
      { label: scaleLabelMap.l_500k, value: 'l_500k' as const },
      { label: scaleLabelMap.xl_2m, value: 'xl_2m' as const },
      { label: scaleLabelMap.xxl_2m_plus, value: 'xxl_2m_plus' as const },
      { label: scaleLabelMap.unknown, value: 'unknown' as const }
    ],
    [scaleLabelMap, t]
  );

  const stageSortOptions = useMemo(
    () => [
      { label: t('admin:ops_perf_sort_order'), value: 'order' as const },
      { label: t('admin:ops_perf_sort_impact'), value: 'impact' as const }
    ],
    [t]
  );

  const eventReasonOptions = useMemo(
    () => [
      { label: t('admin:ops_perf_reason_all'), value: 'all' as const },
      { label: reasonLabelMap.error.label, value: 'error' as const },
      { label: reasonLabelMap.degraded.label, value: 'degraded' as const },
      { label: reasonLabelMap.sample.label, value: 'sample' as const }
    ],
    [reasonLabelMap, t]
  );

  // 摘要看板分两行（每行 3 项）：第一行总量/数据库均值/失败率，第二行检索/重排/问题优化平均耗时
  const kpiCards = useMemo(() => {
    const s = overview?.summary;
    return [
      // Row 1: 检索总次数、数据库平均耗时、失败率
      {
        label: t('admin:ops_perf_kpi_total_count'),
        value: s ? s.totalCount.toLocaleString() : '0',
        sub: '',
        color: 'myGray.900'
      },
      {
        label: t('admin:ops_perf_kpi_db_avg'),
        value: s ? formatMs(s.dbAvgMs) : '-',
        sub: t('admin:ops_perf_kpi_db_avg_sub'),
        color: 'blue.600'
      },
      {
        label: t('admin:ops_perf_error_rate'),
        value: s ? formatPct(s.errorRate) : '-',
        sub: s ? `${t('admin:ops_perf_reason_error')} ${s.errorCount.toLocaleString()}` : '-',
        color: (s?.errorRate ?? 0) > 0.01 ? 'red.600' : 'myGray.900'
      },
      // Row 2: 检索平均耗时、搜索结果重排平均耗时、问题优化平均耗时
      {
        label: t('admin:ops_perf_kpi_search_avg'),
        value: s ? formatMs(s.avgMs) : '-',
        sub: s ? `P99 ${formatMs(s.p99Ms)} · P95 ${formatMs(s.p95Ms)}` : '-',
        color: 'primary.600'
      },
      {
        label: t('admin:ops_perf_kpi_rerank_avg'),
        value: s ? formatMs(s.rerankAvgMs) : '-',
        sub: s
          ? `P95 ${formatMs(s.rerankP95Ms)} · ${t('admin:ops_perf_trigger_short')} ${formatPct(s.rerankTriggerRate)} · ${t('admin:ops_perf_fallback_short')} ${formatPct(s.rerankFallbackRate)}`
          : '-',
        color: 'teal.600'
      },
      {
        label: t('admin:ops_perf_kpi_query_ext_avg'),
        value: s ? formatMs(s.queryExtAvgMs) : '-',
        sub: s
          ? `P95 ${formatMs(s.queryExtP95Ms)} · ${t('admin:ops_perf_trigger_short')} ${formatPct(s.queryExtTriggerRate)} · ${t('admin:ops_perf_fail_short')} ${formatPct(s.queryExtFailRate)}`
          : '-',
        color: 'purple.600'
      }
    ];
  }, [overview?.summary, t]);

  const retrievalEngineCards = useMemo(
    () => [
      {
        key: 'vector',
        title: t('admin:ops_perf_vector_perf_title'),
        sub: t('admin:ops_perf_vector_perf_sub'),
        badgeColor: 'blue',
        accentColor: 'blue.600',
        data: overview?.vectorSearchPerf
      },
      {
        key: 'fulltext',
        title: t('admin:ops_perf_fulltext_perf_title'),
        sub: t('admin:ops_perf_fulltext_perf_sub'),
        badgeColor: 'pink',
        accentColor: 'pink.600',
        data: overview?.fullTextSearchPerf
      }
    ],
    [overview?.fullTextSearchPerf, overview?.vectorSearchPerf, t]
  );

  const rerankModelTotalCalls = useMemo(
    () => (overview?.rerankByModel ?? []).reduce((sum, item) => sum + item.count, 0),
    [overview?.rerankByModel]
  );

  const queryExtModelTotalCalls = useMemo(
    () => (overview?.queryExtensionByModel ?? []).reduce((sum, item) => sum + item.count, 0),
    [overview?.queryExtensionByModel]
  );

  const isServiceUnavailable = !overviewLoading && !overview;

  return (
    <Box>
      {/* Filter & Infra Context Bar */}
      <Flex
        {...CardBoxStyle}
        py={3.5}
        px={4}
        mb={4}
        align={'center'}
        justify={'space-between'}
        flexWrap={'wrap'}
        gap={3}
      >
        <HStack spacing={2} flexWrap={'wrap'} fontSize={'xs'}>
          {overview?.meta && (
            <>
              <Badge colorScheme={'blue'} variant={'subtle'} px={2} py={0.5} borderRadius={'md'}>
                {t('admin:ops_perf_vector_engine')}: {overview.meta.vectorEngine.toUpperCase()}
              </Badge>
              <Badge colorScheme={'purple'} variant={'subtle'} px={2} py={0.5} borderRadius={'md'}>
                {t('admin:ops_perf_fulltext_engine')}: {overview.meta.fullTextEngine.toUpperCase()}
              </Badge>
            </>
          )}
        </HStack>

        <HStack spacing={2.5} flexWrap={'wrap'}>
          <MySelect<number>
            size={'sm'}
            width={'184px'}
            value={rangeHours}
            list={rangeOptions}
            onChange={(val) => {
              setRangeHours(val);
            }}
          />

          <MySelect<DatasetSearchModeMetricValue | 'all'>
            size={'sm'}
            width={'134px'}
            value={searchMode}
            list={searchModeOptions}
            onChange={(val) => {
              setSearchMode(val);
            }}
          />

          <MySelect<DatasetIndexScale | 'all'>
            size={'sm'}
            width={'146px'}
            value={indexScale}
            list={indexScaleOptions}
            onChange={(val) => {
              setIndexScale(val);
            }}
          />

          <Button
            size={'sm'}
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/retryLight'} w={'14px'} />}
            isLoading={overviewLoading || eventsLoading}
            onClick={handleRefreshAll}
          >
            {t('admin:ops_perf_refresh')}
          </Button>
        </HStack>
      </Flex>

      {/* Service Unavailable Graceful State (OSS / Pro unconfigured / Rolling upgrade 404) */}
      {isServiceUnavailable ? (
        <Box {...CardBoxStyle} py={12} textAlign={'center'}>
          <Text fontSize={'sm'} fontWeight={'semibold'} color={'myGray.800'}>
            {t('admin:ops_perf_service_unavailable_title')}
          </Text>
          <Text fontSize={'xs'} color={'myGray.500'} mt={1.5}>
            {t('admin:ops_perf_service_unavailable_desc')}
          </Text>
        </Box>
      ) : (
        <>
          {/* Section 1: 6 Core KPI Cards (2 rows x 3 cols) */}
          <Grid templateColumns={['1fr', 'repeat(3, 1fr)', 'repeat(3, 1fr)']} gap={3.5} mb={4}>
            {kpiCards.map((card, index) => (
              <Skeleton
                key={index}
                isLoaded={!overviewLoading || Boolean(overview)}
                borderRadius={'xl'}
                h={'100%'}
              >
                <Box {...CardBoxStyle} p={4} h={'100%'} minW={0}>
                  <Text fontSize={'xs'} color={'myGray.500'} fontWeight={'medium'} noOfLines={1}>
                    {card.label}
                  </Text>
                  <Text
                    fontSize={'xl'}
                    fontWeight={'bold'}
                    color={card.color}
                    mt={1.5}
                    lineHeight={1.25}
                    fontFamily={'mono'}
                    whiteSpace={'nowrap'}
                    isTruncated
                    title={card.value}
                  >
                    {card.value}
                  </Text>
                  {card.sub && (
                    <Text
                      fontSize={'xs'}
                      color={'myGray.500'}
                      mt={1}
                      noOfLines={1}
                      title={card.sub}
                    >
                      {card.sub}
                    </Text>
                  )}
                </Box>
              </Skeleton>
            ))}
          </Grid>

          {/* Section 2: Latency Percentile Trend + Index Scale Breakdown */}
          <Grid templateColumns={['1fr', '1fr', '13fr 11fr']} gap={4} mb={4} alignItems={'stretch'}>
            {/* Left: Trend Chart (reusing shared LineChartComponent) */}
            <MyBox
              {...CardBoxStyle}
              minW={0}
              h={'360px'}
              pb={10}
              isLoading={overviewLoading && !overview}
            >
              <LineChartComponent
                data={trendChartData}
                title={t('admin:ops_perf_trend_title')}
                description={
                  overview?.meta?.bucketGranularity === 'hour'
                    ? t('admin:ops_perf_trend_sub_hour')
                    : t('admin:ops_perf_trend_sub_day')
                }
                HeaderRightChildren={
                  <HStack spacing={3} fontSize={'xs'} color={'myGray.600'}>
                    <HStack spacing={1}>
                      <Box w={'8px'} h={'8px'} borderRadius={'full'} bg={'#3B82F6'} />
                      <Text>P50</Text>
                    </HStack>
                    <HStack spacing={1}>
                      <Box w={'8px'} h={'8px'} borderRadius={'full'} bg={'#F59E0B'} />
                      <Text>P95</Text>
                    </HStack>
                    <HStack spacing={1}>
                      <Box w={'8px'} h={'8px'} borderRadius={'full'} bg={'#EF4444'} />
                      <Text>P99</Text>
                    </HStack>
                    <HStack spacing={1}>
                      <Box w={'8px'} h={'8px'} borderRadius={'full'} bg={'#10B981'} />
                      <Text>{t('admin:ops_perf_avg_label')}</Text>
                    </HStack>
                  </HStack>
                }
                lines={trendLines}
                tooltipItems={trendTooltipItems}
                yAxisFormatter={(v) => `${v}ms`}
                yAxisWidth={58}
              />
            </MyBox>

            {/* Right: Index Scale Latency Comparison */}
            <MyBox {...CardBoxStyle} minW={0} isLoading={overviewLoading && !overview}>
              <Flex justify={'space-between'} align={'flex-start'} mb={3} gap={2}>
                <Box>
                  <Text fontSize={'sm'} fontWeight={'bold'} color={'myGray.900'}>
                    {t('admin:ops_perf_scale_chart_title')}
                  </Text>
                  <Text fontSize={'xs'} color={'myGray.500'}>
                    {t('admin:ops_perf_scale_chart_sub')}
                  </Text>
                </Box>
                {indexScale !== 'all' && (
                  <Button size={'xs'} variant={'grayGhost'} onClick={() => setIndexScale('all')}>
                    {t('admin:ops_perf_reset_filter')}
                  </Button>
                )}
              </Flex>

              <Box>
                {(overview?.indexScaleStats ?? []).map((row) => {
                  const isSelected = indexScale === row.scale;
                  const p50Width = Math.min(100, (row.p50Ms / maxScaleP95) * 100);
                  const p95Width = Math.min(100, (row.p95Ms / maxScaleP95) * 100);
                  return (
                    <Box
                      key={row.scale}
                      py={2}
                      px={2.5}
                      mb={1.5}
                      borderRadius={'md'}
                      cursor={'pointer'}
                      bg={isSelected ? 'primary.50' : 'transparent'}
                      borderWidth={'1px'}
                      borderColor={isSelected ? 'primary.300' : 'transparent'}
                      _hover={{ bg: isSelected ? 'primary.50' : 'myGray.50' }}
                      onClick={() =>
                        setIndexScale((prev) => (prev === row.scale ? 'all' : row.scale))
                      }
                    >
                      <Flex
                        justify={'space-between'}
                        align={'center'}
                        fontSize={'xs'}
                        mb={1}
                        gap={2}
                      >
                        <HStack spacing={1.5} minW={0} flexWrap={'nowrap'}>
                          <Text fontWeight={'semibold'} color={'myGray.800'} whiteSpace={'nowrap'}>
                            {scaleLabelMap[row.scale]}
                          </Text>
                          <Text color={'myGray.500'} whiteSpace={'nowrap'}>
                            ({row.count.toLocaleString()} · {formatPct(row.ratio)})
                          </Text>
                          {row.pgHnswRate !== null && (
                            <Badge
                              fontSize={'10px'}
                              colorScheme={row.pgHnswRate >= 0.9 ? 'green' : 'orange'}
                              variant={'subtle'}
                              whiteSpace={'nowrap'}
                            >
                              HNSW {formatPct(row.pgHnswRate)}
                            </Badge>
                          )}
                        </HStack>
                        <Text
                          fontFamily={'mono'}
                          fontSize={'xs'}
                          whiteSpace={'nowrap'}
                          flexShrink={0}
                        >
                          <Text as={'span'} color={'blue.600'} fontWeight={'semibold'}>
                            {Math.round(row.p50Ms)}
                          </Text>
                          {' / '}
                          <Text as={'span'} color={'orange.600'} fontWeight={'semibold'}>
                            {Math.round(row.p95Ms)} ms
                          </Text>
                        </Text>
                      </Flex>
                      <Box h={'8px'} bg={'myGray.100'} borderRadius={'full'} position={'relative'}>
                        <Box
                          position={'absolute'}
                          left={0}
                          top={0}
                          bottom={0}
                          w={`${p95Width.toFixed(1)}%`}
                          bg={'orange.300'}
                          borderRadius={'full'}
                        />
                        <Box
                          position={'absolute'}
                          left={0}
                          top={0}
                          bottom={0}
                          w={`${p50Width.toFixed(1)}%`}
                          bg={'blue.500'}
                          borderRadius={'full'}
                        />
                      </Box>
                    </Box>
                  );
                })}
                {(overview?.indexScaleStats?.length ?? 0) === 0 && (
                  <Text fontSize={'xs'} color={'myGray.400'} py={8} textAlign={'center'}>
                    {t('admin:ops_perf_no_data')}
                  </Text>
                )}
              </Box>
            </MyBox>
          </Grid>

          {/* Section 2B: Side-by-side Vector & Full-Text Retrieval Performance */}
          <Grid templateColumns={['1fr', '1fr', '1fr 1fr']} gap={4} mb={4}>
            {retrievalEngineCards.map((card) => {
              const stats = card.data;
              const hasData = Boolean(stats && stats.count > 0);
              const metricCells = [
                {
                  label: t('admin:ops_perf_avg_label'),
                  value: hasData && stats ? formatMs(stats.avgMs) : '-',
                  color: card.accentColor
                },
                {
                  label: 'P99',
                  value: hasData && stats ? formatMs(stats.p99Ms) : '-',
                  color: 'myGray.900'
                },
                {
                  label: 'P95',
                  value: hasData && stats ? formatMs(stats.p95Ms) : '-',
                  color: 'myGray.900'
                },
                {
                  label: 'P50',
                  value: hasData && stats ? formatMs(stats.p50Ms) : '-',
                  color: 'myGray.900'
                }
              ];
              return (
                <MyBox
                  key={card.key}
                  {...CardBoxStyle}
                  minW={0}
                  isLoading={overviewLoading && !overview}
                >
                  <Flex justify={'space-between'} align={'flex-start'} mb={3} gap={2}>
                    <Box>
                      <Text fontSize={'sm'} fontWeight={'bold'} color={'myGray.900'}>
                        {card.title}
                      </Text>
                      <Text fontSize={'xs'} color={'myGray.500'}>
                        {card.sub}
                      </Text>
                    </Box>
                    <Badge colorScheme={card.badgeColor} variant={'subtle'} fontFamily={'mono'}>
                      {t('admin:ops_perf_trigger_short')} {formatPct(stats?.triggerRate ?? 0)}
                    </Badge>
                  </Flex>

                  <Grid templateColumns={['repeat(2, 1fr)', 'repeat(4, 1fr)']} gap={3}>
                    {metricCells.map((cell) => (
                      <Box key={cell.label} p={3} bg={'myGray.50'} borderRadius={'md'} minW={0}>
                        <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                          {cell.label}
                        </Text>
                        <Text
                          fontSize={'lg'}
                          fontWeight={'bold'}
                          fontFamily={'mono'}
                          color={cell.color}
                          mt={1}
                          whiteSpace={'nowrap'}
                          isTruncated
                        >
                          {cell.value}
                        </Text>
                      </Box>
                    ))}
                  </Grid>
                </MyBox>
              );
            })}
          </Grid>

          {/* Section 3: Rerank & Query Extension Dedicated Model Comparison (stacked 2 rows) */}
          <Box {...CardBoxStyle} mb={4}>
            <Flex justify={'space-between'} align={'flex-start'} mb={3} gap={2}>
              <Box>
                <Text fontSize={'sm'} fontWeight={'bold'} color={'myGray.900'}>
                  {t('admin:ops_perf_rerank_title')}
                </Text>
                <Text fontSize={'xs'} color={'myGray.500'}>
                  {datasetSynonymEnabled
                    ? t('admin:ops_perf_rerank_sub_synonym')
                    : t('admin:ops_perf_rerank_sub')}
                </Text>
              </Box>
              <Badge colorScheme={'teal'} variant={'subtle'} fontFamily={'mono'}>
                {t('admin:ops_perf_model_scope_global')} · {rerankModelTotalCalls.toLocaleString()}{' '}
                {t('admin:ops_perf_unit_calls')}
              </Badge>
            </Flex>
            <TableContainer>
              <Table size={'sm'} variant={'simple'} style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {ModelPerfTableColWidths.map((width, idx) => (
                    <col key={idx} style={{ width }} />
                  ))}
                </colgroup>
                <Thead>
                  <Tr>
                    <Th>{t('admin:ops_perf_col_model')}</Th>
                    <Th isNumeric>{t('admin:ops_perf_col_calls')}</Th>
                    <Th isNumeric>{t('admin:ops_perf_col_candidates')}</Th>
                    <Th isNumeric>P50 / P95</Th>
                    <Th isNumeric>{t('admin:ops_perf_col_fail_rate')}</Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'xs'}>
                  {(overview?.rerankByModel ?? []).map((row) => (
                    <Tr key={row.model}>
                      <Td fontWeight={'medium'} title={row.model}>
                        <HStack spacing={2} minW={0}>
                          <Text isTruncated>{row.model}</Text>
                          {datasetSynonymEnabled && row.synonymRatio > 0 && (
                            <Badge
                              fontSize={'10px'}
                              colorScheme={'purple'}
                              variant={'subtle'}
                              flexShrink={0}
                            >
                              {t('admin:ops_perf_synonym_short')} {formatPct(row.synonymRatio)}
                            </Badge>
                          )}
                        </HStack>
                      </Td>
                      <Td isNumeric fontFamily={'mono'}>
                        {row.count.toLocaleString()}
                      </Td>
                      <Td isNumeric fontFamily={'mono'}>
                        {Math.round(row.avgCandidates)}
                      </Td>
                      <Td isNumeric fontFamily={'mono'}>
                        {Math.round(row.p50Ms)} /{' '}
                        <Text as={'span'} color={row.p95Ms >= 1000 ? 'orange.600' : 'primary.600'}>
                          {Math.round(row.p95Ms)} ms
                        </Text>
                      </Td>
                      <Td
                        isNumeric
                        fontFamily={'mono'}
                        color={row.fallbackRate >= 0.01 ? 'red.600' : 'green.600'}
                        fontWeight={'semibold'}
                      >
                        {formatPct(row.fallbackRate)}
                      </Td>
                    </Tr>
                  ))}
                  {(overview?.rerankByModel?.length ?? 0) === 0 && (
                    <Tr>
                      <Td colSpan={5} textAlign={'center'} color={'myGray.400'} py={6}>
                        {t('admin:ops_perf_no_data')}
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>

          <Box {...CardBoxStyle} mb={4}>
            <Flex justify={'space-between'} align={'flex-start'} mb={3} gap={2}>
              <Box>
                <Text fontSize={'sm'} fontWeight={'bold'} color={'myGray.900'}>
                  {t('admin:ops_perf_query_ext_title')}
                </Text>
                <Text fontSize={'xs'} color={'myGray.500'}>
                  {t('admin:ops_perf_query_ext_sub')}
                </Text>
              </Box>
              <Badge colorScheme={'purple'} variant={'subtle'} fontFamily={'mono'}>
                {t('admin:ops_perf_model_scope_global')} ·{' '}
                {queryExtModelTotalCalls.toLocaleString()} {t('admin:ops_perf_unit_calls')}
              </Badge>
            </Flex>
            <TableContainer>
              <Table size={'sm'} variant={'simple'} style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  {ModelPerfTableColWidths.map((width, idx) => (
                    <col key={idx} style={{ width }} />
                  ))}
                </colgroup>
                <Thead>
                  <Tr>
                    <Th>{t('admin:ops_perf_col_model')}</Th>
                    <Th isNumeric>{t('admin:ops_perf_col_calls')}</Th>
                    <Th isNumeric>{t('admin:ops_perf_col_avg_latency')}</Th>
                    <Th isNumeric>P50 / P95</Th>
                    <Th isNumeric>{t('admin:ops_perf_col_fail_rate')}</Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'xs'}>
                  {(overview?.queryExtensionByModel ?? []).map((row) => (
                    <Tr key={row.model}>
                      <Td fontWeight={'medium'} isTruncated title={row.model}>
                        {row.model}
                      </Td>
                      <Td isNumeric fontFamily={'mono'}>
                        {row.count.toLocaleString()}
                      </Td>
                      <Td isNumeric fontFamily={'mono'}>
                        {formatMs(row.avgMs)}
                      </Td>
                      <Td isNumeric fontFamily={'mono'}>
                        {Math.round(row.p50Ms)} /{' '}
                        <Text as={'span'} color={row.p95Ms >= 2000 ? 'red.600' : 'primary.600'}>
                          {Math.round(row.p95Ms)} ms
                        </Text>
                      </Td>
                      <Td
                        isNumeric
                        fontFamily={'mono'}
                        color={row.failRate >= 0.01 ? 'orange.600' : 'green.600'}
                        fontWeight={'semibold'}
                      >
                        {formatPct(row.failRate)}
                      </Td>
                    </Tr>
                  ))}
                  {(overview?.queryExtensionByModel?.length ?? 0) === 0 && (
                    <Tr>
                      <Td colSpan={5} textAlign={'center'} color={'myGray.400'} py={6}>
                        {t('admin:ops_perf_no_data')}
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>

          {/* Section 4: Stage Breakdown Table (Execution Order + Parallel Group + Global Contribution) */}
          <Box {...CardBoxStyle} mb={4}>
            <Flex justify={'space-between'} align={'flex-start'} flexWrap={'wrap'} gap={3} mb={3}>
              <Box>
                <Text fontSize={'sm'} fontWeight={'bold'} color={'myGray.900'}>
                  {t('admin:ops_perf_stage_table_title')}
                </Text>
                <Text fontSize={'xs'} color={'myGray.500'} mt={0.5}>
                  {t('admin:ops_perf_stage_table_sub')}
                </Text>
              </Box>
              <FillRowTabs<'order' | 'impact'>
                list={stageSortOptions}
                value={stageSortMode}
                onChange={setStageSortMode}
                size={'sm'}
                py={1}
                px={2.5}
                labelSize={'xs'}
              />
            </Flex>

            <TableContainer>
              <Table size={'sm'} variant={'simple'}>
                <Thead>
                  <Tr>
                    <Th>{t('admin:ops_perf_col_stage')}</Th>
                    <Th isNumeric>
                      {t('admin:ops_perf_col_trigger_rate')}
                      <Text
                        fontSize={'10px'}
                        fontWeight={'normal'}
                        color={'myGray.400'}
                        textTransform={'none'}
                      >
                        {t('admin:ops_perf_col_trigger_rate_sub')}
                      </Text>
                    </Th>
                    <Th isNumeric>
                      {t('admin:ops_perf_col_stage_latency')}
                      <Text
                        fontSize={'10px'}
                        fontWeight={'normal'}
                        color={'myGray.400'}
                        textTransform={'none'}
                      >
                        {t('admin:ops_perf_col_stage_latency_sub')}
                      </Text>
                    </Th>
                    <Th w={'280px'}>
                      {t('admin:ops_perf_col_global_impact')}
                      <Text
                        fontSize={'10px'}
                        fontWeight={'normal'}
                        color={'myGray.400'}
                        textTransform={'none'}
                      >
                        {t('admin:ops_perf_col_global_impact_sub')}
                      </Text>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'xs'}>
                  {displayedStages.map((st) => {
                    const isParallel = st.group !== 'serial';
                    const impactPct = Math.min(
                      100,
                      (st.globalContributionMs / maxStageContribution) * 100
                    );
                    return (
                      <Tr key={st.key} opacity={st.triggerCount === 0 ? 0.45 : 1}>
                        <Td
                          borderLeftWidth={
                            isParallel && stageSortMode === 'order' ? '3px' : undefined
                          }
                          borderLeftColor={
                            st.group === 'parallel-vector'
                              ? 'blue.400'
                              : st.group === 'parallel-fulltext'
                                ? 'pink.400'
                                : undefined
                          }
                        >
                          <HStack spacing={2}>
                            <Text fontFamily={'mono'} color={'myGray.400'} w={'34px'}>
                              {st.step}
                            </Text>
                            <Text fontWeight={'medium'} color={'myGray.800'}>
                              {stageLabelMap[st.key] ?? st.key}
                            </Text>
                            {st.group === 'parallel-vector' && (
                              <Badge fontSize={'10px'} colorScheme={'blue'} variant={'subtle'}>
                                {t('admin:ops_perf_parallel_vector')}
                              </Badge>
                            )}
                            {st.group === 'parallel-fulltext' && (
                              <Badge fontSize={'10px'} colorScheme={'pink'} variant={'subtle'}>
                                {t('admin:ops_perf_parallel_fulltext')}
                              </Badge>
                            )}
                          </HStack>
                        </Td>
                        <Td isNumeric fontFamily={'mono'}>
                          {formatPct(st.triggerRate)}
                        </Td>
                        <Td isNumeric fontFamily={'mono'}>
                          {st.triggerCount === 0 ? (
                            <Text as={'span'} color={'myGray.400'}>
                              —
                            </Text>
                          ) : (
                            <>
                              <Text as={'span'} fontWeight={'semibold'} color={'myGray.900'}>
                                {Math.round(st.avgMs)}ms
                              </Text>
                              <Text as={'span'} color={'myGray.500'}>
                                {' '}
                                / {Math.round(st.p95Ms)}ms
                              </Text>
                            </>
                          )}
                        </Td>
                        <Td>
                          <Flex align={'center'} gap={2.5}>
                            <Box
                              flex={1}
                              h={'8px'}
                              bg={'myGray.100'}
                              borderRadius={'full'}
                              overflow={'hidden'}
                            >
                              <Box
                                h={'100%'}
                                w={`${impactPct.toFixed(1)}%`}
                                bg={
                                  st.group === 'parallel-vector'
                                    ? 'blue.500'
                                    : st.group === 'parallel-fulltext'
                                      ? 'pink.500'
                                      : 'primary.500'
                                }
                                borderRadius={'full'}
                              />
                            </Box>
                            <Text
                              w={'58px'}
                              textAlign={'right'}
                              fontFamily={'mono'}
                              fontWeight={'semibold'}
                            >
                              {Math.round(st.globalContributionMs)}ms
                            </Text>
                          </Flex>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>

          {/* Section 5: Single-Point Events Table + Waterfall Drill-down */}
          <MyBox {...CardBoxStyle} isLoading={eventsLoading && eventList.length === 0}>
            <Flex justify={'space-between'} align={'flex-start'} flexWrap={'wrap'} gap={3} mb={3}>
              <Box>
                <Text fontSize={'sm'} fontWeight={'bold'} color={'myGray.900'}>
                  {t('admin:ops_perf_events_title')}
                </Text>
                <Text fontSize={'xs'} color={'myGray.500'}>
                  {t('admin:ops_perf_events_sub')}
                </Text>
              </Box>
              <HStack spacing={2} flexWrap={'wrap'}>
                <MySelect<OpsPerfEventReason | 'all'>
                  size={'sm'}
                  width={'140px'}
                  value={eventReason}
                  list={eventReasonOptions}
                  onChange={(val) => {
                    setEventReason(val);
                  }}
                />
                <Input
                  size={'sm'}
                  w={'220px'}
                  placeholder={t('admin:ops_perf_filter_dataset_id')}
                  value={datasetIdFilter}
                  onChange={(e) => {
                    setDatasetIdFilter(e.target.value);
                  }}
                />
              </HStack>
            </Flex>

            <TableContainer>
              <Table size={'sm'} variant={'simple'}>
                <Thead>
                  <Tr>
                    <Th>{t('admin:ops_perf_col_time')}</Th>
                    <Th>{t('admin:ops_perf_col_reason')}</Th>
                    <Th>{t('common:core.dataset.search.search mode')}</Th>
                    <Th>{t('admin:ops_perf_col_dataset')}</Th>
                    <Th isNumeric>{t('admin:ops_perf_index_count')}</Th>
                    <Th isNumeric>{t('admin:ops_perf_total_duration')}</Th>
                    <Th>{t('admin:ops_perf_col_route_result')}</Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'xs'}>
                  {eventList.map((item) => {
                    const reasonMeta = reasonLabelMap[item.reason];
                    const isSelected = detailEvent?.id === item.id;
                    const allDatasets = item.datasets.length
                      ? item.datasets
                      : item.resourceIds.map((id) => ({ id, name: undefined }));
                    const primaryDataset = allDatasets[0];
                    const extraDatasets = allDatasets.slice(1);
                    const dsCount = item.detail.datasetCount ?? allDatasets.length;
                    return (
                      <Tr
                        key={item.id}
                        cursor={'pointer'}
                        bg={isSelected ? 'primary.50' : undefined}
                        _hover={{ bg: isSelected ? 'primary.50' : 'myGray.50' }}
                        onClick={() => setDetailEvent(item)}
                      >
                        <Td fontFamily={'mono'} color={'myGray.600'} whiteSpace={'nowrap'}>
                          {dayjs(item.createTime).format('MM-DD HH:mm:ss')}
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={reasonMeta.color}
                            variant={'subtle'}
                            fontSize={'11px'}
                          >
                            {reasonMeta.label}
                          </Badge>
                        </Td>
                        <Td>{modeLabelMap[item.dims.searchMode] ?? item.dims.searchMode}</Td>
                        <Td maxW={'260px'}>
                          <Flex align={'center'} gap={1.5} minW={0}>
                            <Text fontWeight={'medium'} noOfLines={1}>
                              {primaryDataset?.name || primaryDataset?.id || '-'}
                            </Text>
                            {dsCount > 1 && (
                              <MyTooltip
                                label={
                                  <Box fontSize={'xs'} maxW={'320px'}>
                                    {extraDatasets.map((ds) => (
                                      <Box key={ds.id} _notLast={{ mb: 1 }}>
                                        <Text fontWeight={'medium'} color={'myGray.900'}>
                                          {ds.name || ds.id}
                                        </Text>
                                        {ds.name && (
                                          <Text
                                            fontSize={'11px'}
                                            color={'myGray.500'}
                                            fontFamily={'mono'}
                                          >
                                            {ds.id}
                                          </Text>
                                        )}
                                      </Box>
                                    ))}
                                  </Box>
                                }
                              >
                                <Badge
                                  colorScheme={'blue'}
                                  variant={'subtle'}
                                  fontSize={'10px'}
                                  flexShrink={0}
                                >
                                  +{dsCount - 1}
                                </Badge>
                              </MyTooltip>
                            )}
                          </Flex>
                          {primaryDataset?.name && primaryDataset.id && (
                            <Text
                              fontSize={'11px'}
                              color={'myGray.500'}
                              fontFamily={'mono'}
                              noOfLines={1}
                            >
                              {primaryDataset.id}
                            </Text>
                          )}
                        </Td>
                        <Td isNumeric fontFamily={'mono'}>
                          {item.detail.totalIndexCount !== undefined
                            ? formatCompactCount(item.detail.totalIndexCount)
                            : '-'}
                        </Td>
                        <Td
                          isNumeric
                          fontFamily={'mono'}
                          fontWeight={'bold'}
                          color={
                            item.status === 'error'
                              ? 'red.600'
                              : item.status === 'degraded'
                                ? 'orange.600'
                                : 'myGray.900'
                          }
                        >
                          {formatMs(item.totalMs)}
                        </Td>
                        <Td>
                          <HStack spacing={1.5}>
                            {item.detail.pgUsesHnsw === false && (
                              <Badge colorScheme={'gray'} variant={'subtle'} fontSize={'10px'}>
                                {t('admin:ops_perf_route_pg_exact_short')}
                              </Badge>
                            )}
                            {item.detail.pgUsesHnsw === true && (
                              <Badge colorScheme={'green'} variant={'subtle'} fontSize={'10px'}>
                                HNSW
                              </Badge>
                            )}
                            {item.detail.rerankFallback && (
                              <Badge colorScheme={'orange'} variant={'subtle'} fontSize={'10px'}>
                                {t('admin:ops_perf_reason_degraded')}
                              </Badge>
                            )}
                            <Text color={'myGray.500'} fontFamily={'mono'}>
                              {item.detail.resultCount ?? '-'} {t('admin:ops_perf_unit_chunks')}
                            </Text>
                          </HStack>
                        </Td>
                      </Tr>
                    );
                  })}
                  {eventList.length === 0 && (
                    <Tr>
                      <Td colSpan={7} textAlign={'center'} color={'myGray.400'} py={8}>
                        {t('admin:ops_perf_no_events')}
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </TableContainer>

            {eventsTotal > eventsPageSize && (
              <Flex mt={4} justifyContent={'center'}>
                <EventsPagination />
              </Flex>
            )}
          </MyBox>

          {/* Single-Search Detail Waterfall Modal (v2 MyModal) */}
          <MyModal
            isOpen={Boolean(detailEvent)}
            onClose={() => setDetailEvent(undefined)}
            isCentered
            size={'xl'}
            h={'680px'}
            title={t('admin:ops_perf_waterfall_title')}
          >
            {detailEvent && (
              <EventWaterfallCard
                event={detailEvent}
                stageLabelMap={stageLabelMap}
                modeLabelMap={modeLabelMap}
              />
            )}
          </MyModal>
        </>
      )}
    </Box>
  );
}
