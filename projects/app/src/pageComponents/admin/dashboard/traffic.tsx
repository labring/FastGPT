'use client';
import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Box, useTheme } from '@chakra-ui/react';
import { GET } from '@/web/admin/common/request';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { GetUserFormDataResponseType } from '@fastgpt/global/openapi/admin/core/dashboard/api';
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

export default function TrafficPage(): JSX.Element {
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

  const { data: trafficData, loading } = useRequest(
    async () => {
      return await GET<GetUserFormDataResponseType>(
        `/proApi/admin/core/dashboard/getUserFormData`,
        {
          startTime
        }
      ).then((res) => {
        return {
          startUserCount: res.startUserCount,
          registeredUserCount: formatList2ChartsData(
            res.registeredUserCount,
            {
              count: 0
            },
            startTime
          )
        };
      });
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
        {trafficData && (
          <>
            <Box {...ChartsBoxStyles}>
              <AreaChartComponent
                data={trafficData.registeredUserCount}
                startDateValue={trafficData.startUserCount}
                title={'总用户数'}
                enableIncremental={false}
                defaultDisplayMode="cumulative"
                lines={[
                  {
                    dataKey: 'count',
                    name: '总用户数',
                    color: theme.colors.blue['500']
                  }
                ]}
                tooltipItems={[
                  { label: '总用户数', dataKey: 'count', color: theme.colors.blue['500'] }
                ]}
              />
            </Box>
            <Box {...ChartsBoxStyles} mt={4}>
              <AreaChartComponent
                data={trafficData.registeredUserCount}
                title={'注册用户数'}
                lines={[
                  {
                    dataKey: 'count',
                    name: '注册用户数',
                    color: theme.colors.blue['500']
                  }
                ]}
                tooltipItems={[
                  {
                    label: '注册用户数',
                    dataKey: 'count',
                    color: theme.colors.adora['500']
                  }
                ]}
              />
            </Box>
          </>
        )}
      </MyBox>
    </BoxCard>
  );
}
