import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { normalizeRuntimeSystemModelConfig } from '../../../../core/ai/config/utils';

describe('normalizeRuntimeSystemModelConfig', () => {
  it('removes a null maxTemperature from the final LLM model', () => {
    const result = normalizeRuntimeSystemModelConfig({
      type: ModelTypeEnum.llm,
      model: 'test-llm',
      maxTemperature: null
    });

    expect(result).not.toHaveProperty('maxTemperature');
  });

  it('preserves a valid LLM maxTemperature', () => {
    const result = normalizeRuntimeSystemModelConfig({
      type: ModelTypeEnum.llm,
      maxTemperature: 1.2
    });

    expect(result.maxTemperature).toBe(1.2);
  });

  it('does not normalize fields on non-LLM models', () => {
    const result = normalizeRuntimeSystemModelConfig({
      type: ModelTypeEnum.embedding,
      maxTemperature: null
    });

    expect(result.maxTemperature).toBeNull();
  });
});
