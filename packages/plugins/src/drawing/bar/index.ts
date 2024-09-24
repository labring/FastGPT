const echarts = require('echarts');
type Props = {
  title: string;
  categories: string; // 定义 categories 为字符串数组
  values: string; // 定义 values 为数字数组
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  //   result: HTMLElement;
}>;

const generateChart = (title: string, categories: string, values: string) => {
  let chart = echarts.init(null, null, {
    renderer: 'svg', // 必须使用 SVG 模式
    ssr: true, // 开启 SSR
    width: 400, // 需要指明高和宽
    height: 300
  });
  const option = {
    title: { text: title },
    tooltip: {},
    xAxis: { data: JSON.parse(categories) },
    yAxis: {},
    series: [{ name: 'Sample', type: 'bar', data: values }]
  };

  chart.setOption(option);
  return chart.getDataURL({ type: 'png' });
};
const main = async ({ title, categories, values }: Props): Response => {
  if (typeof document !== 'undefined') {
    // 创建一个新的 div 元素并设置其 id 为 'main'
    const mainElement = document.createElement('div');
    mainElement.setAttribute('id', 'main');
    // 将新创建的元素添加到 DOM 中
    document.body.appendChild(mainElement);
    //   // 获取 id 为 'main' 的元素
    const chartDom = document.getElementById('main') as HTMLElement;
    let myChart = echarts.init(chartDom);
    let option;

    option = {
      title: title,
      tooltip: {},
      legend: {
        data: ['BarChart']
      },
      xAxis: {
        data: categories.split(',')
      },
      yAxis: {},
      series: [
        {
          name: 'BarChart',
          type: 'bar',
          data: values.split(',')
        }
      ]
    };
    option && myChart.setOption(option);
    const instance = echarts.getInstanceByDom(mainElement);
    if (instance) {
      let dataURL = '999';
      return {
        result: dataURL
      };
    } else {
      return {
        result: 'Error occurred while sending echarts'
      };
    }
  } else {
    return {
      result: generateChart(title, categories, values)
    };
  }
};

export default main;
