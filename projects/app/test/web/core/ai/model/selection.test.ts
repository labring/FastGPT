import { describe, expect, it } from 'vitest';
import {
  getModelQuoteTokenLimit,
  UNAVAILABLE_MODEL_TOKEN_LIMIT
} from '@/web/core/ai/model/selection';

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
