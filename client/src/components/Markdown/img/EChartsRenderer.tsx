import React, { useRef, useEffect } from 'react';
import { ECharts } from 'echarts';

interface EChartsRendererProps {
  getOption: () => any;
}


const EChartsRenderer: React.FC<EChartsRendererProps> = ({ getOption }) => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let chartInstance: ECharts | null = null;

    (async () => {
      const echarts = await import('echarts');
      await import('echarts-gl');
      if (chartRef.current) {
        chartInstance = echarts.init(chartRef.current, { renderer: 'svg', ssr: true });
        const option = getOption();
        chartInstance.setOption(option);
      }
    })();

    return () => {
      if (chartInstance) {
        chartInstance.dispose();
      }
    };
  }, [getOption]);

  return <div style={{ width: '100%', height: '400px', minWidth: '600px' }} ref={chartRef} />;
};

export default EChartsRenderer;
