import { getTotalPoints } from '@/web/support/wallet/usage/api';
import { Box, Flex } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { addDays } from 'date-fns';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
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
import { UnitType } from '../index';

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

const UsageForm = ({
  dateRange,
  selectTmbIds,
  usageSources,
  unit,
  Tabs,
  Selectors
}: {
  dateRange: DateRangeType;
  selectTmbIds: string[];
  usageSources: UsageSourceEnum[];
  unit: UnitType;
  Tabs: React.ReactNode;
  Selectors: React.ReactNode;
}) => {
  const { t } = useTranslation();

  const {
    run: getTotalPointsData,
    data: totalPoints,
    loading: totalPointsLoading
  } = useRequest2(
    () =>
      getTotalPoints({
        dateStart: dateRange.from || new Date(),
        dateEnd: addDays(dateRange.to || new Date(), 1),
        teamMemberIds: selectTmbIds,
        sources: usageSources,
        unit
      }),
    {
      manual: true
    }
  );

  const totalUsage = useMemo(() => {
    return totalPoints?.reduce((acc, curr) => acc + curr.totalPoints, 0);
  }, [totalPoints]);

  useEffect(() => {
    if (selectTmbIds.length === 0 || usageSources.length === 0) return;
    getTotalPointsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageSources, selectTmbIds.length, dateRange, unit]);

  return (
    <>
      <Box>{Tabs}</Box>
      <Box>{Selectors}</Box>
      <MyBox isLoading={totalPointsLoading}>
        <Flex fontSize={'20px'} fontWeight={'medium'} my={6}>
          <Box color={'black'}>{`${t('account_usage:total_usage')}:`}</Box>
          <Box color={'primary.600'} ml={2}>
            {`${formatNumber(totalUsage || 0)} ${t('account_usage:points')}`}
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
            <CartesianGrid
              strokeDasharray="3 3"
              verticalCoordinatesGenerator={(props) => {
                const { width } = props;
                if (width < 500) {
                  return [width * 0.2, width * 0.4, width * 0.6, width * 0.8];
                } else {
                  return [
                    width * 0.125,
                    width * 0.25,
                    width * 0.375,
                    width * 0.5,
                    width * 0.625,
                    width * 0.75,
                    width * 0.875
                  ];
                }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="totalPoints"
              stroke="#5E8FFF"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </MyBox>
    </>
  );
};

export default React.memo(UsageForm);
