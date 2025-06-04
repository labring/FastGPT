import { defineInputSchema } from '@/type';
import { z } from 'zod';
import * as echarts from 'echarts';

export const InputType = defineInputSchema(
  z.object({
    title: z.string(),
    xAxis: z.array(z.string()),
    yAxis: z.array(z.union([z.string(), z.number()])),
    chartType: z.string()
  })
);

type SeriesData = {
  name: string;
  type: 'bar' | 'line' | 'pie'; // 只允许这三种类型
  data: number[] | { value: number; name: string }[]; // 根据图表类型的数据结构
};

type Option = {
  backgroundColor: string;
  title: { text: string };
  tooltip: object;
  xAxis: { data: string[] };
  yAxis: object;
  series: SeriesData[]; // 使用定义的类型
};
export const OutputType = z.object({
  '图表 url': z.string()
});

const generateChart = async (
  title: string,
  xAxis: string[],
  yAxis: string[],
  chartType: string
) => {
  const chart = echarts.init(undefined, undefined, {
    renderer: 'svg', // 必须使用 SVG 模式
    ssr: true, // 开启 SSR
    width: 400, // 需要指明高和宽
    height: 300
  });

  const option: Option = {
    backgroundColor: '#f5f5f5',
    title: { text: title },
    tooltip: {},
    xAxis: { data: xAxis },
    yAxis: {},
    series: [] // 初始化为空数组
  };

  // 根据 chartType 生成不同的图表
  switch (chartType) {
    case '柱状图':
      option.series.push({ name: 'Sample', type: 'bar', data: yAxis.map(Number) });
      break;
    case '折线图':
      option.series.push({ name: 'Sample', type: 'line', data: yAxis.map(Number) });
      break;
    case '饼图':
      option.series.push({
        name: 'Sample',
        type: 'pie',
        data: yAxis.map((value, index) => ({
          value: Number(value),
          name: xAxis[index] // 使用 xAxis 作为饼图的名称
        }))
      });
      break;
    default:
      console.error('不支持的图表类型:', chartType);
      return '';
  }

  chart.setOption(option);
  const svgContent = chart.renderToSVGString();
  // 生成 Base64 图像
  // const base64Image = await new Promise<string>((resolve, reject) => {
  //   try {
  //     const dataURL = chart.getDataURL({
  //       type: 'svg',
  //       pixelRatio: 2 // 可以设置更高的像素比以获得更清晰的图像
  //     });
  //     if (dataURL) {
  //       resolve(dataURL);
  //     } else {
  //       reject(new Error('Failed to generate base64 image'));
  //     }
  //   } catch (error) {
  //     reject(error);
  //   }
  // });
  // console.log(base64Image);
  // const svgContent = decodeURIComponent(base64Image.split(',')[1]);
  const base64 = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;

  return base64;
};

export async function tool({
  title,
  xAxis,
  yAxis,
  chartType
}: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const base64 = await generateChart(
    title,
    xAxis,
    yAxis.map((value) => value.toString()),
    chartType
  );
  return {
    '图表 url': base64
  };
}
