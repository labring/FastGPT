import React, { act } from 'react';
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

vi.mock('@chakra-ui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chakra-ui/react')>();
  // Node 测试环境下 Emotion 处于 SSR 模式不会转发 Box ref，这里透传 ref 使真实 FixedTableLayout 绑定滚动监听。
  const Box = React.forwardRef<
    HTMLElement,
    { as?: string; children?: React.ReactNode; [key: string]: unknown }
  >(function ForwardRefBox({ as = 'div', children, ...rest }, ref) {
    const tag = typeof as === 'string' ? as : 'div';
    const domProps: Record<string, unknown> = { ref };
    for (const [key, value] of Object.entries(rest)) {
      if (
        key.startsWith('data-') ||
        key.startsWith('aria-') ||
        key === 'type' ||
        key === 'onClick' ||
        key === 'title' ||
        key === 'viewBox' ||
        key === 'fill' ||
        key === 'style'
      ) {
        domProps[key] = value;
      }
    }
    return React.createElement(tag, domProps, children);
  });
  return { ...actual, Box };
});

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
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: React.forwardRef(function MockIcon() {
    return null;
  })
}));
vi.mock('@/components/core/ai/ModelTabHeader', () => ({ default: () => null }));

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
            total_time_milliseconds: 5000
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
            output_tokens: 450,
            total_time_milliseconds: 15000
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
    // 仅统计 LLM 耗时：300 / 5s = 60，450 / 15s = 30；embedding 的 10s 不拉低 TPS。
    expect(JSON.parse(tpsChart.textContent ?? '[]')).toEqual([
      expect.objectContaining({ avgTps: 60 }),
      expect.objectContaining({ avgTps: 30 })
    ]);
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
    const rows = Array.from(modelTable.window.document.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => {
        const clone = td.cloneNode(true);
        if (clone instanceof modelTable.window.Element) {
          clone.querySelectorAll('style').forEach((node) => node.remove());
          return clone.textContent?.trim();
        }
        return td.textContent?.trim();
      })
    );
    const llmRow = rows.find((cells) => cells[0] === 'GPT-4o');
    const embeddingRow = rows.find((cells) => cells[0] === 'text-embedding-3');
    // 表格汇总使用总输出 token / 总耗时：(300 + 450) / (5 + 15) = 37.50（区别于逐桶均值 45.00）。
    expect(llmRow?.[6]).toBe('37.50');
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
    // 含渠道列时 TPS 在索引 7，同样验证总输出 token / 总耗时 = 37.50
    expect(channelCells[7]).toBe('37.50');
    channelTable.window.close();
  });

  it('cycles tri-state sorting and keeps header/body aligned on narrow horizontal scroll', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
    vi.stubGlobal('Image', dom.window.Image);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    // 在 jsdom 全局就绪后重载模块，使 Chakra/Emotion 以浏览器模式正确转发 FixedTableLayout 的 ref。
    vi.resetModules();
    const [
      { createRoot: createClientRoot },
      { ChakraProvider: ClientChakraProvider },
      { default: ClientDataTable }
    ] = await Promise.all([
      import('react-dom/client'),
      import('@chakra-ui/react'),
      import('@/pageComponents/model/ModelDashboard/DataTableComponent')
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createClientRoot(container);

    const models = [
      {
        pricing: { tiers: [] },
        model: 'slow-llm',
        name: 'Slow LLM',
        provider: 'openai',
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.llm
      },
      {
        pricing: { tiers: [] },
        model: 'fast-llm',
        name: 'Fast LLM',
        provider: 'openai',
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.llm
      },
      {
        pricing: { tiers: [] },
        model: 'mid-llm',
        name: 'Mid LLM',
        provider: 'openai',
        scope: ModelScopeEnum.system,
        type: ModelTypeEnum.llm
      }
    ];
    // 原始顺序：slow-llm(20 TPS, 10 calls), fast-llm(80 TPS, 5 calls), mid-llm(50 TPS, 20 calls)
    const data = GetChannelDashboardResponseSchema.parse([
      {
        timestamp: 1000,
        summary: [
          {
            model: 'slow-llm',
            channel_id: 1,
            request_count: 10,
            output_tokens: 200,
            total_time_milliseconds: 10000
          },
          {
            model: 'fast-llm',
            channel_id: 1,
            request_count: 5,
            output_tokens: 800,
            total_time_milliseconds: 10000
          },
          {
            model: 'mid-llm',
            channel_id: 1,
            request_count: 20,
            output_tokens: 500,
            total_time_milliseconds: 10000
          }
        ]
      }
    ]);

    const getRowModels = () =>
      Array.from(container.querySelectorAll('tbody tr')).map((tr) => {
        const firstTd = tr.querySelector('td');
        if (!firstTd) return '';
        const clone = firstTd.cloneNode(true);
        if (clone instanceof dom.window.Element) {
          clone.querySelectorAll('style').forEach((node) => node.remove());
          return clone.textContent?.trim() ?? '';
        }
        return firstTd.textContent?.trim() ?? '';
      });

    try {
      await act(async () => {
        root.render(
          React.createElement(
            ClientChakraProvider,
            { theme },
            React.createElement(ClientDataTable, {
              data,
              filterProps: {},
              channelList: [{ label: 'Channel', value: '1' }],
              modelPriceMap: new Map(models.map((model) => [model.model, model])),
              isLLMModel: () => true,
              onViewDetail: vi.fn()
            })
          )
        );
      });

      const tpsButton = Array.from(container.querySelectorAll('thead th button')).find(
        (btn): btn is HTMLButtonElement =>
          btn instanceof dom.window.HTMLButtonElement &&
          (btn.textContent?.includes('config_model:avg_tps') ?? false)
      );
      expect(tpsButton).toBeDefined();
      expect(tpsButton?.type).toBe('button');

      const tpsTh = tpsButton?.closest('th');
      expect(tpsTh?.getAttribute('aria-sort')).toBe('none');
      // 默认按请求次数降序：Mid(20), Slow(10), Fast(5)
      expect(getRowModels()).toEqual(['Mid LLM', 'Slow LLM', 'Fast LLM']);

      const headerContainer = container.querySelector<HTMLDivElement>('[data-fixed-table-header]');
      const bodyContainer = container.querySelector<HTMLDivElement>('[data-fixed-table-body]');
      expect(headerContainer).not.toBeNull();
      expect(bodyContainer).not.toBeNull();

      // 模拟窄容器内 Tab 聚焦屏外排序按钮时浏览器滚动 overflow:hidden 表头容器
      await act(async () => {
        tpsButton?.focus();
        headerContainer!.scrollLeft = 300;
        headerContainer!.dispatchEvent(new dom.window.Event('scroll'));
      });
      expect(bodyContainer!.scrollLeft).toBe(300);
      expect(headerContainer!.scrollLeft).toBe(300);

      // 第 1 次点击：TPS 降序，排序后表头与表体仍对齐
      await act(async () => {
        tpsButton?.click();
      });
      expect(tpsTh?.getAttribute('aria-sort')).toBe('descending');
      expect(getRowModels()).toEqual(['Fast LLM', 'Mid LLM', 'Slow LLM']);
      expect(headerContainer!.scrollLeft).toBe(300);
      expect(bodyContainer!.scrollLeft).toBe(300);

      // 第 2 次点击：TPS 升序
      await act(async () => {
        tpsButton?.click();
      });
      expect(tpsTh?.getAttribute('aria-sort')).toBe('ascending');
      expect(getRowModels()).toEqual(['Slow LLM', 'Mid LLM', 'Fast LLM']);
      expect(headerContainer!.scrollLeft).toBe(300);
      expect(bodyContainer!.scrollLeft).toBe(300);

      // 第 3 次点击：取消排序，恢复聚合原始顺序
      await act(async () => {
        tpsButton?.click();
      });
      expect(tpsTh?.getAttribute('aria-sort')).toBe('none');
      expect(getRowModels()).toEqual(['Slow LLM', 'Fast LLM', 'Mid LLM']);
      expect(headerContainer!.scrollLeft).toBe(300);
      expect(bodyContainer!.scrollLeft).toBe(300);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      dom.window.close();
      vi.unstubAllGlobals();
    }
  });
});
