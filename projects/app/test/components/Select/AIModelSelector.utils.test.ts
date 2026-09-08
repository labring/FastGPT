import {
  isModelAllowedByValues,
  resolveModelSelectorDisabled,
  resolveModelSelectorProviders,
  resolveModelSelectorSelection
} from '@/components/Select/AIModelSelector.utils';
import { describe, expect, it } from 'vitest';

describe('AIModelSelector utils', () => {
  const model = { modelId: 'model-id', model: 'gpt-4o' };

  it('disables the selector only for caller and business constraints', () => {
    expect(resolveModelSelectorDisabled({ isDisabled: true, disableTip: undefined })).toBe(true);
    expect(resolveModelSelectorDisabled({ isDisabled: false, disableTip: 'Unavailable' })).toBe(
      true
    );
    expect(resolveModelSelectorDisabled({ isDisabled: false, disableTip: undefined })).toBe(false);
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

  it('orders provider groups by the plugin provider catalog', () => {
    expect(
      resolveModelSelectorProviders({
        models: [
          { provider: 'openai' },
          { provider: 'custom' },
          { provider: 'anthropic' },
          { provider: 'openai' }
        ],
        providers: [{ id: 'anthropic' }, { id: 'unused' }, { id: 'openai' }]
      })
    ).toEqual(['anthropic', 'openai', 'custom']);
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
});
