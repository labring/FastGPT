'use client';
import React, { useMemo } from 'react';
import { Box, useTheme } from '@chakra-ui/react';
import { GET } from '@/web/admin/common/request';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { GetUserFormDataResponseType } from '@fastgpt/global/openapi/admin/core/dashboard/api';
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

export default function TrafficPage(): JSX.Element {
  const theme = useTheme();

  const { dateRange, granularity } = useDashboardFilters();

  const startTime = useMemo(() => getStartTime(dateRange), [dateRange]);

  const { data: trafficData, loading } = useRequest(
    async () => {
      return await GET<GetUserFormDataResponseType>(
        `/proApi/admin/core/dashboard/getUserFormData`,
        {
          startTime,
          granularity
        }
      ).then((res) => {
        return {
          startUserCount: res.startUserCount,
          registeredUserCount: formatList2ChartsData(res.registeredUserCount, {
            defaultValues: {
              count: 0
            },
            startTime,
            granularity
          })
        };
      });
    },
    {
      manual: false,
      refreshDeps: [dateRange, startTime, granularity]
    }
  );

  return (
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
  );
}
