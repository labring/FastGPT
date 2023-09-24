import React, { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { useGlobalStore } from '@/store/global';
import { getAppTotalUsage } from '@/api/app';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { formatPrice } from '@fastgpt/common/bill/index';
import Loading from '@/components/Loading';
import { Box } from '@chakra-ui/react';

const map = {
  blue: {
    backgroundColor: {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        {
          offset: 0,
          color: 'rgba(3, 190, 232, 0.42)' // 0% 处的颜色
        },
        {
          offset: 1,
          color: 'rgba(0, 182, 240, 0)'
        }
      ],
      global: false // 缺省为 false
    },
    lineColor: '#36ADEF'
  },
  deepBlue: {
    backgroundColor: {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        {
          offset: 0,
          color: 'rgba(47, 112, 237, 0.42)' // 0% 处的颜色
        },
        {
          offset: 1,
          color: 'rgba(94, 159, 235, 0)'
        }
      ],
      global: false
    },
    lineColor: '#3293EC'
  },
  purple: {
    backgroundColor: {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        {
          offset: 0,
          color: 'rgba(211, 190, 255, 0.42)' // 0% 处的颜色
        },
        {
          offset: 1,
          color: 'rgba(52, 60, 255, 0)'
        }
      ],
      global: false // 缺省为 false
    },
    lineColor: '#8172D8'
  },
  green: {
    backgroundColor: {
      type: 'linear',
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        {
          offset: 0,
          color: 'rgba(4, 209, 148, 0.42)' // 0% 处的颜色
        },
        {
          offset: 1,
          color: 'rgba(19, 217, 181, 0)'
        }
      ],
      global: false // 缺省为 false
    },
    lineColor: '#00A9A6',
    max: 100
  }
};

const TokenUsage = ({ appId }: { appId: string }) => {
  const { screenWidth } = useGlobalStore();

  const Dom = useRef<HTMLDivElement>(null);
  const myChart = useRef<echarts.ECharts>();
  const { data = [] } = useQuery(['init'], () => getAppTotalUsage({ appId }));

  const option = useMemo(
    () => ({
      xAxis: {
        type: 'category',
        show: false,
        boundaryGap: false,
        data: data.map((item) => item.date)
      },
      yAxis: {
        type: 'value',
        splitNumber: 3,
        min: 0
      },
      grid: {
        show: false,
        left: 5,
        right: 5,
        top: 0,
        bottom: 5
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line'
        },
        formatter: (e: any[]) => {
          const data = e[0];
          if (!data) return '';

          return `
          <div>
            <div>${dayjs(data.axisValue).format('YYYY/MM/DD')}</div>
            <div>${formatPrice(e[0]?.value || 0)}元</div>
          </div>
`;
        }
      },
      series: [
        {
          data: data.map((item) => item.total),
          type: 'line',
          showSymbol: true,
          animationDuration: 1000,
          animationEasingUpdate: 'linear',
          areaStyle: {
            color: map['blue'].backgroundColor
          },
          lineStyle: {
            width: '1',
            color: map['blue'].lineColor
          },
          itemStyle: {
            width: 1.5,
            color: map['blue'].lineColor
          },
          emphasis: {
            // highlight
            disabled: true
          }
        }
      ]
    }),
    [data]
  );

  // init chart
  useEffect(() => {
    if (!Dom.current || myChart?.current?.getOption()) return;
    myChart.current = echarts.init(Dom.current);
    myChart.current && myChart.current.setOption(option);

    setTimeout(() => {
      myChart.current?.resize();
    }, 500);
  }, []);

  // data changed, update
  useEffect(() => {
    if (!myChart.current || !myChart?.current?.getOption()) return;
    myChart.current.setOption(option);
  }, [data, option]);

  // resize chart
  useEffect(() => {
    if (!myChart.current || !myChart.current.getOption()) return;
    myChart.current.resize();
  }, [screenWidth]);

  return (
    <Box ref={Dom} w={'100%'} flex={'1 0 0'} h={'100%'} position={'relative'}>
      <Loading fixed={false} />
    </Box>
  );
};

export default React.memo(TokenUsage);
