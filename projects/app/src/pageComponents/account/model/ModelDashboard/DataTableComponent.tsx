import React, { useMemo, useState } from 'react';
import { Table, TableContainer, Thead, Tbody, Tr, Th, Td, Button } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { DashboardDataItemType } from '@/global/aiproxy/type.d';

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
  systemModelList: {
    model: string;
    inputPrice?: number;
    outputPrice?: number;
    charsPointsPrice?: number;
  }[];
  channelIdToNameMap: Map<number, string>;
  onViewDetail: (model: string) => void;
};

const DataTableComponent = ({
  data,
  filterProps,
  systemModelList,
  channelIdToNameMap,
  onViewDetail
}: DataTableComponentProps) => {
  const { t } = useTranslation();
  const [sortField, setSortField] = useState<'totalCalls' | 'errorCalls' | null>('totalCalls');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // display the channel column
  const showChannelColumn = !!filterProps.model;

  const tableData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    const rows: {
      model: string;
      channel_id?: string;
      channel_name?: string;
      totalCalls: number;
      errorCalls: number;
      avgResponseTime: number;
      avgTtfb: number;
    }[] = [];

    if (showChannelColumn) {
      data.forEach((dayData) => {
        const summary = dayData.summary || [];
        const modelsToProcess = summary.filter(
          (model: DashboardDataItemType) => model.model === filterProps.model
        );

        modelsToProcess.forEach((model: DashboardDataItemType) => {
          const channelId = model.channel_id ?? 0;
          const channelName = channelIdToNameMap.get(channelId);

          rows.push({
            model: model.model || '-',
            channel_id: `${channelId}`,
            channel_name: channelName,
            totalCalls: model.request_count || 0,
            errorCalls: model.exception_count || 0,
            avgResponseTime: model.total_time_milliseconds
              ? model.total_time_milliseconds / 1000
              : 0,
            avgTtfb: model.total_ttfb_milliseconds ? model.total_ttfb_milliseconds / 1000 : 0
          });
        });
      });
    } else {
      // When no specific model is selected, aggregate the data by the model.
      const modelMap = new Map<
        string,
        {
          totalCalls: number;
          errorCalls: number;
          totalResponseTime: number;
          totalTtfb: number;
          count: number;
        }
      >();

      data.forEach((dayData) => {
        const summary = dayData.summary || [];

        summary.forEach((model: DashboardDataItemType) => {
          const modelName = model.model || '-';
          const existing = modelMap.get(modelName) || {
            totalCalls: 0,
            errorCalls: 0,
            totalResponseTime: 0,
            totalTtfb: 0,
            count: 0
          };

          existing.totalCalls += model.request_count || 0;
          existing.errorCalls += model.exception_count || 0;
          existing.totalResponseTime += model.total_time_milliseconds || 0;
          existing.totalTtfb += model.total_ttfb_milliseconds || 0;
          existing.count += 1;

          modelMap.set(modelName, existing);
        });
      });

      modelMap.forEach((aggregated, modelName) => {
        rows.push({
          model: modelName,
          totalCalls: aggregated.totalCalls,
          errorCalls: aggregated.errorCalls,
          avgResponseTime:
            aggregated.count > 0 ? aggregated.totalResponseTime / aggregated.count / 1000 : 0,
          avgTtfb: aggregated.count > 0 ? aggregated.totalTtfb / aggregated.count / 1000 : 0
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
  }, [data, filterProps.model, showChannelColumn, sortField, sortDirection, channelIdToNameMap]);

  const handleSort = (field: 'totalCalls' | 'errorCalls') => {
    if (sortField === field) {
      // Toggle between desc and asc
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // Switch to new field, default to desc
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: 'totalCalls' | 'errorCalls') => {
    if (sortField !== field) return null;
    return sortDirection === 'desc' ? '↓' : '↑';
  };

  return (
    <MyBox h={'100%'}>
      <TableContainer fontSize={'sm'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('account_model:dashboard_model')}</Th>
              {showChannelColumn && <Th>{t('account_model:dashboard_channel')}</Th>}
              <Th
                cursor="pointer"
                onClick={() => handleSort('totalCalls')}
                _hover={{ bg: 'gray.50' }}
              >
                {t('account_model:total_call_volume')} {getSortIcon('totalCalls')}
              </Th>
              <Th
                cursor="pointer"
                onClick={() => handleSort('errorCalls')}
                _hover={{ bg: 'gray.50' }}
              >
                {t('account_model:volunme_of_failed_calls')} {getSortIcon('errorCalls')}
              </Th>
              <Th>{t('account_model:avg_response_time')}</Th>
              <Th>{t('account_model:avg_ttfb')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {tableData.map((item, index) => (
              <Tr key={index}>
                <Td>{item.model}</Td>
                {showChannelColumn && <Td>{item.channel_name || item.channel_id}</Td>}
                <Td color={'primary.600'}>{formatNumber(item.totalCalls)}</Td>
                <Td color={'yellow.600'}>{formatNumber(item.errorCalls)}</Td>
                <Td color={item.avgResponseTime > 10 ? 'red.600' : ''}>
                  {item.avgResponseTime > 0 ? `${item.avgResponseTime.toFixed(2)}s` : '-'}
                </Td>
                <Td>{item.avgTtfb > 0 ? `${item.avgTtfb.toFixed(2)}s` : '-'}</Td>
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
