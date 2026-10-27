import { describe, expect, it } from 'vitest';
import { getTrainingAuditModelLabel } from '@fastgpt/service/core/dataset/audit/training';

describe('getTrainingAuditModelLabel', () => {
  it.each([
    { name: '团队嵌入模型', expectedName: '团队嵌入模型' },
    { name: '', expectedName: 'text-embedding' }
  ])('formats a resolved model with name "$name"', ({ name, expectedName }) => {
    expect(
      getTrainingAuditModelLabel({
        reference: { model: 'old-name' },
        model: { modelId: 'team-model-id', model: 'text-embedding', name }
      })
    ).toEqual({ modelId: 'team-model-id', modelName: expectedName });
  });

  it.each([
    {
      reference: { modelId: 'missing-model-id', model: 'legacy-embedding' },
      expected: { modelId: 'missing-model-id', modelName: 'legacy-embedding' }
    },
    {
      reference: { model: 'legacy-embedding' },
      expected: { modelId: 'legacy-embedding', modelName: 'legacy-embedding' }
    },
    {
      reference: { modelId: 'missing-model-id' },
      expected: { modelId: 'missing-model-id', modelName: 'missing-model-id' }
    },
    {
      reference: {},
      expected: { modelId: '', modelName: '' }
    }
  ])('falls back to the stored reference $reference', ({ reference, expected }) => {
    expect(getTrainingAuditModelLabel({ reference })).toEqual(expected);
  });
});
