import { expect, test, vi } from 'vitest';
import tool from '..';

test('baseChart', async () => {
  const result = await tool.cb({
    title: '测试图表',
    xAxis: ['2022', '2023', '2024'],
    yAxis: [10, 20, 30],
    chartType: '柱状图'
  });
  expect(result.output['图表 url']).toBeDefined();
});
