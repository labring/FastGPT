import { findClientModelByValue } from '@/web/core/ai/model/modelReference';
import { describe, expect, it } from 'vitest';

const canonicalModel = { modelId: 'shared-value', model: 'canonical-model' };
const legacyCollisionModel = { modelId: 'legacy-id', model: 'shared-value' };

describe('findClientModelByValue', () => {
  it('matches modelId before a colliding legacy model value', () => {
    expect(
      findClientModelByValue({
        models: [legacyCollisionModel, canonicalModel],
        value: 'shared-value'
      })
    ).toBe(canonicalModel);
  });

  it('falls back to a legacy model only when no modelId matches', () => {
    expect(findClientModelByValue({ models: [legacyCollisionModel], value: 'shared-value' })).toBe(
      legacyCollisionModel
    );
    expect(findClientModelByValue({ models: [canonicalModel] })).toBeUndefined();
  });
});
