import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { Box, Skeleton } from '@chakra-ui/react';
import json5 from 'json5';
import { useMount } from 'ahooks';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useScreen } from '@fastgpt/web/hooks/useScreen';

const EChartsCodeBlock = ({ code }: { code: string }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const eChart = useRef<ECharts>();
  const { isPc } = useSystem();
  const [option, setOption] = useState<any>();
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
    const option = (() => {
      try {
        const parse = {
          ...json5.parse(code.trim()),
          toolbox: {
            // show: true,
            feature: {
              saveAsImage: {}
            }
          }
        };

        return parse;
      } catch (error) {}
    })();

    setOption(option ?? {});

    if (!option) return;

    if (chartRef.current) {
      eChart.current = echarts.init(chartRef.current);
      eChart.current.setOption(option);
    }

    findMarkdownDom();

    return () => {
      if (eChart.current) {
        eChart.current.dispose();
      }
    };
  }, [code, findMarkdownDom]);

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
