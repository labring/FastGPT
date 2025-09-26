import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { Box, Skeleton } from '@chakra-ui/react';
import json5 from 'json5';
import { useMount } from 'ahooks';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useScreen } from '@fastgpt/web/hooks/useScreen';

const EChartsCodeBlock = ({
  code,
  echartConfig
}: {
  code?: string;
  echartConfig?: echarts.EChartsOption;
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const eChart = useRef<ECharts>();
  const { isPc } = useSystem();
  const [option, setOption] = useState<echarts.EChartsOption>();
  const [width, setWidth] = useState(400);

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

  useMount(() => {
    // @ts-ignore
    import('echarts-gl');
  });

  useLayoutEffect(() => {
    const defaultOptions = {
      xAxis: {
        axisLabel: {
          rotate: 45,
          interval: 0
        }
      }
    };

    const rawOption = (() => {
      try {
        return echartConfig ? echartConfig : (json5.parse(code!.trim()) as echarts.EChartsOption);
      } catch {
        return {};
      }
    })();

    const xAxis = rawOption.xAxis;

    if (Array.isArray(xAxis)) {
      xAxis.forEach((item) => {
        item.axisLabel = {
          ...defaultOptions.xAxis.axisLabel,
          ...item.axisLabel
        };
      });
    } else if (xAxis) {
      xAxis.axisLabel = {
        ...defaultOptions.xAxis.axisLabel,
        ...xAxis.axisLabel
      };
    }

    const option = {
      ...rawOption,
      grid: {
        left: '10%', // 左边距
        right: '5%', // 右边距
        top: '15%', // 顶边距
        bottom: '25%' // 底边距
      },
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          show: true,
          realtime: true, // 实时渲染
          zoomLock: false
        }
      ],
      toolbox: {
        feature: {
          saveAsImage: {
            show: true
          }
        }
      }
    };
    setOption(option);

    if (!rawOption) return;

    if (chartRef.current) {
      try {
        eChart.current = echarts.init(chartRef.current);
        eChart.current.setOption(option);
      } catch (error) {
        console.error('ECharts render failed:', error);
      }
    }

    findMarkdownDom();

    return () => {
      if (eChart.current) {
        eChart.current.dispose();
      }
    };
  }, [code, echartConfig, findMarkdownDom]);

  const { screenWidth } = useScreen();
  useEffect(() => {
    findMarkdownDom();
  }, [screenWidth]);

  useEffect(() => {
    eChart.current?.resize();
  }, [width]);

  return (
    <Box overflowX={'auto'} bg={'white'} borderRadius={'md'}>
      <Box h={'400px'} w={`${width}px`} ref={chartRef} />
      {!option && (
        <Skeleton isLoaded={true} fadeDuration={2} h={'400px'} w={`${width}px`}></Skeleton>
      )}
    </Box>
  );
};

export default EChartsCodeBlock;
