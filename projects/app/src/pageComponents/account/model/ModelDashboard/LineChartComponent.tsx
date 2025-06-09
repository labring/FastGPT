import React, { useState } from 'react';
import { Box, useTheme } from '@chakra-ui/react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipProps
} from 'recharts';
import { type NameType, type ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatNumber } from '@fastgpt/global/common/math/tools';

type XAxisConfig = {
  dataKey: string;
  tick?: {
    fontSize?: string;
    color?: string;
    fontWeight?: string;
  };
  padding?: {
    left?: number;
    right?: number;
  };
  tickMargin?: number;
  tickSize?: number;
  interval?: number;
};

type YAxisConfig = {
  axisLine?: boolean;
  tickSize?: number;
  tickMargin?: number;
  tick?: {
    fontSize?: string;
    color?: string;
    fontWeight?: string;
  };
};

type LineConfig = {
  dataKey: string | ((data: any) => number);
  name: string;
  color: string;
  strokeWidth?: number;
  dot?: boolean;
};

type TooltipItem = {
  label: string;
  dataKey?: string;
  color: string;
  formatter?: (value: number) => string;
  customValue?: (data: any) => number;
};

type LineChartComponentProps = {
  data: any[];
  title?: string;
  xAxisConfig: XAxisConfig;
  yAxisConfig?: YAxisConfig;
  lines: LineConfig[];
  tooltipItems?: TooltipItem[];
  height?: number;
  margin?: {
    top?: number;
    right?: number;
    left?: number;
    bottom?: number;
  };
};

const CustomTooltip = ({
  active,
  payload,
  tooltipItems
}: TooltipProps<ValueType, NameType> & { tooltipItems?: TooltipItem[] }) => {
  const data = payload?.[0]?.payload;

  if (active && data && tooltipItems) {
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
        {tooltipItems.map((item, index) => {
          let value: number;
          if (item.customValue) {
            value = item.customValue(data);
          } else if (item.dataKey) {
            value = data[item.dataKey] as number;
          } else {
            return null;
          }

          const displayValue = item.formatter ? item.formatter(value) : formatNumber(value);

          return (
            <Box
              key={index}
              fontSize={'14px'}
              color={item.color}
              fontWeight={'medium'}
              mb={index === tooltipItems.length - 1 ? 0 : 1}
            >
              {`${item.label}: ${displayValue}`}
            </Box>
          );
        })}
      </Box>
    );
  }
  return null;
};

const LineChartComponent: React.FC<LineChartComponentProps> = ({
  data,
  title,
  xAxisConfig,
  yAxisConfig,
  lines,
  tooltipItems,
  height = 424,
  margin = { top: 10, right: 30, left: -12, bottom: 0 }
}) => {
  const theme = useTheme();
  const [hiddenLines, setHiddenLines] = useState<Record<string, boolean>>({});

  const defaultYAxisConfig = {
    axisLine: false,
    tickSize: 0,
    tickMargin: 12,
    tick: { fontSize: '12px', color: theme.colors.myGray['500'], fontWeight: '500' }
  };

  const finalYAxisConfig = yAxisConfig || defaultYAxisConfig;

  return (
    <>
      {title && (
        <Box mb={4} fontSize={'mini'} color={'myGray.500'} fontWeight={'medium'}>
          {title}
        </Box>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={margin}>
          <XAxis
            dataKey={xAxisConfig.dataKey}
            padding={xAxisConfig.padding}
            tickMargin={xAxisConfig.tickMargin}
            tickSize={xAxisConfig.tickSize}
            tick={xAxisConfig.tick}
            interval={
              xAxisConfig.interval !== undefined
                ? xAxisConfig.interval
                : Math.max(Math.floor(data.length / 7), 0)
            }
          />
          <YAxis
            axisLine={finalYAxisConfig.axisLine}
            tickSize={finalYAxisConfig.tickSize}
            tickMargin={finalYAxisConfig.tickMargin}
            tick={finalYAxisConfig.tick}
          />
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
          {tooltipItems && <Tooltip content={<CustomTooltip tooltipItems={tooltipItems} />} />}
          <Legend
            onClick={(e) => {
              setHiddenLines((prev) => {
                // Regarding the functional key
                const matchedLine = lines.find((line) => line.name === e.value);
                if (matchedLine) {
                  const key =
                    typeof matchedLine.dataKey === 'string'
                      ? matchedLine.dataKey
                      : matchedLine.name;
                  return {
                    ...prev,
                    [key]: !prev[key]
                  };
                }
                return prev;
              });
            }}
          />
          {lines.map((line, index) => (
            <Line
              key={index}
              type="monotone"
              name={line.name}
              dataKey={line.dataKey}
              stroke={line.color}
              strokeWidth={line.strokeWidth || 2.5}
              dot={line.dot !== undefined ? line.dot : false}
              hide={hiddenLines[typeof line.dataKey === 'string' ? line.dataKey : line.name]}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </>
  );
};

export default LineChartComponent;
