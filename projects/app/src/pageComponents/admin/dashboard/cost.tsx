'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box, useTheme } from '@chakra-ui/react';
import { POST } from '@/web/admin/common/request';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { GetCostFormDataResponseType } from '@fastgpt/global/openapi/admin/core/dashboard/api';
import AreaChartComponent from '@fastgpt/web/components/common/charts/AreaChartComponent';
import MyBox from '@fastgpt/web/components/common/MyBox';
import DashboardHeader from '@/pageComponents/admin/dashboard/Header';
import {
  formatList2ChartsData,
  getStartTime,
  getDashboardFilters
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

export default function CostPage(): JSX.Element {
  const router = useRouter();
  const theme = useTheme();

  const { dateRange, granularity } = getDashboardFilters(router.query);

  const startTime = useMemo(() => getStartTime(dateRange), [dateRange]);

  const { data: costData, loading } = useRequest(
    async () => {
      return await POST<GetCostFormDataResponseType>(
        `/proApi/admin/core/dashboard/getCostFormData`,
        {
          startTime,
          granularity
        }
      ).then((res) => ({
        pointUsages: formatList2ChartsData(res.pointUsages, {
          defaultValues: {
            totalCount: 0
          },
          startTime,
          granularity
        })
      }));
    },
    {
      manual: false,
      refreshDeps: [dateRange, startTime, granularity]
    }
  );

  return (
    <BoxCard>
      <DashboardHeader />
      <MyBox minH={'400px'} isLoading={loading}>
        {costData && (
          <>
            <Box {...ChartsBoxStyles}>
              <AreaChartComponent
                data={costData.pointUsages}
                title={'积分消耗'}
                lines={[
                  {
                    dataKey: 'totalCount',
                    name: '积分消耗',
                    color: theme.colors.blue['500']
                  }
                ]}
                tooltipItems={[
                  { label: '积分消耗', dataKey: 'totalCount', color: theme.colors.blue['500'] }
                ]}
              />
            </Box>
          </>
        )}
      </MyBox>
    </BoxCard>
  );
}
