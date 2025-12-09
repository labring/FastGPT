import { getDashboardData } from '@/web/support/wallet/usage/api';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { addDays } from 'date-fns';
import React, { useMemo } from 'react';
import { type UsageFilterParams } from './type';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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

  const {
    isOpen: isOpenRecharge,
    onOpen: onOpenRecharge,
    onClose: onCloseRecharge
  } = useDisclosure();

  return (
    <>
      <Flex>
        <Box>{Tabs}</Box>
        <Box flex={1} />
        <Button
          size={'md'}
          variant={'transparentBase'}
          color={'primary.700'}
          onClick={onOpenRecharge}
        >
          {t('account_usage:check_left_points')}
        </Button>
      </Flex>
      <Box mt={4}>{Selectors}</Box>
      <MyBox overflowY={'auto'} isLoading={totalPointsLoading}>
        <DashboardChart totalPoints={totalPoints} totalUsage={totalUsage} />
      </MyBox>
      {isOpenRecharge && <RechargeModal onClose={onCloseRecharge} onPaySuccess={onCloseRecharge} />}
    </>
  );
};

export default React.memo(UsageDashboard);
