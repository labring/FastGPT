import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { Box, Skeleton } from '@chakra-ui/react';
import json5 from 'json5';
import { useMount } from 'ahooks';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useScreen } from '@fastgpt/web/hooks/useScreen';

type EChartsGrid = {
  top: string;
  left: string;
  bottom: string;
  right: string;
  containLabel: boolean;
};

type EChartsSeries = {
  data: number[];
  name: string;
  type: string;
};

type EChartsConfig = {
  xAxis: { data: string[]; type: string }[];
  yAxis: { type: string }[];
  grid: EChartsGrid;
  legend: { show: boolean };
  series: EChartsSeries[];
  tooltip: { trigger: string };
  dataZoom: unknown[];
};

const EChartsCodeBlock = ({ code }: { code: string }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const eChart = useRef<ECharts>();
  const { isPc } = useSystem();
  const [option, setOption] = useState<EChartsConfig>();
  const [width, setWidth] = useState(400);
  const [dataRange, setDataRange] = useState({ start: 0, end: 100 });
  const [totalDataLength, setTotalDataLength] = useState(0);
  const [originalXData, setOriginalXData] = useState<string[]>([]);
  const [originalYData, setOriginalYData] = useState<number[]>([]);
  const dragStartTime = useRef<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const findMarkdownDom = useCallback(() => {
    if (!chartRef.current) return;

    // 一直找到 parent = markdown 的元素
    let parent = chartRef.current?.parentElement;
    while (parent && !parent.className.includes('chat-box-card')) {
      parent = parent.parentElement;
    }

    const ChatItemDom = parent?.parentElement;
    const clientWidth = ChatItemDom?.clientWidth ? ChatItemDom.clientWidth - (isPc ? 90 : 60) : 500;
    setWidth(clientWidth);
    return parent?.parentElement;
  }, [isPc]);

  // filter data
  const filterDataByRange = useCallback(
    (originalXData: string[], originalYData: number[], range: { start: number; end: number }) => {
      if (!originalXData.length || !originalYData.length) return { xData: [], yData: [] };

      const totalLength = Math.min(originalXData.length, originalYData.length);

      const startIndex = Math.floor((range.start / 100) * totalLength);
      const endIndex = Math.min(totalLength, Math.ceil((range.end / 100) * totalLength));

      const actualEndIndex = Math.max(startIndex + 1, endIndex);

      // slice data
      const filteredXData = originalXData.slice(startIndex, actualEndIndex);
      const filteredYData = originalYData.slice(startIndex, actualEndIndex);

      return { xData: filteredXData, yData: filteredYData };
    },
    []
  );

  // x and y data extraction
  const extractXYData = useCallback((echartsConfig: EChartsConfig) => {
    const emptyResult = {
      xData: [] as string[],
      yData: [] as number[],
      chartContent: null as EChartsConfig | null
    };

    if (echartsConfig?.series?.length > 0 && echartsConfig?.xAxis?.length > 0) {
      const series = echartsConfig.series[0];
      const xAxis = echartsConfig.xAxis[0];

      return {
        xData: xAxis.data || [],
        yData: series.data || [],
        chartContent: echartsConfig
      };
    }

    return emptyResult;
  }, []);

  // abstract chart render function
  const createChartOption = useCallback(
    (xData: string[], yData: number[], chartContent?: EChartsConfig | null) => {
      if (chartContent) {
        return {
          ...chartContent,
          xAxis: chartContent.xAxis.map((axis) => ({
            ...axis,
            data: xData
          })),
          series: chartContent.series.map((series) => ({
            ...series,
            data: yData
          }))
        };
      }

      // fallback to default config
      return {
        grid: {
          bottom: '15%',
          left: '5%',
          right: '5%',
          top: '10%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: xData,
          boundaryGap: true,
          axisTick: {
            alignWithLabel: true,
            interval: 0
          },
          axisLabel: {
            interval: (() => {
              const dataLength = xData.length;
              if (dataLength <= 10) return 0;
              if (dataLength <= 20) return 1;
              if (dataLength <= 50) return Math.floor(dataLength / 10);
              return Math.floor(dataLength / 15);
            })(),
            rotate: 45,
            fontSize: 10,
            formatter: (value: string) => {
              return value && value.length > 20 ? `${value.substring(0, 20)}...` : value;
            }
          }
        },
        yAxis: {
          type: 'value',
          scale: true
        },
        series: [
          {
            type: 'bar',
            data: yData,
            barCategoryGap: '20%',
            itemStyle: {
              borderRadius: [4, 4, 0, 0]
            },
            name: 'Data'
          }
        ],
        tooltip: {
          trigger: 'axis',
          formatter: function (params: Array<{ name: string; seriesName: string; value: number }>) {
            if (Array.isArray(params) && params.length > 0) {
              const param = params[0];
              return `${param.name}<br/>${param.seriesName}: ${param.value}`;
            }
            return '';
          }
        }
      };
    },
    []
  );

  useMount(() => {
    // @ts-ignore
    import('echarts-gl');
  });

  // generate and update chart option
  useLayoutEffect(() => {
    try {
      const rawConfig: EChartsConfig = json5.parse(code.trim());

      const { xData, yData, chartContent } = extractXYData(rawConfig);

      if (xData.length === 0 || yData.length === 0) {
        return;
      }

      setOriginalXData(xData);
      setOriginalYData(yData);
      setTotalDataLength(Math.min(xData.length, yData.length));

      const { xData: filteredXData, yData: filteredYData } = filterDataByRange(
        xData,
        yData,
        dataRange
      );

      const chartOption = createChartOption(filteredXData, filteredYData, chartContent);

      // Add toolbox for image saving
      const RenderOption = {
        ...chartOption,
        toolbox: {
          feature: {
            saveAsImage: {}
          }
        }
      };

      setOption(RenderOption as EChartsConfig);

      if (chartRef.current) {
        if (!eChart.current) {
          eChart.current = echarts.init(chartRef.current);
        }
        eChart.current.setOption(RenderOption);
      }
    } catch (error) {
      console.error('ECharts render failed:', error);
    }

    findMarkdownDom();

    return () => {
      if (eChart.current) {
        eChart.current.dispose();
        eChart.current = undefined;
      }
    };
  }, [code, findMarkdownDom, filterDataByRange, dataRange, createChartOption, extractXYData]);

  const { screenWidth } = useScreen();
  useEffect(() => {
    findMarkdownDom();
  }, [screenWidth, findMarkdownDom]);

  useEffect(() => {
    eChart.current?.resize();
  }, [width]);

  // slider control
  const handleRangeChange = useCallback((newRange: { start: number; end: number }) => {
    setDataRange(newRange);
  }, []);
  // handle drag
  const handleDrag = useCallback(
    (type: 'left' | 'right' | 'range', e: React.MouseEvent) => {
      e.preventDefault();

      setIsDragging(false);
      dragStartTime.current = Date.now();
      const startX = e.clientX;
      const { start: startValue, end: endValue } = dataRange;
      const rangeWidth = endValue - startValue;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const timeDelta = Date.now() - dragStartTime.current;

        if (deltaX > 5 || timeDelta > 100) {
          setIsDragging(true);
        }

        const deltaPercent = ((moveEvent.clientX - startX) / Math.max(width, 400)) * 100;

        // drag handle
        if (type === 'left') {
          const newStart = Math.max(0, Math.min(startValue + deltaPercent, endValue));
          handleRangeChange({ start: newStart, end: endValue });
        } else if (type === 'right') {
          const newEnd = Math.min(100, Math.max(endValue + deltaPercent, startValue));
          handleRangeChange({ start: startValue, end: newEnd });
        } else if (type === 'range') {
          const newStart = Math.max(0, Math.min(startValue + deltaPercent, 100 - rangeWidth));
          handleRangeChange({ start: newStart, end: newStart + rangeWidth });
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        setTimeout(() => setIsDragging(false), 100);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [dataRange, width, handleRangeChange]
  );

  return (
    <Box overflowX={'auto'} bg={'white'} borderRadius={'md'}>
      <Box h={'400px'} w={`${width}px`} ref={chartRef} />
      {!option && (
        <Skeleton isLoaded={true} fadeDuration={2} h={'400px'} w={`${width}px`}></Skeleton>
      )}

      {/* data range slider */}
      {option && totalDataLength > 1 && (
        <Box borderTop="1px solid #e2e8f0">
          <Box
            position="relative"
            h="40px"
            w={`${width}px`}
            minW="400px"
            bg="gray.50"
            borderRadius="md"
            overflow="hidden"
            cursor="pointer"
            onClick={(e) => {
              if (!isDragging) {
                const rect = e.currentTarget.getBoundingClientRect();
                const percentage = ((e.clientX - rect.left) / rect.width) * 100;
                const halfWidth = 10;

                const newStart = Math.max(0, Math.min(percentage - halfWidth, 80));
                const newEnd = Math.min(100, Math.max(percentage + halfWidth, 20));
                handleRangeChange({ start: newStart, end: newEnd });
              }
            }}
          >
            {/* data thumbnail */}
            {originalYData.length > 0 && (
              <svg width="100%" height="100%" style={{ position: 'absolute' }}>
                <polyline
                  points={(() => {
                    const maxVal = Math.max(...originalYData);
                    const minVal = Math.min(...originalYData);
                    const range = maxVal - minVal || 1;

                    return originalYData
                      .map((value, index) => {
                        const x = (index / (originalYData.length - 1)) * (width - 8) + 4;
                        const y = 36 - ((value - minVal) / range) * 32;
                        return `${x},${y}`;
                      })
                      .join(' ');
                  })()}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="1.5"
                  opacity="0.7"
                />
              </svg>
            )}

            {/* select area */}
            <Box
              position="absolute"
              left={`${dataRange.start}%`}
              width={`${dataRange.end - dataRange.start}%`}
              h="100%"
              bg="rgba(59, 130, 246, 0.2)"
              cursor="ew-resize"
              onMouseDown={(e) => handleDrag('range', e)}
            />

            {/* left and right drag handle */}
            <Box
              position="absolute"
              left={`${dataRange.start}%`}
              w="8px"
              h="100%"
              cursor="ew-resize"
              transform="translateX(-50%)"
              onMouseDown={(e) => handleDrag('left', e)}
            />
            <Box
              position="absolute"
              left={`${dataRange.end}%`}
              w="8px"
              h="100%"
              cursor="ew-resize"
              transform="translateX(-50%)"
              onMouseDown={(e) => handleDrag('right', e)}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default EChartsCodeBlock;
