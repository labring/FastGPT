import { describe, expect, it } from 'vitest';
import { getEvaluationModelId } from '@fastgpt/service/core/app/evaluation/utils';

describe('getEvaluationModelId', () => {
  it('prefers the canonical model ID when both fields exist', () => {
    expect(
      getEvaluationModelId({
        evalModelId: 'model-id',
        evalModel: 'gpt-4o'
      })
    ).toBe('model-id');
  });

  it('falls back to the legacy provider model name', () => {
    expect(getEvaluationModelId({ evalModel: 'gpt-4o' })).toBe('gpt-4o');
  });

  it('returns undefined when neither model field is configured', () => {
    expect(getEvaluationModelId({ evalModelId: null, evalModel: null })).toBeUndefined();
  });
});
