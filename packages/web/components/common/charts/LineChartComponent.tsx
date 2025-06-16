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
import FillRowTabs from '../Tabs/FillRowTabs';
import { useTranslation } from 'next-i18next';
import { cloneDeep } from 'lodash';

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
  HeaderLeftChildren?: React.ReactNode;
  lines: LineConfig[];
  tooltipItems?: TooltipItem[];

  defaultDisplayMode?: 'incremental' | 'cumulative';
  enableIncremental?: boolean;
  enableCumulative?: boolean;
  enableTooltip?: boolean;
  startDateValue?: number;
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

const LineChartComponent = ({
  data,
  title,
  HeaderLeftChildren,
  lines,
  tooltipItems,
  defaultDisplayMode = 'incremental',
  enableIncremental = true,
  enableCumulative = true,
  startDateValue = 0
}: LineChartComponentProps) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const [displayMode, setDisplayMode] = useState<'incremental' | 'cumulative'>(defaultDisplayMode);

  // Tab list constant
  const tabList = useMemo(
    () => [
      ...(enableIncremental
        ? [{ label: t('common:chart_mode_incremental'), value: 'incremental' as const }]
        : []),
      ...(enableCumulative
        ? [{ label: t('common:chart_mode_cumulative'), value: 'cumulative' as const }]
        : [])
    ],
    [enableCumulative, enableIncremental, t]
  );

  // Y-axis number formatter function
  const formatYAxisNumber = useCallback((value: number): string => {
    if (value >= 1000000) {
      return value / 1000000 + 'M';
    } else if (value >= 1000) {
      return value / 1000 + 'K';
    }
    return value.toString();
  }, []);

  // Process data based on display mode
  const processedData = useMemo(() => {
    if (displayMode === 'incremental') {
      return data;
    }

    // Cumulative mode: accumulate values for each line's dataKey
    const cloneData = cloneDeep(data);

    const dataKeys = lines.map((item) => item.dataKey);

    return cloneData.map((item, index) => {
      if (index === 0) {
        item[dataKeys[0]] = startDateValue + item[dataKeys[0]];
        return item;
      }

      dataKeys.forEach((key) => {
        if (typeof item[key] === 'number') {
          item[key] += cloneData[index - 1][key];
        }
      });

      return item;
    });
  }, [displayMode, data, lines, startDateValue]);

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
    <>
      <HStack mb={4} justifyContent={'space-between'} alignItems={'flex-start'}>
        <Box fontSize={'sm'} color={'myGray.900'} fontWeight={'medium'}>
          {title}
        </Box>
        <HStack spacing={2}>
          {HeaderLeftChildren}
          {tabList.length > 1 && (
            <FillRowTabs<'incremental' | 'cumulative'>
              list={tabList}
              py={0.5}
              px={2}
              value={displayMode}
              onChange={setDisplayMode}
            />
          )}
        </HStack>
      </HStack>
      <ResponsiveContainer width="100%" height={'100%'}>
        <AreaChart
          data={processedData}
          margin={{ top: 5, right: 30, left: 0, bottom: HeaderLeftChildren ? 20 : 15 }}
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
            <Area
              key={line.dataKey}
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
