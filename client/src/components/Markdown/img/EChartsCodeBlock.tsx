// EChartsCodeBlock.tsx

import React, { useMemo } from 'react';
import EChartsRenderer from './EChartsRenderer';
import * as echarts from 'echarts';


interface EChartsCodeBlockProps {
  code: string;
}

const EChartsCodeBlock: React.FC<EChartsCodeBlockProps> = ({ code }) => {
  const getOption = useMemo(() => {
    try {
      const optionFunction = new Function("echarts",'"use strict";' + code + '; return getChartOption;');
      return optionFunction(echarts); // 添加 echarts 参数
    } catch (error) {
      console.error('Error parsing ECharts code:', '\n', error, '\n', 'Code:', code);
      return null;
    }
  }, [code]);

  return getOption ? <EChartsRenderer getOption={getOption} /> : null;
};

export default EChartsCodeBlock;
