import {
  getModelSelectorModelId,
  isModelAllowedByValues,
  resolveModelSelectorProvider
} from '@/components/Select/AIModelSelector.utils';
import { describe, expect, it } from 'vitest';

describe('AIModelSelector utils', () => {
  const model = { modelId: 'model-id', model: 'gpt-4o' };

  it('does not restrict models when no compatibility list is supplied', () => {
    expect(isModelAllowedByValues(model)).toBe(true);
  });

  it('rejects every model when an explicit compatibility list is empty', () => {
    expect(isModelAllowedByValues(model, new Set())).toBe(false);
  });

  it('accepts both modelId and deprecated model values', () => {
    expect(isModelAllowedByValues(model, new Set(['model-id']))).toBe(true);
    expect(isModelAllowedByValues(model, new Set(['gpt-4o']))).toBe(true);
    expect(isModelAllowedByValues(model, new Set(['other']))).toBe(false);
  });

  it('only returns valid ids for modelId-valued selectors', () => {
    expect(getModelSelectorModelId('68ad85a7463006c963799a07', 'modelId')).toBe(
      '68ad85a7463006c963799a07'
    );
    expect(getModelSelectorModelId('gpt-4o', 'modelId')).toBeUndefined();
    expect(getModelSelectorModelId('68ad85a7463006c963799a07', 'model')).toBeUndefined();
  });

  it('does not select a provider for ten or fewer models', () => {
    expect(
      resolveModelSelectorProvider({
        total: 10,
        pageSize: 10,
        providers: ['openai'],
        selectedProvider: 'openai'
      })
    ).toBe('');
  });

  it('prefers the selected model provider in grouped mode', () => {
    expect(
      resolveModelSelectorProvider({
        total: 11,
        pageSize: 10,
        providers: ['openai', 'anthropic'],
        selectedProvider: 'anthropic',
        currentProvider: 'openai'
      })
    ).toBe('anthropic');
  });

  it('keeps a valid manually selected provider and recovers from stale providers', () => {
    expect(
      resolveModelSelectorProvider({
        total: 11,
        pageSize: 10,
        providers: ['openai', 'anthropic'],
        currentProvider: 'anthropic'
      })
    ).toBe('anthropic');
    expect(
      resolveModelSelectorProvider({
        total: 11,
        pageSize: 10,
        providers: ['openai'],
        currentProvider: 'removed-provider'
      })
    ).toBe('openai');
  });
});
