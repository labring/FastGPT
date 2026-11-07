import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import type { PriceType } from '@fastgpt/global/core/ai/model/schema';
import PriceTiersLabel, { PriceLine } from '@/components/core/ai/PriceTiersLabel';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common:Input': 'Input',
        'common:Output': 'Output'
      })[key] ?? key
  })
}));
// 展开悬浮层内容，验证真实价格明细；布局和价格计算均使用生产组件。
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children, label }: { children: React.ReactNode; label?: React.ReactNode }) =>
    React.createElement('div', null, children, label && React.createElement('aside', null, label))
}));

const render = (config: PriceType, priceKey?: 'input' | 'output') => {
  const props = { config, unitLabel: 'points / M Tokens' };
  const markup = renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      null,
      priceKey
        ? React.createElement(PriceLine, { ...props, priceKey })
        : React.createElement(PriceTiersLabel, props)
    )
  );
  const dom = new JSDOM(markup);
  dom.window.document.querySelectorAll('style').forEach((style) => style.remove());
  const rows = dom.window.document.querySelectorAll('tbody tr');
  const values = Array.from(rows, (row) =>
    Array.from(row.querySelectorAll('td'), (cell) => cell.textContent)
  );
  const tooltipCount = dom.window.document.querySelectorAll('aside').length;
  dom.window.document.querySelectorAll('aside').forEach((tip) => tip.remove());
  const visibleText = dom.window.document.body.textContent?.replace(/\s+/g, ' ') ?? '';
  dom.window.close();
  return { visibleText, values, tooltipCount };
};

describe('PriceTiersLabel', () => {
  it('shows million-unit input and output rates with at most two decimals', () => {
    const { visibleText, tooltipCount } = render({
      pricing: { tiers: [{ inputPrice: 1.005, outputPrice: 2.675 }] }
    });
    expect(visibleText).toContain('Input: 1.01 points/M Tokens');
    expect(visibleText).toContain('Output: 2.68 points/M Tokens');
    expect(tooltipCount).toBe(0);
  });

  it('rounds tier summaries and details without truncating input boundaries', () => {
    const { visibleText, values } = render({
      pricing: {
        tiers: [
          { maxInputTokens: 0.0041, inputPrice: 1.234, outputPrice: 2 },
          { inputPrice: 2.345, outputPrice: 4.125 }
        ]
      }
    });
    expect(visibleText).toContain('Input: 1.23~2.35 points/M Tokens');
    expect(values[0]).toEqual([
      '0 < Input <= 0.0041',
      '1.23 common:support.wallet.subscription.point',
      '2 common:support.wallet.subscription.point'
    ]);
    expect(values[1][0]).toContain('0.0041');
  });

  it('retains the existing empty-price display', () => {
    expect(render({}).visibleText).toBe('-');
  });
});

describe('PriceLine', () => {
  it('uses the same price formatting and empty-price display for model settings', () => {
    expect(
      render({ pricing: { tiers: [{ inputPrice: 1, outputPrice: 1.005 }] } }, 'output').visibleText
    ).toBe('Output: 1.01 points/M Tokens');
    expect(render({}, 'output').visibleText).toBe('-');
  });
});
