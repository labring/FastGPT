import React, { useMemo } from 'react';
import { Table, TableContainer, Thead, Tbody, Tr, Th, Td, Button } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';

export type ModelUsageData = {
  channel_id: number;
  model: string;
  request_count: number;
  used_amount: number;
  exception_count: number;
  total_time_milliseconds: number;
  total_ttfb_milliseconds: number;
  input_tokens: number;
  output_tokens?: number;
  total_tokens: number;
  max_rpm: number;
  max_tpm: number;
};

export type DashboardDataEntry = {
  timestamp: number;
  summary: ModelUsageData[];
};

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
  onViewDetail?: (channelId: string, model: string) => void;
}

const DataTableComponent = ({
  data,
  filterProps,
  systemModelList,
  onViewDetail
}: DataTableComponentProps) => {
  const { t } = useTranslation();

  // 将数据转换为表格行格式
  const tableData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    const rows: Array<{
      model: string;
      channel: string;
      channelId: number;
      totalCalls: number;
      errorCalls: number;
      errorRate: number;
      avgResponseTime: number;
      avgTtfb: number;
    }> = [];

    // 遍历所有数据，展开为行
    data.forEach((dayData) => {
      const summary = dayData.summary || [];
      const modelsToProcess = filterProps.model
        ? summary.filter((model: ModelUsageData) => model.model === filterProps.model)
        : summary;

      modelsToProcess.forEach((model: ModelUsageData) => {
        rows.push({
          model: model.model || '-',
          channel: `${model.channel_id}`,
          channelId: model.channel_id,
          totalCalls: model.request_count || 0,
          errorCalls: model.exception_count || 0,
          errorRate:
            (model.request_count || 0) > 0
              ? ((model.exception_count || 0) / (model.request_count || 0)) * 100
              : 0,
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
                <Td>{item.avgTtfb > 0 ? `${Math.round(item.avgTtfb)}ms` : '-'}</Td>
                <Td>
                  <Button
                    leftIcon={<MyIcon name={'menu'} w={'1rem'} />}
                    size={'sm'}
                    variant={'outline'}
                    onClick={() => onViewDetail?.(item.channelId.toString(), item.model)}
                  >
                    {t('account_model:detail')}
                  </Button>
                </Td>
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
