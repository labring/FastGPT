import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { Box, Skeleton } from '@chakra-ui/react';

const EChartsCodeBlock = ({ code }: { code: string }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const eChart = useRef<ECharts>();
  const [option, setOption] = useState<any>();
  const [width, setWidth] = useState(400);

  useEffect(() => {
    const clientWidth = document.getElementById('chat-container')?.clientWidth || 500;
    setWidth(clientWidth * 0.9);
    setTimeout(() => {
      eChart.current?.resize();
    }, 100);
  }, []);

  useEffect(() => {
    let option;
    try {
      option = JSON.parse(code.trim());
      option = {
        ...option,
        toolbox: {
          show: true,
          feature: {
            saveAsImage: {}
          }
        }
      };
      setOption(option);
    } catch (error) {}

    if (!option) return;

    (async () => {
      // @ts-ignore
      await import('echarts-gl');
    })();

    if (chartRef.current) {
      eChart.current = echarts.init(chartRef.current);
      eChart.current.setOption(option);
      eChart.current?.resize();
    }

    return () => {
      if (eChart.current) {
        eChart.current.dispose();
      }
    };
  }, [code]);

  return (
    <Box overflowX={'auto'}>
      <Box h={'400px'} minW={'400px'} w={`${width}px`} ref={chartRef} />
      {!option && <Skeleton isLoaded={true} fadeDuration={2} h={'400px'} w={`400px`}></Skeleton>}
    </Box>
  );
};

export default EChartsCodeBlock;
