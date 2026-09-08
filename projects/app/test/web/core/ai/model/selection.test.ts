import { describe, expect, it } from 'vitest';
import {
  getModelInitializationValue,
  getModelQuoteTokenLimit,
  UNAVAILABLE_MODEL_TOKEN_LIMIT
} from '@/web/core/ai/model/selection';
import { getDefaultModelSelection } from '@/web/core/ai/model/selection';

describe('getDefaultModelSelection', () => {
  it('shares one default-first policy while excluding disabled and empty-ID candidates', () => {
    const disabled = { modelId: 'disabled', isActive: false };
    const empty = { modelId: '  ', isActive: true };
    const first = { modelId: 'first', isActive: true };
    const preferred = { modelId: 'preferred', isActive: true };
    const models = [disabled, empty, first, preferred];
    expect(getDefaultModelSelection({ models, defaultModelId: 'preferred' })).toBe(preferred);
    expect(getDefaultModelSelection({ models, defaultModelId: 'disabled' })).toBe(first);
    expect(getDefaultModelSelection({ models, defaultModelId: 'missing' })).toBe(first);
    expect(getDefaultModelSelection({ models: [disabled, empty] })).toBeUndefined();
  });
});

describe('getModelInitializationValue', () => {
  const models = [
    { modelId: 'disabled', model: 'disabled-name', isActive: false },
    { modelId: 'first', model: 'first-name', isActive: true },
    { modelId: 'default', model: 'default-name', isActive: true }
  ];
  it.each([undefined, null, '', '  '])(
    'initializes empty values from available choices (%s)',
    (value) => {
      expect(getModelInitializationValue({ value, models, defaultModelId: 'default' })).toBe(
        'default'
      );
      expect(getModelInitializationValue({ value, models, defaultModelId: 'disabled' })).toBe(
        'first'
      );
      expect(getModelInitializationValue({ value, models: [] })).toBeUndefined();
    }
  );
  it('does not replace existing invalid choices, but supports explicit legacy normalization', () => {
    expect(getModelInitializationValue({ value: 'missing', models })).toBeUndefined();
    expect(getModelInitializationValue({ value: 'disabled', models })).toBeUndefined();
    expect(getModelInitializationValue({ value: 'first', models })).toBe('first');
    expect(getModelInitializationValue({ value: 'first-name', models })).toBe('first');
  });
});

describe('getModelQuoteTokenLimit', () => {
  const model = {
    isActive: true,
    config: { quoteMaxToken: 32000, maxContext: 64000, maxResponse: 4000 }
  };
  it('uses a large editing limit only when no available model is selected', () => {
    expect(getModelQuoteTokenLimit()).toBe(UNAVAILABLE_MODEL_TOKEN_LIMIT);
    expect(getModelQuoteTokenLimit({ ...model, isActive: false })).toBe(1_000_000);
    expect(getModelQuoteTokenLimit(model)).toBe(32000);
    expect(
      getModelQuoteTokenLimit({ ...model, config: { ...model.config, quoteMaxToken: 0 } })
    ).toBe(0);
  });
});
