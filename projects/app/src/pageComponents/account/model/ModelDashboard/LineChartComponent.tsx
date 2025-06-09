import React, { useCallback, useMemo, useState } from 'react';
import { Box, HStack, useTheme } from '@chakra-ui/react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipProps
} from 'recharts';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatNumber } from '@fastgpt/global/common/math/tools';

type XAxisConfig = {
  dataKey: string;
};

type LineConfig = {
  dataKey: string;
  name: string;
  color: string;
  gradient?: boolean;
};

type TooltipItem = {
  label: string;
  dataKey: string;
  color: string;
  formatter?: (value: number) => string;
  customValue?: (data: any) => number;
};

type LineChartComponentProps = {
  data: Record<string, any>[];
  title: string;
  HeaderRightChildren?: React.ReactNode;
  lines: LineConfig[];
  tooltipItems?: TooltipItem[];
};

const CustomTooltip = ({
  active,
  payload,
  tooltipItems
}: TooltipProps<ValueType, NameType> & { tooltipItems?: TooltipItem[] }) => {
  const data = payload?.[0]?.payload;

  if (active && data && tooltipItems) {
    return (
      <Box bg={'white'} p={3} borderRadius={'md'} border={'base'} boxShadow={'sm'}>
        <Box fontSize={'sm'} color={'myGray.900'} mb={2}>
          {data.x}
        </Box>
        {tooltipItems.map((item, index) => {
          const value = (() => {
            if (item.customValue) {
              return item.customValue(data);
            } else {
              return data[item.dataKey];
            }
          })();

          const displayValue = (() => {
            const val = item.formatter ? item.formatter(value) : formatNumber(value);
            return val.toLocaleString();
          })();

          return (
            <HStack key={index} fontSize={'sm'} _notLast={{ mb: 1 }}>
              <Box w={2} h={2} borderRadius={'full'} bg={item.color} />
              <Box>{item.label}</Box>
              <Box>{displayValue}</Box>
            </HStack>
          );
        })}
      </Box>
    );
  }
  return null;
};

const LineChartComponent = ({
  data,
  title,
  HeaderRightChildren,
  lines,
  tooltipItems
}: LineChartComponentProps) => {
  const theme = useTheme();

  // Y-axis number formatter function
  const formatYAxisNumber = useCallback((value: number): string => {
    if (value >= 1000000) {
      return value / 1000000 + 'M';
    } else if (value >= 1000) {
      return value / 1000 + 'K';
    }
    return value.toString();
  }, []);

  // Generate gradient definitions
  const gradientDefs = useMemo(() => {
    return (
      <defs>
        {lines.map((line, index) => (
          <linearGradient
            key={`gradient-${line.color}`}
            id={`gradient-${line.color}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={line.color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={line.color} stopOpacity={0.01} />
          </linearGradient>
        ))}
      </defs>
    );
  }, [lines]);

  return (
    <>
      <HStack mb={4} justifyContent={'space-between'} alignItems={'flex-start'}>
        <Box fontSize={'sm'} color={'myGray.900'} fontWeight={'medium'}>
          {title}
        </Box>
        {HeaderRightChildren && HeaderRightChildren}
      </HStack>
      <ResponsiveContainer width="100%" height={'100%'}>
        <AreaChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: HeaderRightChildren ? 30 : 15 }}
        >
          {gradientDefs}
          <XAxis
            dataKey={'x'}
            tickMargin={10}
            tick={{ fontSize: '12px', color: theme.colors.myGray['500'], fontWeight: '500' }}
            interval={'preserveStartEnd'}
          />
          <YAxis
            axisLine={false}
            tickSize={0}
            tickMargin={10}
            tick={{ fontSize: '12px', color: theme.colors.myGray['500'], fontWeight: '500' }}
            interval={'preserveStartEnd'}
            tickFormatter={formatYAxisNumber}
          />
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
          {tooltipItems && <Tooltip content={<CustomTooltip tooltipItems={tooltipItems} />} />}
          {lines.map((line, index) => (
            <Area
              key={index}
              type="monotone"
              name={line.name}
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={2}
              fill={`url(#gradient-${line.color})`}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </>
  );
};

export default LineChartComponent;
