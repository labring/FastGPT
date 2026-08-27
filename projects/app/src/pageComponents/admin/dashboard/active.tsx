'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box, useTheme, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import { GET } from '@/web/admin/common/request';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { GetChatFormDataResponseType } from '@fastgpt/global/openapi/admin/core/dashboard/api';
import type { GetQpmRangeResponseType } from '@fastgpt/global/openapi/admin/core/dashboard/api';
import AreaChartComponent from '@fastgpt/web/components/common/charts/AreaChartComponent';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardHeader, { type DateRange } from '@/pageComponents/admin/dashboard/Header';
import { formatList2ChartsData, getStartTime } from '@/pageComponents/admin/dashboard/utils';

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
  const router = useRouter();
  const theme = useTheme();

  // Get dateRange from query
  const dateRange = useMemo((): DateRange => {
    const range = router.query.dateRange;
    if (range === '7' || range === '30' || range === '90' || range === '180') {
      return Number(range) as DateRange;
    }
    return 7;
  }, [router.query.dateRange]);

  const startTime = useMemo(() => getStartTime(dateRange), [dateRange]);

  const { data: activeData, loading } = useRequest(
    async () => {
      const [chatFormData, qpmRangeData] = await Promise.all([
        GET<GetChatFormDataResponseType>(
          `/proApi/admin/core/dashboard/getChatFormData`,
          {
            startTime
          },
          { timeout: 600000 }
        ),
        GET<GetQpmRangeResponseType>(`/proApi/admin/core/dashboard/getWorkflowQpmRange`, {
          startTime
        })
      ]);

      return {
        chatAmounts: formatList2ChartsData(
          chatFormData.chatAmounts,
          {
            totalCount: 0
          },
          startTime
        ),
        chatItemAmounts: formatList2ChartsData(
          chatFormData.chatItemAmounts,
          {
            totalCount: 0,
            averageCount: 0
          },
          startTime
        ),
        qpmRanges: qpmRangeData.ranges
      };
    },
    {
      manual: false,
      refreshDeps: [dateRange, startTime]
    }
  );

  const totalQpmCount = useMemo(() => {
    return activeData?.qpmRanges.reduce((sum, item) => sum + item.count, 0) || 0;
  }, [activeData?.qpmRanges]);

  return (
    <BoxCard>
      <DashboardHeader />
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
    </BoxCard>
  );
}
