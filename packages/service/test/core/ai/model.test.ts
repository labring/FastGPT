import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { getVlmModel } from '@fastgpt/service/core/ai/model';

describe('getVlmModel', () => {
  const originalModelMap = global.llmModelMap;

  beforeEach(() => {
    global.llmModelMap = new Map([
      [
        'vision-model',
        {
          model: 'vision-model',
          name: 'Vision model',
          vision: true
        } as LLMModelItemType
      ]
    ]);
  });

  afterEach(() => {
    global.llmModelMap = originalModelMap;
  });

  it('does not fall back to the first vision model when no model is specified', () => {
    expect(getVlmModel()).toBeUndefined();
    expect(getVlmModel('')).toBeUndefined();
  });

  it('does not fall back to the first vision model when the model is unavailable', () => {
    expect(getVlmModel('missing-model')).toBeUndefined();
  });

  it('returns the configured vision model', () => {
    expect(getVlmModel('vision-model')?.model).toBe('vision-model');
  });
});
