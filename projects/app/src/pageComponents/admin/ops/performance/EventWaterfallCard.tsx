'use client';
import React from 'react';
import { Box, Flex, Grid, HStack, Text } from '@chakra-ui/react';
import dayjs from 'dayjs';
import {
  DATASET_SEARCH_STAGE_SPECS,
  type OpsPerfErrorCode
} from '@fastgpt/global/common/opsPerf/constants';
import type { DatasetSearchPerfEventItem } from '@fastgpt/global/openapi/admin/ops/performance';
import MyTag, { type ColorSchemaType } from '@fastgpt/web/components/common/Tag';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const STAGE_COLOR_MAP: Record<string, string> = {
  queryExtension: '#8B5CF6',
  imageCaption: '#A855F7',
  filter: '#0EA5E9',
  embeddingApi: '#3B82F6',
  vectorRoute: '#6366F1',
  vectorLeaseWait: '#F59E0B',
  vectorRecall: '#EF4444',
  vectorHydrate: '#06B6D4',
  fullTextRecall: '#EC4899',
  fullTextHydrate: '#F472B6',
  rerank: '#10B981',
  postProcess: '#64748B'
};

type EventWaterfallCardProps = {
  event: DatasetSearchPerfEventItem;
  stageLabelMap: Record<string, string>;
  modeLabelMap: Record<string, string>;
};

/** 渲染单次知识库检索的阶段耗时瀑布图与脱敏诊断特征。 */
export const EventWaterfallCard = ({
  event,
  stageLabelMap,
  modeLabelMap
}: EventWaterfallCardProps) => {
  const { t } = useSafeTranslation();

  /** 按错误码穷尽映射静态字面量翻译 key，确保 i18n 静态提取与未使用清理脚本可识别。 */
  const resolveErrorCodeLabel = (code: OpsPerfErrorCode): string => {
    switch (code) {
      case 'RERANK_FALLBACK':
        return t('admin:ops_perf_err_rerank_fallback');
      case 'SYNONYM_RERANK_FALLBACK':
        return t('admin:ops_perf_err_synonym_rerank_fallback');
      case 'QUERY_EXTENSION_FALLBACK':
        return t('admin:ops_perf_err_query_extension_fallback');
      case 'QUERY_EXTENSION_ERROR':
        return t('admin:ops_perf_err_query_extension_error');
      case 'VECTOR_LEASE_TIMEOUT':
        return t('admin:ops_perf_err_vector_lease_timeout');
      case 'VECTOR_LEASE_ACQUIRE_ERROR':
        return t('admin:ops_perf_err_vector_lease_acquire_error');
      case 'VECTOR_LEASE_LOST':
        return t('admin:ops_perf_err_vector_lease_lost');
      case 'VECTOR_RECALL_ERROR':
        return t('admin:ops_perf_err_vector_recall_error');
      case 'EMBEDDING_ERROR':
        return t('admin:ops_perf_err_embedding_error');
      case 'FULLTEXT_RECALL_ERROR':
        return t('admin:ops_perf_err_fulltext_recall_error');
      case 'FILTER_ERROR':
        return t('admin:ops_perf_err_filter_error');
      case 'IMAGE_CAPTION_ERROR':
        return t('admin:ops_perf_err_image_caption_error');
      case 'POST_PROCESS_ERROR':
        return t('admin:ops_perf_err_post_process_error');
      case 'SEARCH_ERROR':
        return t('admin:ops_perf_err_search_error');
      default: {
        const _exhaustive: never = code;
        void _exhaustive;
        return t('admin:ops_perf_err_search_error');
      }
    }
  };

  const bars = DATASET_SEARCH_STAGE_SPECS.map((spec) => {
    const timing = event.stages[spec.key];
    if (!timing) return null;
    const spanEndMs = timing.endOffsetMs ?? timing.offsetMs + timing.ms;
    return {
      key: spec.key,
      step: spec.step,
      group: spec.group,
      label: stageLabelMap[spec.key] ?? spec.key,
      offsetMs: timing.offsetMs,
      ms: timing.ms,
      spanEndMs,
      callCount: timing.callCount ?? 1,
      errorCount: timing.errorCount ?? 0,
      color: STAGE_COLOR_MAP[spec.key] ?? '#3B82F6'
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const axisMaxMs = Math.max(event.totalMs, ...bars.map((bar) => bar.spanEndMs), 1);

  const statusColorScheme: ColorSchemaType =
    event.status === 'error' ? 'red' : event.status === 'degraded' ? 'yellow' : 'green';
  const statusLabel =
    event.status === 'error'
      ? t('admin:ops_perf_status_error')
      : event.status === 'degraded'
        ? t('admin:ops_perf_status_degraded')
        : t('admin:ops_perf_status_ok');

  const datasetList =
    event.datasets.length > 0
      ? event.datasets
      : event.resourceIds.map((id) => ({ id, name: undefined }));

  return (
    <Box>
      {/* Header */}
      <Flex
        justify={'space-between'}
        align={'flex-start'}
        flexWrap={'wrap'}
        gap={3}
        pb={3}
        mb={3}
        borderBottom={'1px solid'}
        borderColor={'myGray.150'}
      >
        <Box>
          <HStack spacing={2} flexWrap={'wrap'}>
            <MyTag type={'borderFill'} colorSchema={statusColorScheme}>
              {statusLabel}
            </MyTag>
            <MyTag type={'borderFill'} colorSchema={'blue'}>
              {modeLabelMap[event.dims.searchMode] ?? event.dims.searchMode}
            </MyTag>
            {event.detail.pgUsesHnsw === false && (
              <MyTag type={'borderFill'} colorSchema={'gray'}>
                {t('admin:ops_perf_route_pg_exact')}
              </MyTag>
            )}
            {event.detail.pgUsesHnsw === true && (
              <MyTag type={'borderFill'} colorSchema={'green'}>
                {t('admin:ops_perf_route_pg_hnsw')}
              </MyTag>
            )}
          </HStack>
          <Text fontSize={'xs'} color={'myGray.500'} mt={1.5} fontFamily={'mono'}>
            {dayjs(event.createTime).format('YYYY-MM-DD HH:mm:ss.SSS')}
          </Text>
        </Box>
        <Box textAlign={'right'}>
          <Text fontSize={'xs'} color={'myGray.500'}>
            {t('admin:ops_perf_total_duration')}
          </Text>
          <Text fontSize={'lg'} fontWeight={'bold'} fontFamily={'mono'} color={'primary.600'}>
            {Math.round(event.totalMs).toLocaleString()} ms
          </Text>
        </Box>
      </Flex>

      {/* Involved datasets list */}
      {datasetList.length > 0 && (
        <Box mb={3.5}>
          <Text fontSize={'xs'} color={'myGray.500'} mb={1.5}>
            {t('admin:ops_perf_datasets_label')} ({datasetList.length})
          </Text>
          <Flex flexWrap={'wrap'} gap={2}>
            {datasetList.map((ds) => (
              <Flex
                key={ds.id}
                align={'center'}
                gap={1.5}
                px={2.5}
                py={1}
                bg={'myGray.50'}
                borderWidth={'1px'}
                borderColor={'myGray.200'}
                borderRadius={'md'}
                fontSize={'xs'}
              >
                <Text fontWeight={'medium'} color={'myGray.800'}>
                  {ds.name || ds.id}
                </Text>
                {ds.name && (
                  <Text color={'myGray.500'} fontFamily={'mono'} fontSize={'11px'}>
                    {ds.id}
                  </Text>
                )}
              </Flex>
            ))}
          </Flex>
        </Box>
      )}

      {/* Diagnostic metadata summary */}
      <Grid
        templateColumns={['repeat(2, 1fr)', 'repeat(3, 1fr)']}
        gap={3}
        mb={4}
        p={3.5}
        bg={'myGray.50'}
        borderRadius={'md'}
        fontSize={'xs'}
      >
        <Box>
          <Text color={'myGray.500'}>{t('admin:ops_perf_index_count')}</Text>
          <Text fontWeight={'semibold'} fontFamily={'mono'} color={'myGray.900'} mt={0.5}>
            {event.detail.totalIndexCount !== undefined
              ? event.detail.totalIndexCount.toLocaleString()
              : '-'}
          </Text>
        </Box>
        <Box>
          <Text color={'myGray.500'}>{t('admin:ops_perf_candidates_results')}</Text>
          <Text fontWeight={'semibold'} fontFamily={'mono'} color={'myGray.900'} mt={0.5}>
            {event.detail.candidateCount ?? '-'} → {event.detail.resultCount ?? '-'}
          </Text>
        </Box>
        <Box>
          <Text color={'myGray.500'}>{t('admin:ops_perf_query_meta')}</Text>
          <Text fontWeight={'semibold'} fontFamily={'mono'} color={'myGray.900'} mt={0.5}>
            {t('admin:ops_perf_query_meta_value', {
              queries: event.detail.queryCount ?? 1,
              chars: event.detail.queryChars ?? 0
            })}
            {event.detail.hasMetadataFilter ? ` · ${t('admin:ops_perf_metadata_filter')}` : ''}
          </Text>
        </Box>
        <Box>
          <Text color={'myGray.500'}>{t('admin:ops_perf_embedding_model')}</Text>
          <Text
            fontWeight={'semibold'}
            fontFamily={'mono'}
            color={'myGray.900'}
            mt={0.5}
            noOfLines={1}
            title={event.detail.embeddingModel || '-'}
          >
            {event.detail.embeddingModel || '-'}
          </Text>
        </Box>
        <Box>
          <Text color={'myGray.500'}>{t('admin:ops_perf_rerank_model')}</Text>
          <Text
            fontWeight={'semibold'}
            fontFamily={'mono'}
            color={'myGray.900'}
            mt={0.5}
            noOfLines={1}
            title={event.detail.rerankModel || '-'}
          >
            {event.detail.rerankModel || '-'}
          </Text>
        </Box>
        <Box>
          <Text color={'myGray.500'}>{t('admin:ops_perf_extension_model')}</Text>
          <Text
            fontWeight={'semibold'}
            fontFamily={'mono'}
            color={'myGray.900'}
            mt={0.5}
            noOfLines={1}
            title={event.detail.extensionModel || '-'}
          >
            {event.detail.extensionModel || '-'}
          </Text>
        </Box>
      </Grid>

      {event.errorCode && (
        <Box
          mb={3}
          px={3}
          py={2}
          bg={event.status === 'error' ? 'red.50' : 'orange.50'}
          borderRadius={'md'}
          borderWidth={'1px'}
          borderColor={event.status === 'error' ? 'red.200' : 'orange.200'}
          fontSize={'xs'}
          color={event.status === 'error' ? 'red.700' : 'orange.700'}
        >
          {resolveErrorCodeLabel(event.errorCode)}
        </Box>
      )}

      {/* Waterfall bars */}
      {bars.length === 0 ? (
        <Text fontSize={'xs'} color={'myGray.500'} py={3} textAlign={'center'}>
          {t('admin:ops_perf_no_stage_data')}
        </Text>
      ) : (
        <Box>
          <Flex justify={'space-between'} fontSize={'11px'} color={'myGray.400'} mb={1.5} px={1}>
            <Text w={'255px'}>{t('admin:ops_perf_col_stage')}</Text>
            <Flex flex={1} justify={'space-between'} px={2}>
              <Text>0 ms</Text>
              <Text>{Math.round(axisMaxMs / 2).toLocaleString()} ms</Text>
              <Text>{Math.round(axisMaxMs).toLocaleString()} ms</Text>
            </Flex>
            <Text w={'84px'} textAlign={'right'}>
              {t('admin:ops_perf_col_duration')}
            </Text>
          </Flex>
          {bars.map((bar) => {
            const leftPct = Math.min(98, (bar.offsetMs / axisMaxMs) * 100);
            const widthPct = Math.max(1.2, Math.min(100 - leftPct, (bar.ms / axisMaxMs) * 100));
            const hasRetryGap = bar.spanEndMs > bar.offsetMs + bar.ms + 0.5;
            const spanWidthPct = hasRetryGap
              ? Math.max(
                  widthPct,
                  Math.min(100 - leftPct, ((bar.spanEndMs - bar.offsetMs) / axisMaxMs) * 100)
                )
              : 0;
            const barColor = bar.errorCount > 0 ? 'red.500' : bar.color;
            return (
              <Flex key={bar.key} align={'center'} py={1.5} px={1} fontSize={'xs'}>
                <Flex w={'255px'} flexShrink={0} align={'center'} gap={1.5} pr={2}>
                  <Text w={'34px'} fontFamily={'mono'} color={'myGray.400'} fontSize={'11px'}>
                    {bar.step}
                  </Text>
                  <Text color={'myGray.800'} fontWeight={'medium'} noOfLines={1}>
                    {bar.label}
                  </Text>
                  {bar.callCount > 1 && (
                    <Text fontFamily={'mono'} fontSize={'10px'} color={'myGray.500'} flexShrink={0}>
                      ×{bar.callCount}
                    </Text>
                  )}
                  {bar.group !== 'serial' && (
                    <MyTag
                      type={'borderFill'}
                      colorSchema={bar.group === 'parallel-vector' ? 'blue' : 'pink'}
                      fontSize={'10px'}
                      px={1.5}
                      py={0.5}
                      flexShrink={0}
                    >
                      ∥
                    </MyTag>
                  )}
                </Flex>

                <Box
                  flex={1}
                  h={'16px'}
                  bg={'myGray.100'}
                  borderRadius={'sm'}
                  position={'relative'}
                  overflow={'hidden'}
                  mx={2}
                >
                  {hasRetryGap && (
                    <Box
                      position={'absolute'}
                      top={'2px'}
                      bottom={'2px'}
                      left={`${leftPct.toFixed(2)}%`}
                      width={`${spanWidthPct.toFixed(2)}%`}
                      bg={barColor}
                      opacity={0.22}
                      borderRadius={'sm'}
                    />
                  )}
                  <Box
                    position={'absolute'}
                    top={'2px'}
                    bottom={'2px'}
                    left={`${leftPct.toFixed(2)}%`}
                    width={`${widthPct.toFixed(2)}%`}
                    bg={barColor}
                    borderRadius={'sm'}
                  />
                </Box>

                <Text
                  w={'84px'}
                  flexShrink={0}
                  textAlign={'right'}
                  fontFamily={'mono'}
                  fontWeight={'semibold'}
                  color={bar.errorCount > 0 ? 'red.600' : 'myGray.900'}
                >
                  {Math.round(bar.ms).toLocaleString()} ms
                </Text>
              </Flex>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
