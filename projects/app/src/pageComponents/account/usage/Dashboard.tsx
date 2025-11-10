import { getDashboardData } from '@/web/support/wallet/usage/api';
import { Box } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { addDays } from 'date-fns';
import React, { useMemo } from 'react';
import { type UsageFilterParams } from './type';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';

const DashboardChart = dynamic(() => import('./DashboardChart'), {
  ssr: false
});

const UsageDashboard = ({
  filterParams,
  Tabs,
  Selectors
}: {
  filterParams: UsageFilterParams;
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
}) => {
  const { dateRange, selectTmbIds, usageSources, unit, isSelectAllSource, isSelectAllTmb } =
    filterParams;

  const { data: totalPoints = [], loading: totalPointsLoading } = useRequest2(
    () =>
      getDashboardData({
        dateStart: dateRange.from
          ? dayjs(dateRange.from.setHours(0, 0, 0, 0)).format()
          : dayjs(new Date().setHours(0, 0, 0, 0)).format(),
        dateEnd: dateRange.to
          ? dayjs(addDays(dateRange.to, 1).setHours(0, 0, 0, 0)).format()
          : dayjs(addDays(new Date(), 1).setHours(0, 0, 0, 0)).format(),
        sources: isSelectAllSource ? undefined : usageSources,
        teamMemberIds: isSelectAllTmb ? undefined : selectTmbIds,
        unit
      }).then((res) =>
        res.map((item) => ({
          ...item,
          date: dayjs(item.date).format('YYYY-MM-DD')
        }))
      ),
    {
      manual: false,
      refreshDeps: [filterParams]
    }
  );

  const totalUsage = useMemo(() => {
    return totalPoints.reduce((acc, curr) => acc + curr.totalPoints, 0);
  }, [totalPoints]);

  return (
    <>
      <Box>{Tabs}</Box>
      <Box mt={4}>{Selectors}</Box>
      <MyBox overflowY={'auto'} isLoading={totalPointsLoading}>
        <DashboardChart totalPoints={totalPoints} totalUsage={totalUsage} />
      </MyBox>
    </>
  );
};

export default React.memo(UsageDashboard);
