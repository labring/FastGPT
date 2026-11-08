import { getDashboardData } from '@/web/support/wallet/usage/api';
import { Box, Flex } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useMemo } from 'react';
import { type UsageFilterParams } from './type';
import { toMultiSelectFilterQuery } from '@fastgpt/web/components/common/TagFilter';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import { accountContentScrollStyles } from '@/pageComponents/account/styles';

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
  const { dateRange, memberFilter, sourceFilter, unit } = filterParams;

  const { data: totalPoints = [], loading: totalPointsLoading } = useRequest(
    () =>
      getDashboardData({
        dateStart: dateRange.from
          ? dayjs(dateRange.from.setHours(0, 0, 0, 0)).format()
          : dayjs(new Date().setHours(0, 0, 0, 0)).format(),
        dateEnd: dateRange.to ? dayjs(dateRange.to).format() : dayjs(new Date()).format(),
        sources: toMultiSelectFilterQuery(sourceFilter),
        teamMemberIds: toMultiSelectFilterQuery(memberFilter),
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
      <Flex
        px={[3, 6]}
        w={'100%'}
        flexDirection={['column', 'row']}
        flexWrap={['nowrap', 'wrap']}
        alignItems={['stretch', 'center']}
        justifyContent={'space-between'}
        gap={[4, 6]}
      >
        <Box flexShrink={0}>{Tabs}</Box>
        <Box flex={'0 0 auto'} minW={0}>
          {Selectors}
        </Box>
      </Flex>
      <MyBox {...accountContentScrollStyles} px={[3, 6]} isLoading={totalPointsLoading}>
        <DashboardChart totalPoints={totalPoints} totalUsage={totalUsage} />
      </MyBox>
    </>
  );
};

export default React.memo(UsageDashboard);
