import React, { useCallback, useMemo } from 'react';
import { Box, Flex, HStack, useTheme } from '@chakra-ui/react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipProps,
  BarChart,
  Bar
} from 'recharts';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import QuestionTip from '../MyTooltip/QuestionTip';

type BarConfig = {
  dataKey: string;
  name: string;
  color: string;
  stackId?: string;
};

type TooltipItem = {
  label: string;
  dataKey: string;
  color: string;
  formatter?: (value: number) => string;
  customValue?: (data: Record<string, any>) => number;
};

type BarChartComponentProps = {
  data: Record<string, any>[];
  title: string;
  description?: string;
  HeaderRightChildren?: React.ReactNode;
  bars: BarConfig[];
  tooltipItems?: TooltipItem[];
  blur?: boolean;
};

const CustomTooltip = ({
  active,
  payload,
  tooltipItems
}: TooltipProps<ValueType, NameType> & { tooltipItems?: TooltipItem[] }) => {
  const data = payload?.[0]?.payload;

  if (!active || !data || !tooltipItems) {
    return null;
  }

  return (
    <Box bg="white" p={3} borderRadius="md" border="base" boxShadow="sm">
      <Box fontSize="sm" color="myGray.900" mb={2}>
        {data.xLabel || data.x}
      </Box>
      {tooltipItems.map((item, index) => {
        const value = item.customValue ? item.customValue(data) : data[item.dataKey];
        const displayValue = item.formatter ? item.formatter(value) : formatNumber(value);

        return (
          <HStack key={index} fontSize="sm" _notLast={{ mb: 1 }}>
            <Box w={2} h={2} borderRadius="full" bg={item.color} />
            <Box>{item.label}</Box>
            <Box>{displayValue.toLocaleString()}</Box>
          </HStack>
        );
      })}
    </Box>
  );
};

const BarChartComponent = ({
  data,
  title,
  description,
  HeaderRightChildren,
  bars,
  tooltipItems,
  blur = false
}: BarChartComponentProps) => {
  const theme = useTheme();
  const { t } = useTranslation();

  // Y-axis number formatter function
  const formatYAxisNumber = useCallback((value: number): string => {
    if (value >= 1000000) {
      return value / 1000000 + 'M';
    } else if (value >= 1000) {
      return value / 1000 + 'K';
    }
    return value.toString();
  }, []);

  return (
    <>
      <Flex mb={4} h={6}>
        <Flex flex={1} alignItems={'center'} gap={1}>
          <Box fontSize={'sm'} color={'myGray.900'} fontWeight={'medium'}>
            {title}
          </Box>
          <QuestionTip label={description} />
        </Flex>
        <Box filter={blur ? 'blur(7.5px)' : 'none'} pointerEvents={blur ? 'none' : 'auto'}>
          {HeaderRightChildren}
        </Box>
      </Flex>
      <ResponsiveContainer
        width="100%"
        height={'100%'}
        style={{ filter: blur ? 'blur(7.5px)' : 'none' }}
      >
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: HeaderRightChildren ? 20 : 15 }}
        >
          <XAxis
            dataKey="x"
            tickMargin={10}
            tick={{ fontSize: '12px', color: theme?.colors?.myGray['500'], fontWeight: '500' }}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickSize={0}
            tickMargin={10}
            tick={{ fontSize: '12px', color: theme?.colors?.myGray['500'], fontWeight: '500' }}
            interval="preserveStartEnd"
            tickFormatter={formatYAxisNumber}
          />
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
          {tooltipItems && <Tooltip content={<CustomTooltip tooltipItems={tooltipItems} />} />}
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              name={bar.name}
              dataKey={bar.dataKey}
              fill={bar.color}
              stackId={bar.stackId}
              radius={[2, 2, 0, 0]}
              maxBarSize={30}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default BarChartComponent;
