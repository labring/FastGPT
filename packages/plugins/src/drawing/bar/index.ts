import * as echarts from 'echarts';

type Props = {
  title: string;
  categories: string; // 定义 categories 为字符串数组
  values: string; // 定义 values 为数字数组
};

type Response = Promise<{
  result: string;
}>;

const generateChart = (title: string, categories: string, values: string) => {
  // @ts-ignore  无法使用dom，如使用jsdom会出现生成图片无法正常展示，有高手可以帮忙解决
  const chart = echarts.init(undefined, undefined, {
    renderer: 'svg', // 必须使用 SVG 模式
    ssr: true, // 开启 SSR
    width: 400, // 需要指明高和宽
    height: 300
  });

  let parsedCategories: string[] = [];
  try {
    parsedCategories = JSON.parse(categories);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('解析数据时出错:', error.message);
    } else {
      console.error('解析数据时出错:', error);
    }
  }

  const option = {
    backgroundColor: '#f5f5f5',
    title: { text: title },
    tooltip: {},
    xAxis: { data: parsedCategories },
    yAxis: {},
    series: [{ name: 'Sample', type: 'line', data: values }],
    grid: {
      left: '100%', // 左边距
      right: '100%', // 右边距
      top: '20%', // 上边距
      bottom: '10%' // 下边距
    }
  };

  chart.setOption(option);
  // 生成 Base64 图像
  const base64Image = chart.getDataURL({ type: 'png' });
  // 释放图表实例
  chart.dispose();

  return base64Image;
};

const main = async ({ title, categories, values }: Props): Response => {
  return {
    result: generateChart(title, categories, values)
  };
};

export default main;
