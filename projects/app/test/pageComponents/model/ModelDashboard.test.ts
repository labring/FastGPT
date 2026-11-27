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
    name?: string;
    avatar?: string;
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
    enableCumulative,
    tooltipItems
  }: {
    title: string;
    data: { totalCost: number }[];
    enableCumulative?: boolean;
    tooltipItems?: { formatter?: (value: number) => string }[];
  }) =>
    React.createElement(
      'output',
      {
        'data-chart': title,
        'data-enable-cumulative': String(enableCumulative ?? true),
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
import { calcAvgTps, getNextSortState } from '@/pageComponents/model/ModelDashboard/utils';

const cacheTier = {
  inputPrice: 2000,
  outputPrice: 4000,
  cacheReadPrice: 200,
  cacheCreationPrice: 2500
};

describe('model dashboard cache pricing', () => {
  beforeEach(() => {
    mocks.requestIndex = 0;
  });

  it.each([
    {
      name: 'ordinary input without cache metadata',
      pricing: {
        pricing: {
          tiers: [
            { maxInputTokensK: 5, inputPrice: 1, outputPrice: 1 },
            { inputPrice: 2000, outputPrice: 4000 }
          ]
        }
      } satisfies PriceType,
      usage: {},
      expected: 28,
      displayedTotal: 56
    },
    {
      name: 'ordinary fractional costs before display rounding',
      pricing: { pricing: { tiers: [{ inputPrice: 2, outputPrice: 4 }] } } satisfies PriceType,
      usage: {},
      expected: 0.028,
      displayedTotal: 0.06
    },
    {
      name: 'explicit free LLM tiers',
      pricing: { pricing: { tiers: [] } } satisfies PriceType,
      usage: { cached_tokens: 6000, cache_creation_tokens: 1000 },
      expected: 0,
      displayedTotal: 0
    },
    {
      name: 'K tiers selected by total input including cache',
      pricing: {
        pricing: {
          tiers: [{ maxInputTokensK: 5, inputPrice: 1, outputPrice: 1 }, cacheTier]
        }
      } satisfies PriceType,
      usage: { cached_tokens: 6000, cache_creation_tokens: 1000 },
      expected: 17.7,
      displayedTotal: 35.4
    },
    {
      name: 'fractional costs are accumulated before display rounding',
      pricing: {
        pricing: {
          tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2, cacheCreationPrice: 2.5 }]
        }
      } satisfies PriceType,
      usage: { cached_tokens: 6000, cache_creation_tokens: 1000 },
      expected: 0.0177,
      displayedTotal: 0.04
    }
  ])(
    'keeps chart, model and channel totals consistent for $name',
    ({ pricing, usage, expected, displayedTotal }) => {
      mocks.models = [
        {
          ...pricing,
          model: 'cache-model',
          provider: 'openai',
          scope: ModelScopeEnum.system,
          type: ModelTypeEnum.llm
        }
      ];
      mocks.data = GetChannelDashboardResponseSchema.parse(
        [1000, 4600].map((timestamp) => ({
          timestamp,
          summary: [
            {
              model: 'cache-model',
              channel_id: 12,
              request_count: 1,
              input_tokens: 10000,
              output_tokens: 2000,
              ...usage
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
            filterProps: byChannel ? { model: 'cache-model' } : {},
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

describe('model dashboard LLM TPS', () => {
  beforeEach(() => {
    mocks.requestIndex = 0;
  });

  it('calculates output_tokens / total_time_s with zero-safe guards', () => {
    expect(calcAvgTps(1500, 30000)).toBe(50);
    expect(calcAvgTps(100, 3000)).toBe(33.33);
    expect(calcAvgTps(0, 3000)).toBe(0);
    expect(calcAvgTps(100, 0)).toBe(0);
    expect(calcAvgTps(-10, 1000)).toBe(0);
  });

  it('cycles tri-state table sorting: none -> desc -> asc -> none', () => {
    const s1 = getNextSortState({ field: null, direction: null }, 'avgTps');
    expect(s1).toEqual({ field: 'avgTps', direction: 'desc' });
    const s2 = getNextSortState(s1, 'avgTps');
    expect(s2).toEqual({ field: 'avgTps', direction: 'asc' });
    const s3 = getNextSortState(s2, 'avgTps');
    expect(s3).toEqual({ field: null, direction: null });
    // 切换新列从降序开始
    expect(getNextSortState(s2, 'totalCalls')).toEqual({ field: 'totalCalls', direction: 'desc' });
  });

  it('excludes non-LLM duration from chart avgTps and renders TPS column for LLM models only', () => {
    mocks.models = [
      {
        pricing: { tiers: [] },
        model: 'gpt-4o',
        name: 'GPT-4o',
        avatar: 'model/openai',
        provider: 'openai',
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.llm
      },
      {
        pricing: { tiers: [] },
        model: 'text-embedding-3',
        provider: 'openai',
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.embedding
      }
    ];
    mocks.data = GetChannelDashboardResponseSchema.parse([
      {
        timestamp: 1000,
        summary: [
          {
            model: 'gpt-4o',
            channel_id: 12,
            request_count: 2,
            output_tokens: 300,
            total_time_milliseconds: 6000
          },
          {
            model: 'text-embedding-3',
            channel_id: 12,
            request_count: 5,
            output_tokens: 0,
            total_time_milliseconds: 10000
          }
        ]
      },
      {
        timestamp: 4600,
        summary: [
          {
            model: 'gpt-4o',
            channel_id: 12,
            request_count: 1,
            output_tokens: 200,
            total_time_milliseconds: 4000
          }
        ]
      }
    ]);

    const render = (element: React.ReactElement) =>
      new JSDOM(renderToStaticMarkup(React.createElement(ChakraProvider, { theme }, element)));

    const chart = render(React.createElement(ModelDashboard, { Tab: null, channelType: 'system' }));
    const tpsChart = chart.window.document.querySelector('[data-chart="config_model:avg_tps"]')!;
    const cacheChart = chart.window.document.querySelector(
      '[data-chart="config_model:cache_hit_rate"]'
    )!;
    const points = JSON.parse(tpsChart.textContent!) as { avgTps: number }[];
    // 仅统计 LLM 耗时：300 / 6s = 50，200 / 4s = 50；embedding 的 10s 不拉低 TPS。
    expect(points.map(({ avgTps }) => avgTps)).toEqual([50, 50]);
    expect(tpsChart.getAttribute('data-enable-cumulative')).toBe('false');
    expect(cacheChart.getAttribute('data-enable-cumulative')).toBe('false');
    chart.window.close();

    const isLLMModel = (model: string) => model === 'gpt-4o';
    const modelTable = render(
      React.createElement(DataTableComponent, {
        data: mocks.data,
        filterProps: {},
        channelList: [{ label: 'Channel', value: '12' }],
        modelPriceMap: new Map(mocks.models.map((model) => [model.model, model])),
        isLLMModel,
        onViewDetail: vi.fn()
      })
    );
    const getVisibleText = (el: Element) => {
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll('style').forEach((node) => node.remove());
      return clone.textContent?.trim();
    };
    const rows = Array.from(modelTable.window.document.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map(getVisibleText)
    );
    const llmRow = rows.find((cells) => cells[0] === 'GPT-4o');
    const embeddingRow = rows.find((cells) => cells[0] === 'text-embedding-3');
    // 列顺序（无渠道列、含计费列）：模型[0]、调用量[1]、失败量[2]、积分[3]、耗时[4]、TTFB[5]、TPS[6]、缓存[7]
    expect(llmRow?.[6]).toBe('50.00');
    expect(embeddingRow?.[6]).toBe('-');
    modelTable.window.close();

    const channelTable = render(
      React.createElement(DataTableComponent, {
        data: mocks.data.map((point) => ({
          ...point,
          summary: point.summary.filter((item) => item.model === 'gpt-4o')
        })),
        filterProps: { model: 'gpt-4o' },
        channelList: [{ label: 'Channel', value: '12' }],
        modelPriceMap: new Map(mocks.models.map((model) => [model.model, model])),
        isLLMModel,
        onViewDetail: vi.fn()
      })
    );
    const channelCells = Array.from(
      channelTable.window.document.querySelectorAll('tbody tr td')
    ).map((td) => td.textContent?.trim());
    // 含渠道列时 TPS 在索引 7
    expect(channelCells[7]).toBe('50.00');
    channelTable.window.close();
  });
});
