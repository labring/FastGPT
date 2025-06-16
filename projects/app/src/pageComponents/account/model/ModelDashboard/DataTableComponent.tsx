import React, { useMemo, useState } from 'react';
import { Table, TableContainer, Thead, Tbody, Tr, Th, Td, Button } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { DashboardDataItemType } from '@/global/aiproxy/type.d';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type DashboardDataEntry = {
  timestamp: number;
  summary: DashboardDataItemType[];
};

export type DataTableComponentProps = {
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
      inputPrice?: number;
      outputPrice?: number;
      charsPointsPrice?: number;
    }
  >;
  onViewDetail: (model: string) => void;
};

type SortFieldType = 'totalCalls' | 'errorCalls' | 'totalCost';

const DataTableComponent = ({
  data,
  filterProps,
  onViewDetail,
  channelList,
  modelPriceMap
}: DataTableComponentProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const [sortField, setSortField] = useState<SortFieldType>('totalCalls');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

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
        }
      >();

      data.forEach((dayData) => {
        const summary = dayData.summary;

        summary.forEach((item: DashboardDataItemType) => {
          const channelId = `${item.channel_id!}`;
          const existing = channelMap.get(channelId) || {
            model: item.model || '-',
            totalCalls: 0,
            errorCalls: 0,
            totalCost: 0,
            totalResponseTime: 0,
            totalTtfb: 0
          };

          existing.totalCalls += item.request_count || 0;
          existing.errorCalls += item.exception_count || 0;
          existing.totalResponseTime += item.total_time_milliseconds || 0;
          existing.totalTtfb += item.total_ttfb_milliseconds || 0;

          const modelPricing = modelPriceMap.get(item.model);
          if (modelPricing) {
            const inputTokens = item.input_tokens || 0;
            const outputTokens = item.output_tokens || 0;
            const isIOPriceType =
              typeof modelPricing.inputPrice === 'number' && modelPricing.inputPrice > 0;

            const totalPoints = isIOPriceType
              ? (modelPricing.inputPrice || 0) * (inputTokens / 1000) +
                (modelPricing.outputPrice || 0) * (outputTokens / 1000)
              : ((modelPricing.charsPointsPrice || 0) * (inputTokens + outputTokens)) / 1000;

            existing.totalCost += totalPoints;
          }

          channelMap.set(channelId, existing);
        });
      });

      channelMap.forEach((item, channelId) => {
        const successCalls = item.totalCalls - item.errorCalls;

        rows.push({
          channelName: channelIdToNameMap.get(parseInt(channelId)) || '',
          model: item.model,
          totalCalls: item.totalCalls,
          errorCalls: item.errorCalls,
          totalCost: Math.floor(item.totalCost),
          avgResponseTime: successCalls > 0 ? item.totalResponseTime / successCalls / 1000 : 0,
          avgTtfb: successCalls > 0 ? item.totalTtfb / successCalls / 1000 : 0
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
        }
      >();

      data.forEach((dayData) => {
        const summary = dayData.summary;

        summary.forEach((item: DashboardDataItemType) => {
          const modelName = item.model || '-';
          const existing = modelMap.get(modelName) || {
            totalCalls: 0,
            errorCalls: 0,
            totalCost: 0,
            totalResponseTime: 0,
            totalTtfb: 0
          };

          existing.totalCalls += item.request_count || 0;
          existing.errorCalls += item.exception_count || 0;
          existing.totalResponseTime += item.total_time_milliseconds || 0;
          existing.totalTtfb += item.total_ttfb_milliseconds || 0;

          const modelPricing = modelPriceMap.get(item.model);
          if (modelPricing) {
            const inputTokens = item.input_tokens || 0;
            const outputTokens = item.output_tokens || 0;
            const isIOPriceType =
              typeof modelPricing.inputPrice === 'number' && modelPricing.inputPrice > 0;

            const totalPoints = isIOPriceType
              ? (modelPricing.inputPrice || 0) * (inputTokens / 1000) +
                (modelPricing.outputPrice || 0) * (outputTokens / 1000)
              : ((modelPricing.charsPointsPrice || 0) * (inputTokens + outputTokens)) / 1000;

            existing.totalCost += totalPoints;
          }

          modelMap.set(modelName, existing);
        });
      });

      modelMap.forEach((item, modelName) => {
        const successCalls = item.totalCalls - item.errorCalls;
        rows.push({
          model: modelName,
          totalCalls: item.totalCalls,
          errorCalls: item.errorCalls,
          totalCost: Math.floor(item.totalCost),
          avgResponseTime: successCalls > 0 ? item.totalResponseTime / successCalls / 1000 : 0,
          avgTtfb: successCalls > 0 ? item.totalTtfb / successCalls / 1000 : 0
        });
      });
    }

    // sort
    if (sortField) {
      rows.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }

    return rows;
  }, [data, showChannelColumn, sortField, modelPriceMap, channelIdToNameMap, sortDirection]);

  const handleSort = (field: SortFieldType) => {
    if (sortField === field) {
      // Toggle between desc and asc
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // Switch to new field, default to desc
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortFieldType) => {
    if (sortField !== field) return null;
    return sortDirection === 'desc' ? '↓' : '↑';
  };

  return (
    <MyBox h={'100%'}>
      <TableContainer fontSize={'sm'}>
        <Table>
          <Thead>
            <Tr userSelect={'none'}>
              <Th>{t('account_model:dashboard_model')}</Th>
              {showChannelColumn && <Th>{t('account_model:dashboard_channel')}</Th>}
              <Th
                cursor="pointer"
                onClick={() => handleSort('totalCalls')}
                _hover={{ color: 'primary.600' }}
              >
                {t('account_model:total_call_volume')} {getSortIcon('totalCalls')}
              </Th>
              <Th
                cursor="pointer"
                onClick={() => handleSort('errorCalls')}
                _hover={{ color: 'primary.600' }}
              >
                {t('account_model:volunme_of_failed_calls')} {getSortIcon('errorCalls')}
              </Th>
              {feConfigs?.isPlus && (
                <Th
                  cursor="pointer"
                  onClick={() => handleSort('totalCost')}
                  _hover={{ color: 'primary.600' }}
                >
                  {t('account_model:aipoint_usage')} {getSortIcon('totalCost')}
                </Th>
              )}
              <Th>{t('account_model:avg_response_time')}</Th>
              <Th>{t('account_model:avg_ttfb')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {tableData.map((item, index) => (
              <Tr key={index}>
                <Td>{item.model}</Td>
                {showChannelColumn && <Td>{item.channelName}</Td>}
                <Td color={'primary.700'}>{formatNumber(item.totalCalls).toLocaleString()}</Td>
                <Td color={'red.700'}>{formatNumber(item.errorCalls)}</Td>
                {feConfigs?.isPlus && <Td>{formatNumber(item.totalCost).toLocaleString()}</Td>}
                <Td color={item.avgResponseTime > 10 ? 'yellow.700' : ''}>
                  {item.avgResponseTime > 0 ? `${item.avgResponseTime.toFixed(2)}` : '-'}
                </Td>
                <Td>{item.avgTtfb > 0 ? `${item.avgTtfb.toFixed(2)}` : '-'}</Td>
                <Td>
                  <Button
                    leftIcon={<MyIcon name={'menu'} w={'1rem'} />}
                    size={'sm'}
                    variant={'whiteBase'}
                    onClick={() => onViewDetail(item.model)}
                  >
                    {t('account_model:detail')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      {tableData.length === 0 && <EmptyTip text={t('account_model:dashboard_no_data')} />}
    </MyBox>
  );
};

export default DataTableComponent;
