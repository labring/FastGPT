import {
  createRestrictedModelDiscovery,
  isModelAllowedByValues,
  resolveModelSelectorDefault,
  resolveModelSelectorDisabled,
  resolveModelSelectorSelection,
  resolveModelSelectorProvider
} from '@/components/Select/AIModelSelector.utils';
import { describe, expect, it } from 'vitest';

describe('AIModelSelector utils', () => {
  const model = { modelId: 'model-id', model: 'gpt-4o' };

  it('keeps the selector disabled for caller, loading and disable-tip constraints', () => {
    expect(
      resolveModelSelectorDisabled({ isDisabled: true, loading: false, disableTip: undefined })
    ).toBe(true);
    expect(
      resolveModelSelectorDisabled({ isDisabled: false, loading: true, disableTip: undefined })
    ).toBe(true);
    expect(
      resolveModelSelectorDisabled({ isDisabled: false, loading: false, disableTip: 'Unavailable' })
    ).toBe(true);
    expect(
      resolveModelSelectorDisabled({ isDisabled: false, loading: false, disableTip: undefined })
    ).toBe(false);
  });

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

  it('normalizes a legacy model value to modelId', () => {
    const selected = resolveModelSelectorSelection({
      models: [model],
      value: 'gpt-4o'
    });

    expect(selected).toEqual({
      model,
      normalizedValue: 'model-id',
      shouldNormalize: true
    });
  });

  it('keeps canonical modelId values unchanged', () => {
    const selected = resolveModelSelectorSelection({
      models: [model],
      value: 'model-id'
    });

    expect(selected).toEqual({
      model,
      normalizedValue: 'model-id',
      shouldNormalize: false
    });
  });

  it('prefers modelId when model and modelId values collide', () => {
    const canonicalModel = { modelId: 'shared-value', model: 'canonical-model' };
    const legacyCollision = { modelId: 'other-id', model: 'shared-value' };

    expect(
      resolveModelSelectorSelection({
        models: [legacyCollision, canonicalModel],
        value: 'shared-value'
      })
    ).toEqual({
      model: canonicalModel,
      normalizedValue: 'shared-value',
      shouldNormalize: false
    });
  });

  it('returns no selection for empty or unavailable values', () => {
    expect(resolveModelSelectorSelection({ models: [model], value: '' })).toBeUndefined();
    expect(
      resolveModelSelectorSelection({
        models: [model],
        value: 'missing-model'
      })
    ).toBeUndefined();
  });

  it('uses the configured default model when it is selectable', () => {
    const fallbackModel = { modelId: 'fallback-id' };
    const defaultModel = { modelId: 'default-id' };

    expect(
      resolveModelSelectorDefault({
        models: [fallbackModel, defaultModel],
        defaultModelId: 'default-id'
      })
    ).toBe(defaultModel);
  });

  it('falls back within the selectable range when the default is unavailable', () => {
    const fallbackModel = { modelId: 'fallback-id' };

    expect(
      resolveModelSelectorDefault({
        models: [fallbackModel],
        defaultModelId: 'unavailable-id'
      })
    ).toBe(fallbackModel);
    expect(resolveModelSelectorDefault({ models: [] })).toBeUndefined();
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

  it('derives grouped providers only from whitelist-matched models', () => {
    const discovery = createRestrictedModelDiscovery({
      models: [
        { modelId: 'openai-1', model: 'gpt-4o', provider: 'openai' },
        { modelId: 'anthropic-1', model: 'claude-3', provider: 'anthropic' },
        { modelId: 'anthropic-1', model: 'claude-3', provider: 'anthropic' }
      ],
      allowedValues: new Set(['anthropic-1'])
    });

    expect(discovery).toEqual({
      list: [{ modelId: 'anthropic-1', model: 'claude-3', provider: 'anthropic' }],
      total: 1,
      providers: ['anthropic']
    });
  });
});
