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
  const text = dom.window.document.body.textContent?.replace(/\s+/g, ' ') ?? '';
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
  return { text, visibleText, values, tooltips };
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
    const { tooltips } = render({
      pricing: { tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2 }] }
    });
    expect(tooltips).toEqual([
      {
        trigger: 'Input: 2 points/M Tokens',
        text: 'Cache read: 0.2 points/M TokensCache creation: -'
      }
    ]);
  });

  it('hides cache prices from the summary and exposes them only on input hover', () => {
    const { visibleText, tooltips } = render({
      pricing: {
        tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2, cacheCreationPrice: 2.5 }]
      }
    });
    expect(visibleText).toContain('Input: 2 points/M Tokens');
    expect(visibleText).toContain('Output: 4 points/M Tokens');
    expect(visibleText).not.toContain('Cache');
    expect(tooltips).toEqual([
      {
        trigger: 'Input: 2 points/M Tokens',
        text: 'Cache read: 0.2 points/M TokensCache creation: 2.5 points/M Tokens'
      }
    ]);
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
    const { text } = render({
      pricing: {
        tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0, cacheCreationPrice: 0.125 }]
      }
    });
    expect(text).toContain('Cache read: -');
    expect(text).not.toContain('Cache read: 0');
    expect(text).toContain('Cache creation: 0.13 points/M Tokens');
  });

  it('rounds summary and tooltip prices to at most two decimals', () => {
    const { visibleText, values } = render({
      pricing: {
        tiers: [
          {
            maxInputTokens: 0.01,
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
    expect(values[0].slice(1).map((value) => value?.split(' ')[0])).toEqual([
      '1.23',
      '0.13',
      '2.35'
    ]);
    expect(values[2][1]?.split(' ')[0]).toBe('2');
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

  it('shows a dash for zero input while retaining a positive cache creation tooltip', () => {
    const { visibleText, tooltips } = render({
      pricing: {
        tiers: [{ inputPrice: 0, outputPrice: 4, cacheReadPrice: 0, cacheCreationPrice: 2 }]
      }
    });
    expect(visibleText).toBe('Input: -Output: 4 points/M Tokens');
    expect(tooltips[0]).toEqual({
      trigger: 'Input: -',
      text: 'Cache read: -Cache creation: 2 points/M Tokens'
    });
  });

  it('keeps tiered cache prices on input hover and only output prices on output hover', () => {
    const { visibleText, values, tooltips } = render({
      pricing: {
        tiers: [
          { maxInputTokens: 32, inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2 },
          { inputPrice: 4, outputPrice: 6, cacheReadPrice: 0, cacheCreationPrice: 5 }
        ]
      }
    });
    expect(visibleText).toContain('Input: 2~4 points/M Tokens');
    expect(visibleText).toContain('Output: 4~6 points/M Tokens');
    expect(visibleText).not.toContain('Cache');
    expect(tooltips[0].trigger).toBe('Input: 2~4 points/M Tokens');
    expect(tooltips[0].text).toContain('Cache read');
    expect(tooltips[0].text).toContain('Cache creation');
    expect(tooltips[1].trigger).toBe('Output: 4~6 points/M Tokens');
    expect(tooltips[1].text).not.toContain('Cache');
    expect(values).toHaveLength(4);
    expect(values[0]).toHaveLength(4);
    expect(values[0][0]).toContain('0 ≤');
    expect(values[0][3]).toBe('-');
    expect(values[1][2]).toBe('-');
    expect(values[2]).toHaveLength(2);
  });

  it('hides a tiered input tooltip without cache prices and keeps output tier details', () => {
    const { visibleText, tooltips, values } = render({
      pricing: {
        tiers: [
          { maxInputTokens: 32, inputPrice: 0, outputPrice: 0, cacheReadPrice: 0 },
          { inputPrice: 2, outputPrice: 4, cacheCreationPrice: 0 }
        ]
      }
    });
    expect(visibleText).toBe('Input: -~2 points/M TokensOutput: -~4 points/M Tokens');
    expect(tooltips).toHaveLength(1);
    expect(tooltips[0].trigger).toBe('Output: -~4 points/M Tokens');
    expect(tooltips[0].text).not.toContain('Cache');
    expect(values[0][1]).toBe('-');
  });
});
