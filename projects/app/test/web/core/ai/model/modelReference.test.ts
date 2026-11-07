import {
  findClientModelByReference,
  findClientModelByValue,
  resolveClientModelReferenceId
} from '@/web/core/ai/model/modelReference';
import { describe, expect, it } from 'vitest';

const canonicalModel = { modelId: 'shared-value', model: 'canonical-model' };
const legacyCollisionModel = { modelId: 'legacy-id', model: 'shared-value' };
const teamModel = { modelId: 'team-id', model: 'team-model', scope: 'team' };

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

  it('never matches team models by legacy model name while allowing explicit modelId', () => {
    expect(findClientModelByValue({ models: [teamModel], value: 'team-model' })).toBeUndefined();
    expect(findClientModelByValue({ models: [teamModel], value: 'team-id' })).toBe(teamModel);
    expect(
      findClientModelByReference({ models: [teamModel], reference: { model: 'team-model' } })
    ).toBeUndefined();
    expect(
      findClientModelByReference({ models: [teamModel], reference: { modelId: 'team-id' } })
    ).toBe(teamModel);
    expect(
      resolveClientModelReferenceId({ models: [teamModel], reference: { model: 'team-model' } })
    ).toBeUndefined();
    expect(
      resolveClientModelReferenceId({ models: [teamModel], reference: { modelId: 'team-id' } })
    ).toBe('team-id');
  });
});
