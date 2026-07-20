import { describe, expect, it } from 'vitest';
import {
  filterAddedModelProviders,
  getModelPriceDisplayValue
} from '@/components/core/ai/ModelTable/utils';

describe('filterAddedModelProviders', () => {
  it('keeps only providers with added models and preserves provider order', () => {
    const providers = [
      { id: 'OpenAI', name: 'OpenAI' },
      { id: 'Anthropic', name: 'Anthropic' },
      { id: 'Moonshot', name: 'Moonshot' }
    ];

    expect(filterAddedModelProviders(providers, new Set(['Moonshot', 'OpenAI']))).toEqual([
      providers[0],
      providers[2]
    ]);
  });
});

describe('getModelPriceDisplayValue', () => {
  it('returns a dash for team models and unconfigured system models', () => {
    expect(getModelPriceDisplayValue({ isSystem: false, price: 5 })).toBe('-');
    expect(getModelPriceDisplayValue({ isSystem: true, price: undefined })).toBe('-');
    expect(getModelPriceDisplayValue({ isSystem: true, price: 0 })).toBe('-');
  });

  it('preserves positive configured prices for system models', () => {
    expect(getModelPriceDisplayValue({ isSystem: true, price: 2 })).toBe(2);
  });
});
