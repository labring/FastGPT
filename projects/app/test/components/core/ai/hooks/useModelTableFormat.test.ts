import { describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
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
