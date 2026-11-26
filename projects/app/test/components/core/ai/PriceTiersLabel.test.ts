import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { PriceType } from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import PriceTiersLabel from '@/components/core/ai/PriceTiersLabel';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common:Input': 'Input',
        'common:Output': 'Output',
        'common:model.price_tier_range': 'Input interval: K Tokens',
        'common:model.cache_read_price': 'Cache read',
        'common:model.cache_creation_price': 'Cache creation'
      })[key] ?? key
  })
}));
// 展开悬浮层内容，验证真实价格明细；布局和价格计算均使用生产组件。
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children, label }: { children: React.ReactNode; label?: React.ReactNode }) =>
    React.createElement('div', null, children, label && React.createElement('aside', null, label))
}));

const render = (config: PriceType & { scope?: ModelScopeEnum }) => {
  const markup = renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      null,
      React.createElement(PriceTiersLabel, {
        config,
        unitLabel: 'points / M Tokens'
      })
    )
  );
  const dom = new JSDOM(markup);
  dom.window.document.querySelectorAll('style').forEach((style) => style.remove());
  const headers = Array.from(
    dom.window.document.querySelectorAll('th'),
    (cell) => cell.textContent
  );
  const rows = dom.window.document.querySelectorAll('tbody tr');
  const values = Array.from(rows, (row) =>
    Array.from(row.querySelectorAll('td'), (cell) => cell.textContent)
  );
  const tooltips = Array.from(dom.window.document.querySelectorAll('aside'), (tip) => ({
    trigger: tip.previousElementSibling?.textContent?.replace(/\s+/g, ' ') ?? '',
    text: tip.textContent?.replace(/\s+/g, ' ') ?? ''
  }));
  dom.window.document.querySelectorAll('aside').forEach((tip) => tip.remove());
  const visibleText = dom.window.document.body.textContent?.replace(/\s+/g, ' ') ?? '';
  dom.window.close();
  return { visibleText, headers, values, tooltips };
};

describe('PriceTiersLabel', () => {
  it('hides team-model prices even when a cache rate is configured', () => {
    const { visibleText, tooltips } = render({
      scope: ModelScopeEnum.team,
      pricing: { tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2 }] }
    });
    expect(visibleText).toBe('-');
    expect(tooltips).toEqual([]);
  });
  it('shows a dash for an unavailable cache price without inheriting the input price', () => {
    const { values } = render({
      pricing: { tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2 }] }
    });
    expect(values).toEqual([['0 ≤ Input', '2', '4', '0.2', '-']]);
  });

  it.each([{}, { cacheReadPrice: 0.004, cacheCreationPrice: 0 }])(
    'hides the input tooltip when both cache prices are unavailable: %j',
    (cachePrices) => {
      const { tooltips, visibleText } = render({
        pricing: { tiers: [{ inputPrice: 2, outputPrice: 4, ...cachePrices }] }
      });
      expect(tooltips).toEqual([]);
      expect(visibleText).toContain('Input: 2 points/M Tokens');
      expect(visibleText).not.toContain('Cache');
    }
  );

  it('shows zero cache reads as a dash and rounds positive creation prices', () => {
    const { values } = render({
      pricing: {
        tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0, cacheCreationPrice: 0.125 }]
      }
    });
    expect(values).toEqual([['0 ≤ Input', '2', '4', '-', '0.13']]);
  });

  it('rounds summary and tooltip prices to at most two decimals', () => {
    const { visibleText, values } = render({
      pricing: {
        tiers: [
          {
            maxInputTokensK: 10,
            inputPrice: 1.234,
            outputPrice: 1.999,
            cacheReadPrice: 0.125,
            cacheCreationPrice: 2.345
          },
          { inputPrice: 1.231, outputPrice: 2, cacheReadPrice: 0.13, cacheCreationPrice: 2.35 }
        ]
      }
    });
    for (const price of ['1.23', '2']) expect(visibleText).toContain(`${price} points/M Tokens`);
    expect(values).toEqual([
      ['0 ≤ Input ≤ 10', '1.23', '2', '0.13', '2.35'],
      ['10 < Input', '1.23', '2', '0.13', '2.35']
    ]);
    expect(visibleText).not.toContain('~');
  });

  it('shows million-unit prices without rescaling or inventing configured cache prices', () => {
    const legacy = render({ pricing: { tiers: [{ inputPrice: 1000, outputPrice: 3000 }] } });
    expect(legacy.visibleText).toContain('Input: 1000 points/M Tokens');
    expect(legacy.visibleText).toContain('Output: 3000 points/M Tokens');
    expect(legacy.tooltips).toEqual([]);
  });

  it('shows unavailable input and output prices as dashes without a tooltip', () => {
    const { visibleText, tooltips } = render({ pricing: { tiers: [] } });
    expect(visibleText).toBe('Input: -Output: -');
    expect(tooltips).toEqual([]);
  });

  it('groups both summary rows under one tooltip with all prices and both token units', () => {
    const { visibleText, headers, values, tooltips } = render({
      pricing: {
        tiers: [
          { maxInputTokensK: 32, inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2 },
          { inputPrice: 4, outputPrice: 6, cacheReadPrice: 0, cacheCreationPrice: 5 }
        ]
      }
    });
    expect(visibleText).toBe('Input: 2~4 points/M TokensOutput: 4~6 points/M Tokens');
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0].trigger).toBe(visibleText);
    expect(tooltips[0].text).toContain('points / M Tokens');
    expect(headers).toEqual([
      'Input interval: K Tokens',
      'Input',
      'Output',
      'Cache read',
      'Cache creation'
    ]);
    expect(values).toEqual([
      ['0 ≤ Input ≤ 32', '2', '4', '0.2', '-'],
      ['32 < Input', '4', '6', '-', '5']
    ]);
  });

  it('shows tier details when cache prices are unavailable', () => {
    const { visibleText, tooltips, values } = render({
      pricing: {
        tiers: [
          { maxInputTokensK: 32, inputPrice: 0, outputPrice: 0, cacheReadPrice: 0 },
          { inputPrice: 2, outputPrice: 4, cacheCreationPrice: 0 }
        ]
      }
    });
    expect(visibleText).toBe('Input: -~2 points/M TokensOutput: -~4 points/M Tokens');
    expect(tooltips).toHaveLength(1);
    expect(values[0]).toEqual(['0 ≤ Input ≤ 32', '-', '-', '-', '-']);
  });
});
