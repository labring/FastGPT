import { describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
vi.mock('@/components/core/ai/PriceTiersLabel', () => ({ default: () => null }));
import { formatModelTableList } from '@/components/core/ai/hooks/useModelTableFormat';

const models = [
  {
    name: 'Same name',
    model: 'chat-a',
    type: ModelTypeEnum.llm,
    provider: 'a',
    config: { maxContext: 32000 }
  },
  {
    name: 'Same name',
    model: 'embed-b',
    type: ModelTypeEnum.embedding,
    provider: 'b',
    config: { maxToken: 8000 }
  },
  {
    name: 'Same name',
    model: 'chat-c',
    type: ModelTypeEnum.llm,
    provider: 'c',
    config: { maxContext: 64000 }
  }
];
const props = {
  models,
  language: 'en',
  t: (key: string) => key,
  getModelProvider: (id?: string) => ({ id, name: id, order: id === 'b' ? 1 : 0 })
};

describe('model table projection', () => {
  it.each([
    {
      type: ModelTypeEnum.embedding,
      charsPointsPrice: 1.234,
      price: 1.23,
      unit: 'M Tokens'
    },
    {
      type: ModelTypeEnum.rerank,
      charsPointsPrice: 1.239,
      price: 1.24,
      unit: 'M Tokens'
    },
    {
      type: ModelTypeEnum.embedding,
      charsPointsPrice: 0,
      price: 0,
      unit: 'M Tokens'
    },
    {
      type: ModelTypeEnum.tts,
      charsPointsPrice: 125,
      price: 125,
      unit: '1M common:unit.character'
    },
    {
      type: ModelTypeEnum.tts,
      charsPointsPrice: 0.125,
      price: 0.13,
      unit: '1M common:unit.character'
    },
    { type: ModelTypeEnum.stt, charsPointsPrice: 0.125, price: 0.13, unit: '60common:unit.seconds' }
  ])(
    'formats $type prices with at most two decimals and the correct unit',
    ({ price, unit, ...pricing }) => {
      const [row] = formatModelTableList({ ...props, models: [{ ...models[0], ...pricing }] });
      const dom = new JSDOM(
        renderToStaticMarkup(React.createElement(ChakraProvider, null, row.priceLabel))
      );
      expect(dom.window.document.body.textContent).toContain(
        `${price} common:support.wallet.subscription.point / ${unit}`
      );
      dom.window.close();
    }
  );
  it('preserves distinct rows with equal display names when public DTOs have no modelId', () => {
    const rows = formatModelTableList(props);
    expect(
      rows.map(({ model, provider, type, contextToken }) => ({
        model,
        provider,
        type,
        contextToken
      }))
    ).toEqual([
      { model: 'chat-a', provider: 'a', type: ModelTypeEnum.llm, contextToken: 32000 },
      { model: 'embed-b', provider: 'b', type: ModelTypeEnum.embedding, contextToken: 8000 },
      { model: 'chat-c', provider: 'c', type: ModelTypeEnum.llm, contextToken: 64000 }
    ]);
  });
  it('filters the actual model identity after formatting and keeps equal provider order stable', () => {
    expect(
      formatModelTableList({ ...props, provider: 'b', search: 'embed' }).map(({ model }) => model)
    ).toEqual(['embed-b']);
    expect(formatModelTableList({ ...props, sortByOrder: true }).map(({ model }) => model)).toEqual(
      ['chat-a', 'chat-c', 'embed-b']
    );
  });
});
