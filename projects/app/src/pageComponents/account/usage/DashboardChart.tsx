import React, { useEffect, useState } from 'react';
import { Box, Flex, Skeleton } from '@chakra-ui/react';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { TooltipProps } from 'recharts';
import { useTranslation } from 'next-i18next';

export type usageFormType = {
  date: string;
  totalPoints: number;
};

type RechartsComponents = {
  ResponsiveContainer: any;
  LineChart: any;
  Line: any;
  XAxis: any;
  YAxis: any;
  CartesianGrid: any;
  Tooltip: any;
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

const DashboardChart = ({
  totalPoints,
  totalUsage
}: {
  totalPoints: usageFormType[];
  totalUsage: number;
}) => {
  const { t } = useTranslation();
  const [recharts, setRecharts] = useState<RechartsComponents | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // 动态导入 recharts
  useEffect(() => {
    let mounted = true;

    import('recharts')
      .then((module) => {
        if (!mounted) return;

        setRecharts({
          ResponsiveContainer: module.ResponsiveContainer,
          LineChart: module.LineChart,
          Line: module.Line,
          XAxis: module.XAxis,
          YAxis: module.YAxis,
          CartesianGrid: module.CartesianGrid,
          Tooltip: module.Tooltip
        });
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load recharts:', error);
        setError('加载图表库失败');
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // 加载状态
  if (isLoading) {
    return (
      <Box>
        <Flex fontSize={'20px'} fontWeight={'medium'} my={6}>
          <Box color={'black'}>{`${t('account_usage:total_usage')}:`}</Box>
          <Box color={'primary.600'} ml={2}>
            {`${formatNumber(totalUsage)} ${t('account_usage:points')}`}
          </Box>
        </Flex>
        <Flex mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'}>
          {t('account_usage:points')}
        </Flex>
        <Skeleton height="424px" width="100%" borderRadius={'md'} />
      </Box>
    );
  }

  // 错误状态
  if (error || !recharts) {
    return (
      <Box>
        <Flex fontSize={'20px'} fontWeight={'medium'} my={6}>
          <Box color={'black'}>{`${t('account_usage:total_usage')}:`}</Box>
          <Box color={'primary.600'} ml={2}>
            {`${formatNumber(totalUsage)} ${t('account_usage:points')}`}
          </Box>
        </Flex>
        <Box minH={'424px'} py={4} bg={'red.50'} borderRadius={'md'} p={3}>
          <Box color={'red.600'} fontSize={'sm'}>
            {error || '图表加载失败'}
          </Box>
        </Box>
      </Box>
    );
  }

  const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } = recharts;

  return (
    <>
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
    </>
  );
};

export default DashboardChart;
