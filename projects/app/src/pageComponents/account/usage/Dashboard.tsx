import { getDashboardData } from '@/web/support/wallet/usage/api';
import { Box, Flex } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { addDays } from 'date-fns';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  TooltipProps
} from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { UnitType, UsageFilterParams } from './type';
import dayjs from 'dayjs';

export type usageFormType = {
  date: string;
  totalPoints: number;
};

const CustomTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  const data = payload?.[0]?.payload as usageFormType;
  const { t } = useTranslation();
  if (active && data) {
    return (
      <Box
        bg={'white'}
        p={3}
        borderRadius={'md'}
        border={'0.5px solid'}
        borderColor={'myGray.200'}
        boxShadow={
          '0px 24px 48px -12px rgba(19, 51, 107, 0.20), 0px 0px 1px 0px rgba(19, 51, 107, 0.20)'
        }
      >
        <Box fontSize={'mini'} color={'myGray.600'} mb={3}>
          {data.date}
        </Box>
        <Box fontSize={'14px'} color={'myGray.900'} fontWeight={'medium'}>
          {`${formatNumber(data.totalPoints)} ${t('account_usage:points')}`}
        </Box>
      </Box>
    );
  }
  return null;
};

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
          ? new Date(dateRange.from.setHours(0, 0, 0, 0))
          : new Date(new Date().setHours(0, 0, 0, 0)),
        dateEnd: dateRange.to
          ? new Date(addDays(dateRange.to, 1).setHours(0, 0, 0, 0))
          : new Date(addDays(new Date(), 1).setHours(0, 0, 0, 0)),
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
        <Flex fontSize={'20px'} fontWeight={'medium'} my={6}>
          <Box color={'black'}>{`${t('account_usage:total_usage')}:`}</Box>
          <Box color={'primary.600'} ml={2}>
            {`${formatNumber(totalUsage)} ${t('account_usage:points')}`}
          </Box>
        </Flex>
        <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'}>
          {t('account_usage:points')}
        </Flex>
        <ResponsiveContainer width="100%" height={424}>
          <LineChart data={totalPoints} margin={{ top: 10, right: 30, left: -12, bottom: 0 }}>
            <XAxis
              dataKey="date"
              padding={{ left: 40, right: 40 }}
              tickMargin={10}
              tickSize={0}
              tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
            />
            <YAxis
              axisLine={false}
              tickSize={0}
              tickMargin={12}
              tick={{ fontSize: '12px', color: '#667085', fontWeight: '500' }}
            />
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="totalPoints"
              stroke="#5E8FFF"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </MyBox>
    </>
  );
};

export default React.memo(UsageDashboard);
