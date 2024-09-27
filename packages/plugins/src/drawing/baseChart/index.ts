import * as echarts from 'echarts';

type Props = {
  title: string;
  xAxis: string;
  yAxis: string;
  chartType: string;
};

type Response = Promise<{
  result: string;
}>;

type SeriesData = {
  name: string;
  type: 'bar' | 'line' | 'pie'; // 只允许这三种类型
  data: number[] | { value: number; name: string }[]; // 根据图表类型的数据结构
};
type Option = {
  backgroundColor: string;
  title: { text: string };
  tooltip: {};
  xAxis: { data: string[] };
  yAxis: {};
  series: SeriesData[]; // 使用定义的类型
};

const generateChart = async (title: string, xAxis: string, yAxis: string, chartType: string) => {
  // @ts-ignore  无法使用dom，如使用jsdom会出现生成图片无法正常展示，有高手可以帮忙解决
  const chart = echarts.init(undefined, undefined, {
    renderer: 'svg', // 必须使用 SVG 模式
    ssr: true, // 开启 SSR
    width: 400, // 需要指明高和宽
    height: 300
  });

  let parsedXAxis: string[] = [];
  let parsedYAxis: number[] = [];
  try {
    parsedXAxis = JSON.parse(xAxis);
    parsedYAxis = JSON.parse(yAxis);
  } catch (error: any) {
    console.error('解析数据时出错:', error);
    return Promise.reject('Data error');
  }

  const option: Option = {
    backgroundColor: '#f5f5f5',
    title: { text: title },
    tooltip: {},
    xAxis: { data: parsedXAxis },
    yAxis: {},
    series: [] // 初始化为空数组
  };

  // 根据 chartType 生成不同的图表
  switch (chartType) {
    case '柱状图':
      option.series.push({ name: 'Sample', type: 'bar', data: parsedYAxis });
      break;
    case '折线图':
      option.series.push({ name: 'Sample', type: 'line', data: parsedYAxis });
      break;
    case '饼图':
      option.series.push({
        name: 'Sample',
        type: 'pie',
        data: parsedYAxis.map((value, index) => ({
          value,
          name: parsedXAxis[index] // 使用 xAxis 作为饼图的名称
        }))
      });
      break;
    default:
      console.error('不支持的图表类型:', chartType);
      return '';
  }

  chart.setOption(option);
  // 生成 Base64 图像
  const base64Image = chart.getDataURL({ type: 'png' });
  // 释放图表实例
  chart.dispose();

  return base64Image;
};

const main = async ({ title, xAxis, yAxis, chartType }: Props): Response => {
  return {
    result: await generateChart(title, xAxis, yAxis, chartType)
  };
};

export default main;
