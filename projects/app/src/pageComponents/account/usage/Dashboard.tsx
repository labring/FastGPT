import { Box, Flex } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { accountContentScrollStyles } from '@/pageComponents/account/styles';
import type { UsageFilterController } from './useUsageFilterController';
import UsageExportButton from './UsageExportButton';

const DashboardChart = dynamic(() => import('./DashboardChart'), {
  ssr: false
});

const UsageDashboard = ({
  controller,
  Tabs,
  Selectors
}: {
  controller: UsageFilterController;
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
}) => {
  const { data: totalPoints = [], loading: totalPointsLoading } = useRequest(
    controller.fetchDashboard,
    {
      manual: false,
      refreshDeps: [controller.queryKey]
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
        <Flex flex={'0 0 auto'} minW={0} gap={3} flexWrap={'wrap'} justifyContent={'flex-end'}>
          {Selectors}
          <UsageExportButton controller={controller} />
        </Flex>
      </Flex>
      <MyBox {...accountContentScrollStyles} px={[3, 6]} isLoading={totalPointsLoading}>
        <DashboardChart totalPoints={totalPoints} totalUsage={totalUsage} />
      </MyBox>
    </>
  );
};

export default React.memo(UsageDashboard);
