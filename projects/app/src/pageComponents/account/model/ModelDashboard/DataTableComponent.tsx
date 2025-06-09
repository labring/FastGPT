import React, { useMemo } from 'react';
import {
  Table,
  TableContainer,
  Thead,
  Tbody,
  Tr,
  Th,
  Td
} from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { ModelDashboardData, DashboardDataEntry, ModelUsageData } from './index';

interface DataTableComponentProps {
  data: DashboardDataEntry[];
  filterProps: {
    channelId?: string;
    model?: string;
  };
  systemModelList: Array<{
    model: string;
    inputPrice?: number;
    outputPrice?: number;
    charsPointsPrice?: number;
  }>;
}

const DataTableComponent = ({ data, filterProps, systemModelList }: DataTableComponentProps) => {
  const { t } = useTranslation();

  // 将数据转换为表格行格式
  const tableData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    const rows: Array<{
      model: string;
      channel: string;
      totalCalls: number;
      errorCalls: number;
      errorRate: number;
      avgResponseTime: number;
      avgTtfb: number;
    }> = [];

    // 遍历所有数据，展开为行
    data.forEach((dayData) => {
      const modelsToProcess = filterProps.model
        ? dayData.models.filter((model: ModelUsageData) => model.model === filterProps.model)
        : dayData.models;

      modelsToProcess.forEach((model: ModelUsageData) => {
        rows.push({
          model: model.model,
          channel: '默认渠道', // 如果有渠道信息可以从数据中获取
          totalCalls: model.request_count,
          errorCalls: model.exception_count,
          errorRate: model.request_count > 0 ? (model.exception_count / model.request_count) * 100 : 0,
          avgResponseTime: model.total_time_milliseconds || 0,
          avgTtfb: model.total_ttfb_milliseconds || 0
        });
      });
    });

    return rows;
  }, [data, filterProps.model]);

  return (
    <MyBox h={'100%'}>
      <TableContainer fontSize={'sm'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('account_model:dashboard_model')}</Th>
              <Th>渠道</Th>
              <Th>调用总量</Th>
              <Th>调用失败量</Th>
              <Th>失败率</Th>
              <Th>平均调用时长</Th>
              <Th>平均首Token延时</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {tableData.map((item, index) => (
              <Tr key={index}>
                <Td>{item.model}</Td>
                <Td>{item.channel}</Td>
                <Td color={'primary.600'}>{formatNumber(item.totalCalls)}</Td>
                <Td color={'yellow.600'}>{formatNumber(item.errorCalls)}</Td>
                <Td>{item.errorRate.toFixed(2)}%</Td>
                <Td color={item.avgResponseTime > 10000 ? 'red.600' : ''}>
                  {item.avgResponseTime > 0 ? `${Math.round(item.avgResponseTime)}ms` : '-'}
                </Td>
                <Td>
                  {item.avgTtfb > 0 ? `${Math.round(item.avgTtfb)}ms` : '-'}
                </Td>
                <Td>-</Td>
              </Tr>
            ))}
            {tableData.length === 0 && (
              <Tr>
                <Td colSpan={8} textAlign="center" py={8} color="myGray.500">
                  {t('account_model:dashboard_no_data')}
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </TableContainer>
    </MyBox>
  );
};

export default DataTableComponent;
