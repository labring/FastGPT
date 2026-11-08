import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  services: [] as (() => Promise<unknown>)[],
  chartData: undefined as
    | { chatData: { timestamp: number; summary: Record<string, number> }[] }
    | undefined,
  lines: [] as { title: string; data: { x: string; chatCount: number }[] }[],
  chart: vi.fn().mockResolvedValue({}),
  total: vi.fn().mockResolvedValue({})
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: true } })
}));
vi.mock('@/web/core/app/api/log', () => ({
  getAppChartData: mocks.chart,
  getAppTotalData: mocks.total
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: (service: () => Promise<unknown>) => {
    const index = mocks.services.push(service) - 1;
    return { data: index === 0 ? mocks.chartData : undefined, loading: false };
  }
}));
vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  const Box = ({ children }: React.PropsWithChildren) => React.createElement('div', null, children);
  return {
    ...actual,
    Accordion: Box,
    AccordionButton: Box,
    AccordionIcon: Box,
    AccordionItem: Box,
    AccordionPanel: Box,
    Box,
    Flex: Box,
    Grid: Box
  };
});
vi.mock('@fastgpt/web/components/common/charts/LineChartComponent', () => ({
  default: (props: { title: string; data: { x: string; chatCount: number }[] }) => {
    mocks.lines.push(props);
    return null;
  }
}));
vi.mock('@fastgpt/web/components/common/charts/BarChartComponent', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@fastgpt/web/components/common/DateRangePicker', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({
  MultiSelectFilter: () => null,
  useCommonFilterLabels: () => ({}),
  toMultiSelectFilterQuery: () => undefined
}));

import LogChart from '@/pageComponents/app/detail/Logs/LogChart';

describe('LogChart selected date range', () => {
  beforeEach(() => {
    mocks.services = [];
    mocks.lines = [];
    mocks.chartData = undefined;
    vi.clearAllMocks();
  });
  it('sends exactly November 2 through November 9 without adding an extra day', async () => {
    const range = { from: new Date(2026, 10, 2), to: new Date(2026, 10, 9, 23, 59, 59, 999) };
    renderToStaticMarkup(
      React.createElement(LogChart, {
        appId: 'app',
        dateRange: range,
        setDateRange: vi.fn(),
        sourceFilter: { mode: 'all', values: [] },
        setSourceFilter: vi.fn()
      })
    );
    await Promise.all(mocks.services.map((service) => service()));
    const params = mocks.chart.mock.calls[0][0];
    expect(params.dateStart).toMatch(/^2026-11-02T00:00:00\.000[+-]\d{2}:\d{2}$/);
    expect(params.dateEnd).toMatch(/^2026-11-09T23:59:59\.999[+-]\d{2}:\d{2}$/);
    expect(new Date(params.dateStart)).toEqual(range.from);
    expect(new Date(params.dateEnd)).toEqual(range.to);
    expect(params).not.toHaveProperty('timezone');
  });

  it.each([
    {
      from: '2026-10-28T00:00:00-04:00',
      to: '2026-11-03T23:59:59.999-05:00',
      buckets: ['2026-11-01T00:00:00-04:00', '2026-11-02T00:00:00-04:00'],
      counts: [1, 1],
      labels: ['11-01', '11-02']
    },
    {
      from: '2026-03-04T00:00:00-05:00',
      to: '2026-03-10T23:59:59.999-04:00',
      buckets: ['2026-03-08T00:00:00-05:00'],
      counts: [2],
      labels: ['03-08']
    }
  ])(
    'preserves all fixed-offset chart buckets when the browser crosses DST: $from',
    ({ from, to, buckets, counts, labels }) => {
      const range = { from: new Date(from), to: new Date(to) };
      const startOffset = range.from.getTimezoneOffset() * 60 * 1000;
      mocks.chartData = {
        chatData: buckets.map((time, index) => ({
          timestamp: new Date(`${time.slice(0, 10)}T00:00:00.000Z`).getTime() + startOffset,
          summary: {
            chatCount: counts[index],
            chatItemCount: counts[index],
            points: 0,
            errorCount: 0,
            inputTokens: 0,
            outputTokens: 0
          }
        }))
      };
      renderToStaticMarkup(
        React.createElement(LogChart, {
          appId: 'app',
          dateRange: range,
          setDateRange: vi.fn(),
          sourceFilter: { mode: 'all', values: [] },
          setSourceFilter: vi.fn()
        })
      );
      const chart = mocks.lines.find(({ title }) => title === 'app:logs_chat_count')!;
      expect(
        chart.data
          .filter(({ chatCount }) => chatCount > 0)
          .map(({ x, chatCount }) => ({ x, chatCount }))
      ).toEqual(labels.map((x, index) => ({ x, chatCount: counts[index] })));
      expect(chart.data.reduce((sum, item) => sum + item.chatCount, 0)).toBe(2);
    }
  );
});
