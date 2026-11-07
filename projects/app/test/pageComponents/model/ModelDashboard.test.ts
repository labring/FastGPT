import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceType } from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { theme } from '@fastgpt/web/styles/theme';
import {
  GetChannelDashboardResponseSchema,
  type GetChannelDashboardResponse
} from '@fastgpt/global/openapi/core/ai/model/channel/api';

const mocks = vi.hoisted(() => ({
  requestIndex: 0,
  data: [] as GetChannelDashboardResponse,
  models: [] as (PriceType & {
    model: string;
    provider: string;
    type: ModelTypeEnum;
    scope: ModelScopeEnum;
  })[]
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: true } })
}));
vi.mock('@/web/core/ai/model/useModelConfig', () => ({
  useModelConfig: () => ({
    models: mocks.models,
    getModelProvider: () => ({ order: 0, avatar: '' })
  })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ data: mocks.requestIndex++ % 2 === 0 ? [] : mocks.data, loading: false })
}));
// 只替换请求、图形和筛选器外壳；生产组件执行全部监控数据聚合和计价。
vi.mock('@fastgpt/web/components/common/charts/AreaChartComponent', () => ({
  default: ({
    title,
    data,
    tooltipItems
  }: {
    title: string;
    data: { totalCost: number }[];
    tooltipItems?: { formatter?: (value: number) => string }[];
  }) =>
    React.createElement(
      'output',
      {
        'data-chart': title,
        'data-displayed-total': tooltipItems?.[0]?.formatter?.(
          data.reduce((sum, point) => sum + point.totalCost, 0)
        )
      },
      JSON.stringify(data)
    )
}));
vi.mock('@fastgpt/web/components/common/DateRangePicker', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({ SingleSelectFilter: () => null }));
vi.mock('@fastgpt/web/components/common/Tabs/FillRowTabs', () => ({ default: () => null }));
vi.mock('@/components/core/ai/ModelTabHeader', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableLayout: ({ renderBody }: { renderBody: () => React.ReactNode }) => renderBody()
}));

import ModelDashboard from '@/pageComponents/model/ModelDashboard';
import DataTableComponent from '@/pageComponents/model/ModelDashboard/DataTableComponent';

const tier = { inputPrice: 2000, outputPrice: 4000 };

describe('model dashboard million-unit pricing', () => {
  beforeEach(() => {
    mocks.requestIndex = 0;
  });

  it.each([
    {
      name: 'M tiers selected by total input',
      pricing: {
        pricing: { tiers: [{ maxInputTokens: 0.005, inputPrice: 1, outputPrice: 1 }, tier] }
      } satisfies PriceType,
      expected: 28,
      displayedTotal: 56
    },
    {
      name: 'fractional costs are accumulated before display rounding',
      pricing: {
        pricing: { tiers: [{ inputPrice: 2, outputPrice: 4 }] }
      } satisfies PriceType,
      expected: 0.028,
      displayedTotal: 0.06
    },
    {
      name: 'explicit free LLM tiers',
      pricing: { pricing: { tiers: [] } } satisfies PriceType,
      expected: 0,
      displayedTotal: 0
    }
  ])(
    'keeps chart, model and channel totals consistent for $name',
    ({ pricing, expected, displayedTotal }) => {
      mocks.models = [
        {
          ...pricing,
          model: 'unit-model',
          provider: 'openai',
          type: ModelTypeEnum.llm,
          scope: ModelScopeEnum.system
        }
      ];
      mocks.data = GetChannelDashboardResponseSchema.parse(
        [1000, 4600].map((timestamp) => ({
          timestamp,
          summary: [
            {
              model: 'unit-model',
              channel_id: 12,
              request_count: 1,
              input_tokens: 10000,
              output_tokens: 2000
            }
          ]
        }))
      );

      const render = (element: React.ReactElement) =>
        new JSDOM(renderToStaticMarkup(React.createElement(ChakraProvider, { theme }, element)));
      const chart = render(
        React.createElement(ModelDashboard, { Tab: null, channelType: 'system' })
      );
      const costChart = chart.window.document.querySelector(
        '[data-chart="config_model:aipoint_usage"]'
      )!;
      const points = JSON.parse(costChart.textContent!) as { totalCost: number }[];
      expect(points.map(({ totalCost }) => totalCost)).toEqual([expected, expected]);
      expect(Number(costChart.getAttribute('data-displayed-total'))).toBe(displayedTotal);
      chart.window.close();

      for (const byChannel of [false, true]) {
        const table = render(
          React.createElement(DataTableComponent, {
            data: mocks.data,
            filterProps: byChannel ? { model: 'unit-model' } : {},
            channelList: [{ label: 'Channel', value: '12' }],
            modelPriceMap: new Map(mocks.models.map((model) => [model.model, model])),
            isLLMModel: () => true,
            onViewDetail: vi.fn()
          })
        );
        const cells = table.window.document.querySelectorAll('tbody tr td');
        expect(Number(cells[byChannel ? 4 : 3].textContent)).toBe(displayedTotal);
        table.window.close();
      }
    }
  );
});
