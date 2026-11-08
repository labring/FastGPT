import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  services: [] as (() => Promise<unknown>)[],
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
    mocks.services.push(service);
    return { data: undefined, loading: false };
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
  default: () => null
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
    expect(params.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});
