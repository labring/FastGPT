'use client';
import React, { useMemo } from 'react';
import { Box, useTheme, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getChatFormData, getWorkflowQpmRange } from '@/web/admin/dashboard/api';
import AreaChartComponent from '@fastgpt/web/components/common/charts/AreaChartComponent';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  formatList2ChartsData,
  getStartTime,
  useDashboardFilters
} from '@/pageComponents/admin/dashboard/utils';

const ChartsBoxStyles = {
  px: 5,
  pt: 4,
  pb: 10,
  h: '400px',
  border: 'base',
  borderRadius: 'md',
  overflow: 'hidden'
};

export default function ActivePage(): JSX.Element {
  const theme = useTheme();

  const { dateRange, granularity } = useDashboardFilters();

  const startTime = useMemo(() => getStartTime(dateRange), [dateRange]);

  const { data: activeData, loading } = useRequest(
    async () => {
      const [chatFormData, qpmRangeData] = await Promise.all([
        getChatFormData({ startTime, granularity }, { timeout: 600000 }),
        getWorkflowQpmRange({ startTime, granularity })
      ]);

      return {
        chatAmounts: formatList2ChartsData(chatFormData.chatAmounts, {
          defaultValues: {
            totalCount: 0
          },
          startTime,
          granularity
        }),
        chatItemAmounts: formatList2ChartsData(chatFormData.chatItemAmounts, {
          defaultValues: {
            totalCount: 0,
            averageCount: 0
          },
          startTime,
          granularity
        }),
        qpmRanges: qpmRangeData.ranges
      };
    },
    {
      manual: false,
      refreshDeps: [dateRange, startTime, granularity]
    }
  );

  const totalQpmCount = useMemo(() => {
    return activeData?.qpmRanges.reduce((sum, item) => sum + item.count, 0) || 0;
  }, [activeData?.qpmRanges]);

  return (
    <MyBox minH={'400px'} isLoading={loading}>
      {activeData && (
        <>
          <Box {...ChartsBoxStyles}>
            <AreaChartComponent
              data={activeData.chatItemAmounts}
              title={'总对话数'}
              lines={[
                {
                  dataKey: 'totalCount',
                  name: '总对话数',
                  color: theme.colors.blue['500']
                }
              ]}
              tooltipItems={[
                {
                  label: '总对话数',
                  dataKey: 'totalCount',
                  color: theme.colors.adora['500']
                }
              ]}
            />
          </Box>
          <Box {...ChartsBoxStyles} mt={4}>
            <AreaChartComponent
              data={activeData.chatAmounts}
              title={'总会话数'}
              lines={[
                {
                  dataKey: 'totalCount',
                  name: '总会话数',
                  color: theme.colors.blue['500']
                }
              ]}
              tooltipItems={[
                { label: '总会话数', dataKey: 'totalCount', color: theme.colors.blue['500'] }
              ]}
            />
          </Box>
          <Box {...ChartsBoxStyles} mt={4} h={'auto'}>
            <Box fontSize={'sm'} color={'myGray.900'} fontWeight={'medium'} mb={4}>
              工作流 QPM 范围
            </Box>
            <TableContainer>
              <Table variant={'simple'}>
                <Thead>
                  <Tr>
                    <Th>QPM 范围</Th>
                    <Th>次数</Th>
                    <Th>占比</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {activeData.qpmRanges.map((item, index) => (
                    <Tr key={item.range} bg={index % 2 === 1 ? 'gray.50' : undefined}>
                      <Td>{item.range}</Td>
                      <Td>{item.count}</Td>
                      <Td>
                        {totalQpmCount > 0
                          ? `${((item.count / totalQpmCount) * 100).toFixed(2)}%`
                          : '0%'}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </>
      )}
    </MyBox>
  );
}
