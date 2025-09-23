import React, { useCallback, useMemo } from 'react';
import { Box, Flex, HStack, useTheme } from '@chakra-ui/react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipProps,
  LineChart,
  Line,
  ReferenceLine
} from 'recharts';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import { useTranslation } from 'next-i18next';
import QuestionTip from '../MyTooltip/QuestionTip';

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
  customValue?: (data: Record<string, any>) => number;
};

type LineChartComponentProps = {
  data: Record<string, any>[];
  title: string;
  description?: string;
  HeaderRightChildren?: React.ReactNode;
  lines: LineConfig[];
  tooltipItems?: TooltipItem[];
  showAverage?: boolean;
  averageKey?: string;
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
    <Box
      bg="white"
      p={3}
      borderRadius="md"
      border="base"
      boxShadow="sm"
      {...(tooltipItems.length > 8 ? { position: 'relative', top: '-30px' } : {})}
    >
      <Box fontSize="sm" color="myGray.900" mb={tooltipItems.length > 5 ? 1 : 2}>
        {data.xLabel || data.x}
      </Box>
      {tooltipItems.map((item, index) => {
        const value = item.customValue ? item.customValue(data) : data[item.dataKey];
        const displayValue = item.formatter ? item.formatter(value) : formatNumber(value);

        return (
          <HStack key={index} fontSize="sm" _notLast={{ mb: tooltipItems.length > 5 ? 0 : 1 }}>
            <Box w={2} h={2} borderRadius="full" bg={item.color} />
            <Box>{item.label}</Box>
            <Box>{displayValue.toLocaleString()}</Box>
          </HStack>
        );
      })}
    </Box>
  );
};

const LineChartComponent = ({
  data,
  title,
  description,
  HeaderRightChildren,
  lines,
  tooltipItems,
  showAverage = false,
  averageKey,
  blur = false
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

  // Calculate average value
  const averageValue = useMemo(() => {
    if (!showAverage || !averageKey || data.length === 0) return null;

    const sum = data.reduce((acc, item) => acc + (item[averageKey] || 0), 0);
    return sum / data.length;
  }, [showAverage, averageKey, data]);

  // Generate gradient definitions
  const gradientDefs = useMemo(
    () => (
      <defs>
        {lines.map((line) => (
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
    ),
    [lines]
  );

  return (
    <Box
      onMouseEnter={(e) => {
        const chartElement = e.currentTarget.querySelector('.recharts-wrapper');
        if (chartElement && showAverage && averageValue !== null) {
          chartElement.classList.add('show-average');
        }
      }}
      onMouseLeave={(e) => {
        const chartElement = e.currentTarget.querySelector('.recharts-wrapper');
        if (chartElement) {
          chartElement.classList.remove('show-average');
        }
      }}
      h="100%"
    >
      <style jsx global>{`
        .recharts-wrapper .average-line {
          opacity: 0;
          transition: opacity 0.2s ease-in-out;
        }
        .recharts-wrapper.show-average .average-line {
          opacity: 1;
        }
      `}</style>
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
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 0, bottom: HeaderRightChildren ? 20 : 15 }}
        >
          {gradientDefs}
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
          {lines.map((line, index) => (
            <Line
              key={line.dataKey}
              name={line.name}
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={2}
              fill={`url(#gradient-${line.color})`}
              dot={false}
            />
          ))}
          {showAverage && averageValue !== null && (
            <ReferenceLine
              y={averageValue}
              stroke={theme.colors.primary?.['400']}
              strokeDasharray="5 5"
              strokeWidth={1}
              className="average-line"
              label={{
                value: `${formatNumber(averageValue)}`,
                position: 'insideTopRight',
                fill: theme.colors.primary?.['400'],
                fontSize: 12
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default LineChartComponent;
