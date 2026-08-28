'use client';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box, useTheme } from '@chakra-ui/react';
import { GET } from '@/web/admin/common/request';
import BoxCard from '@/components/admin/BoxContainer/Card';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { GetPaysFormDataResponseType } from '@fastgpt/global/openapi/admin/core/dashboard/api';
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

export default function PaymentPage(): JSX.Element {
  const router = useRouter();
  const theme = useTheme();

  const [orderAmountType, setOrderAmountType] = useState<'all' | 'success'>('success');
  const orderAmountField = orderAmountType === 'all' ? 'totalCount' : 'successCount';

  // Get dateRange from query
  const dateRange = useMemo((): DateRange => {
    const range = router.query.dateRange;
    if (range === '7' || range === '30' || range === '90' || range === '180') {
      return Number(range) as DateRange;
    }
    return 7;
  }, [router.query.dateRange]);

  const startTime = useMemo(() => getStartTime(dateRange), [dateRange]);

  const { data: paysData, loading } = useRequest(
    async () => {
      return await GET<GetPaysFormDataResponseType>(
        `/proApi/admin/core/dashboard/getPaysFormData`,
        {
          startTime
        }
      ).then((res) => ({
        orderAmounts: formatList2ChartsData(
          res.orderAmounts,
          {
            totalCount: 0,
            successCount: 0
          },
          startTime
        ),
        payAmounts: formatList2ChartsData(
          res.payAmounts,
          {
            totalCount: 0
          },
          startTime
        ),
        payTeams: formatList2ChartsData(
          res.payTeams,
          {
            totalCount: 0
          },
          startTime
        )
      }));
    },
    {
      manual: false,
      refreshDeps: [dateRange, startTime]
    }
  );

  return (
    <BoxCard>
      <DashboardHeader />
      <MyBox minH={'400px'} isLoading={loading}>
        {paysData && (
          <>
            <Box {...ChartsBoxStyles}>
              <AreaChartComponent
                data={paysData.payAmounts}
                title={'付费金额'}
                lines={[
                  {
                    dataKey: 'totalCount',
                    name: '付费金额',
                    color: theme.colors.blue['500']
                  }
                ]}
                tooltipItems={[
                  {
                    label: '付费金额',
                    dataKey: 'totalCount',
                    color: theme.colors.adora['500']
                  }
                ]}
              />
            </Box>
            <Box {...ChartsBoxStyles} mt={4}>
              <AreaChartComponent
                data={paysData.orderAmounts}
                title={'订单数'}
                HeaderLeftChildren={
                  <FillRowTabs<'all' | 'success'>
                    list={[
                      { label: '全部', value: 'all' },
                      { label: '成功', value: 'success' }
                    ]}
                    py={0.5}
                    px={2}
                    value={orderAmountType}
                    onChange={(val) => setOrderAmountType(val)}
                  />
                }
                lines={[
                  {
                    dataKey: orderAmountField,
                    name: '订单数',
                    color: theme.colors.blue['500']
                  }
                ]}
                tooltipItems={[
                  { label: '订单数', dataKey: orderAmountField, color: theme.colors.blue['500'] }
                ]}
              />
            </Box>
            <Box {...ChartsBoxStyles} mt={4}>
              <AreaChartComponent
                data={paysData.payTeams}
                title={'付费团队数'}
                lines={[
                  {
                    dataKey: 'totalCount',
                    name: '付费团队数',
                    color: theme.colors.blue['500']
                  }
                ]}
                tooltipItems={[
                  { label: '付费团队数', dataKey: 'totalCount', color: theme.colors.blue['500'] }
                ]}
              />
            </Box>
          </>
        )}
      </MyBox>
    </BoxCard>
  );
}
