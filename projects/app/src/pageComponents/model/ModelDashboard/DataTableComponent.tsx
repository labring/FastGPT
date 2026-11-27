import React, { useMemo, useState } from 'react';
import { Box, HStack, Table, Thead, Tbody, Tr, Th, Td, Button } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { ChannelDashboardSummary } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { calculateModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import type { ModelPricingType } from '@fastgpt/global/core/ai/model/schema';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import type { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { calcAvgTps, getNextSortState, type SortDirection, type SortState } from './utils';

type DashboardDataEntry = {
  timestamp: number;
  summary: ChannelDashboardSummary[];
};

type DataTableComponentProps = {
  data: DashboardDataEntry[];
  filterProps: {
    channelId?: string;
    model?: string;
  };
  channelList: {
    label: string;
    value: string;
  }[];
  modelPriceMap: Map<
    string,
    {
      name?: string;
      avatar?: string;
      pricing?: ModelPricingType;
      scope?: ModelScopeEnum;
      type?: ModelTypeEnum;
    }
  >;
  onViewDetail: (model: string) => void;
  isLLMModel: (model: string) => boolean;
};

type SortFieldType =
  | 'totalCalls'
  | 'errorCalls'
  | 'totalCost'
  | 'avgResponseTime'
  | 'avgTtfb'
  | 'avgTps'
  | 'cacheHitRate';

/** 双箭头排序图标：未排序双灰，升序高亮上箭头，降序高亮下箭头。 */
const SortArrowIcon = ({ direction }: { direction: SortDirection }) => {
  const upColor =
    direction === 'asc'
      ? 'var(--chakra-colors-primary-600)'
      : direction === 'desc'
        ? 'var(--chakra-colors-myGray-300)'
        : 'var(--chakra-colors-myGray-400)';
  const downColor =
    direction === 'desc'
      ? 'var(--chakra-colors-primary-600)'
      : direction === 'asc'
        ? 'var(--chakra-colors-myGray-300)'
        : 'var(--chakra-colors-myGray-400)';

  return (
    <Box
      as="svg"
      w="14px"
      h="14px"
      viewBox="0 0 16 16"
      fill="none"
      flexShrink={0}
      aria-hidden="true"
      data-sort-direction={direction ?? 'none'}
    >
      <path
        d="M5.25 12.5V3.5M5.25 3.5L2.75 6M5.25 3.5L7.75 6"
        stroke={upColor}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.75 3.5V12.5M10.75 12.5L8.25 10M10.75 12.5L13.25 10"
        stroke={downColor}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Box>
  );
};

const DataTableComponent = ({
  data,
  filterProps,
  onViewDetail,
  channelList,
  modelPriceMap,
  isLLMModel
}: DataTableComponentProps) => {
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();
  const showBilling = !!feConfigs?.isPlus;
  const [sortState, setSortState] = useState<SortState<SortFieldType>>({
    field: 'totalCalls',
    direction: 'desc'
  });

  // Create a mapping from channel ID to channel name
  const channelIdToNameMap = useMemo(() => {
    const map = new Map<number, string>();
    channelList.forEach((channel) => {
      if (channel.value && channel.value !== '') {
        const channelId = parseInt(channel.value);
        if (!isNaN(channelId)) {
          map.set(channelId, channel.label);
        }
      }
    });
    return map;
  }, [channelList]);

  // display the channel column
  const showChannelColumn = !!filterProps.model;
  const tableMinWidth = showChannelColumn
    ? showBilling
      ? '1470px'
      : '1340px'
    : showBilling
      ? '1330px'
      : '1200px';

  const tableData = useMemo(() => {
    if (data.length === 0) {
      return [];
    }

    const rows: {
      model: string;
      channelName?: string;
      totalCalls: number;
      errorCalls: number;
      totalCost: number;
      avgResponseTime: number;
      avgTtfb: number;
      avgTps: number;
      cacheHitRate: number;
    }[] = [];

    if (showChannelColumn) {
      // When a specific model is selected, aggregate the data by channel_id
      const channelMap = new Map<
        string,
        {
          model: string;
          totalCalls: number;
          errorCalls: number;
          totalCost: number;
          totalResponseTime: number;
          totalTtfb: number;
          outputTokens: number;
          cacheHitCount: number;
          llmRequestCount: number;
        }
      >();

      data.forEach((dayData) => {
        const summary = dayData.summary;

        summary.forEach((item: ChannelDashboardSummary) => {
          const channelId = `${item.channel_id!}`;
          const existing = channelMap.get(channelId) || {
            model: item.model || '-',
            totalCalls: 0,
            errorCalls: 0,
            totalCost: 0,
            totalResponseTime: 0,
            totalTtfb: 0,
            outputTokens: 0,
            cacheHitCount: 0,
            llmRequestCount: 0
          };

          existing.totalCalls += item.request_count || 0;
          existing.errorCalls += item.exception_count || 0;
          existing.totalResponseTime += item.total_time_milliseconds || 0;
          existing.totalTtfb += item.total_ttfb_milliseconds || 0;
          existing.outputTokens += item.output_tokens || 0;
          existing.cacheHitCount += item.cache_hit_count || 0;
          if (isLLMModel(item.model)) {
            existing.llmRequestCount += item.request_count || 0;
          }

          const modelPricing = modelPriceMap.get(item.model);
          if (modelPricing) {
            const inputTokens = item.input_tokens || 0;
            const outputTokens = item.output_tokens || 0;
            const { totalPoints } = calculateModelPrice({
              config: modelPricing,
              inputTokens,
              outputTokens,
              cacheReadTokens: item.cached_tokens,
              cacheCreationTokens: item.cache_creation_tokens
            });

            existing.totalCost += totalPoints;
          }

          channelMap.set(channelId, existing);
        });
      });

      channelMap.forEach((item, channelId) => {
        const successCalls = item.totalCalls - item.errorCalls;
        const cacheHitRate =
          item.llmRequestCount === 0 ? 0 : formatNumber(item.cacheHitCount / item.llmRequestCount);

        rows.push({
          channelName: channelIdToNameMap.get(parseInt(channelId)) || '',
          model: item.model,
          totalCalls: item.totalCalls,
          errorCalls: item.errorCalls,
          totalCost: item.totalCost,
          avgResponseTime: successCalls > 0 ? item.totalResponseTime / successCalls / 1000 : 0,
          avgTtfb: successCalls > 0 ? item.totalTtfb / successCalls / 1000 : 0,
          avgTps: isLLMModel(item.model)
            ? calcAvgTps(item.outputTokens, item.totalResponseTime)
            : 0,
          cacheHitRate
        });
      });
    } else {
      // When no specific model is selected, aggregate the data by the model.
      const modelMap = new Map<
        string,
        {
          totalCalls: number;
          errorCalls: number;
          totalCost: number;
          totalResponseTime: number;
          totalTtfb: number;
          outputTokens: number;
          cacheHitCount: number;
          llmRequestCount: number;
        }
      >();

      data.forEach((dayData) => {
        const summary = dayData.summary;

        summary.forEach((item: ChannelDashboardSummary) => {
          const modelName = item.model || '-';
          const existing = modelMap.get(modelName) || {
            totalCalls: 0,
            errorCalls: 0,
            totalCost: 0,
            totalResponseTime: 0,
            totalTtfb: 0,
            outputTokens: 0,
            cacheHitCount: 0,
            llmRequestCount: 0
          };

          existing.totalCalls += item.request_count || 0;
          existing.errorCalls += item.exception_count || 0;
          existing.totalResponseTime += item.total_time_milliseconds || 0;
          existing.totalTtfb += item.total_ttfb_milliseconds || 0;
          existing.outputTokens += item.output_tokens || 0;
          existing.cacheHitCount += item.cache_hit_count || 0;
          if (isLLMModel(modelName)) {
            existing.llmRequestCount += item.request_count || 0;
          }

          const modelPricing = modelPriceMap.get(item.model);
          if (modelPricing) {
            const inputTokens = item.input_tokens || 0;
            const outputTokens = item.output_tokens || 0;
            const { totalPoints } = calculateModelPrice({
              config: modelPricing,
              inputTokens,
              outputTokens,
              cacheReadTokens: item.cached_tokens,
              cacheCreationTokens: item.cache_creation_tokens
            });

            existing.totalCost += totalPoints;
          }

          modelMap.set(modelName, existing);
        });
      });

      modelMap.forEach((item, modelName) => {
        const successCalls = item.totalCalls - item.errorCalls;
        const cacheHitRate =
          item.llmRequestCount === 0 ? 0 : formatNumber(item.cacheHitCount / item.llmRequestCount);
        rows.push({
          model: modelName,
          totalCalls: item.totalCalls,
          errorCalls: item.errorCalls,
          totalCost: item.totalCost,
          avgResponseTime: successCalls > 0 ? item.totalResponseTime / successCalls / 1000 : 0,
          avgTtfb: successCalls > 0 ? item.totalTtfb / successCalls / 1000 : 0,
          avgTps: isLLMModel(modelName) ? calcAvgTps(item.outputTokens, item.totalResponseTime) : 0,
          cacheHitRate
        });
      });
    }

    // sort
    if (sortState.field && sortState.direction) {
      const { field, direction } = sortState;
      rows.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        return direction === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    return rows;
  }, [data, showChannelColumn, sortState, modelPriceMap, channelIdToNameMap, isLLMModel]);

  const handleSort = (field: SortFieldType) => {
    setSortState((prev) => getNextSortState(prev, field));
  };

  const getFieldSortDirection = (field: SortFieldType): SortDirection =>
    sortState.field === field ? sortState.direction : null;

  const renderSortableTh = ({
    field,
    label,
    textTransform
  }: {
    field: SortFieldType;
    label: string;
    textTransform?: 'none';
  }) => {
    const direction = getFieldSortDirection(field);
    const ariaSort =
      direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';

    return (
      <Th
        cursor="pointer"
        textTransform={textTransform}
        aria-sort={ariaSort}
        color={direction ? 'primary.600' : undefined}
        onClick={() => handleSort(field)}
        _hover={{ color: 'primary.600' }}
      >
        <HStack spacing={1} alignItems="center">
          <Box>{label}</Box>
          <SortArrowIcon direction={direction} />
        </HStack>
      </Th>
    );
  };

  return (
    <MyBox h={'100%'} minH={0} display="flex" flexDirection="column" overflow="hidden">
      <FixedTableLayout
        scrollMode="normal"
        bodyProps={{ fontSize: 'sm' }}
        renderHeader={({ headerTableWidth }) => (
          <Table
            minW={tableMinWidth}
            sx={{
              tableLayout: 'fixed',
              width: `${headerTableWidth} !important`
            }}
          >
            <colgroup>
              <col style={{ width: '200px' }} />
              {showChannelColumn && <col style={{ width: '140px' }} />}
              <col style={{ width: '130px' }} />
              <col style={{ width: '140px' }} />
              {showBilling && <col style={{ width: '130px' }} />}
              <col style={{ width: '160px' }} />
              <col style={{ width: '160px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '160px' }} />
            </colgroup>
            <Thead>
              <Tr userSelect={'none'}>
                <Th>{t('config_model:dashboard_model')}</Th>
                {showChannelColumn && <Th>{t('config_model:dashboard_channel')}</Th>}
                {renderSortableTh({
                  field: 'totalCalls',
                  label: t('config_model:model_request_times')
                })}
                {renderSortableTh({
                  field: 'errorCalls',
                  label: t('config_model:model_error_request_times')
                })}
                {showBilling &&
                  renderSortableTh({
                    field: 'totalCost',
                    label: t('config_model:aipoint_usage')
                  })}
                {renderSortableTh({
                  field: 'avgResponseTime',
                  label: t('config_model:avg_response_time')
                })}
                {renderSortableTh({
                  field: 'avgTtfb',
                  label: t('config_model:avg_ttfb')
                })}
                {renderSortableTh({
                  field: 'avgTps',
                  label: t('config_model:avg_tps'),
                  textTransform: 'none'
                })}
                {renderSortableTh({
                  field: 'cacheHitRate',
                  label: t('config_model:cache_hit_rate')
                })}
                <Th></Th>
              </Tr>
            </Thead>
          </Table>
        )}
        renderBody={() => (
          <>
            <Table minW={tableMinWidth} sx={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '200px' }} />
                {showChannelColumn && <col style={{ width: '140px' }} />}
                <col style={{ width: '130px' }} />
                <col style={{ width: '140px' }} />
                {showBilling && <col style={{ width: '130px' }} />}
                <col style={{ width: '160px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '160px' }} />
              </colgroup>
              <Tbody>
                {tableData.map((item, index) => {
                  const modelMeta = modelPriceMap.get(item.model);
                  const displayName = modelMeta?.name || item.model;
                  const avatarSrc = modelMeta?.avatar || HUGGING_FACE_ICON;

                  return (
                    <Tr key={index}>
                      <Td>
                        <HStack spacing={2} minW={0}>
                          <Avatar
                            src={avatarSrc}
                            w={'1.15rem'}
                            borderRadius={'50%'}
                            flexShrink={0}
                          />
                          <Box noOfLines={1} title={displayName}>
                            {displayName}
                          </Box>
                        </HStack>
                      </Td>
                      {showChannelColumn && <Td>{item.channelName}</Td>}
                      <Td color={'primary.700'}>
                        {formatNumber(item.totalCalls).toLocaleString()}
                      </Td>
                      <Td color={'red.700'}>{formatNumber(item.errorCalls)}</Td>
                      {showBilling && <Td>{formatNumber(item.totalCost, 100).toLocaleString()}</Td>}
                      <Td color={item.avgResponseTime > 10 ? 'yellow.700' : ''}>
                        {item.avgResponseTime > 0 ? `${item.avgResponseTime.toFixed(2)}` : '-'}
                      </Td>
                      <Td>{item.avgTtfb > 0 ? `${item.avgTtfb.toFixed(2)}` : '-'}</Td>
                      <Td>
                        {isLLMModel(item.model) && item.avgTps > 0 ? item.avgTps.toFixed(2) : '-'}
                      </Td>
                      <Td>
                        {isLLMModel(item.model)
                          ? `${formatNumber(item.cacheHitRate).toLocaleString()}`
                          : '-'}
                      </Td>
                      <Td>
                        <Button
                          leftIcon={<MyIcon name={'menu'} w={'1rem'} />}
                          size={'sm'}
                          variant={'whiteBase'}
                          onClick={() => onViewDetail(item.model)}
                        >
                          {t('config_model:detail')}
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
            {tableData.length === 0 && <EmptyTip text={t('config_model:dashboard_no_data')} />}
          </>
        )}
      />
    </MyBox>
  );
};

export default DataTableComponent;
