import {
  findClientModelByReference,
  findClientModelByValue,
  resolveClientModelReferenceId
} from '@/web/core/ai/model/modelReference';
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

describe('findClientModelByReference', () => {
  it('does not fall back to legacy model when modelId is empty or invalid', () => {
    expect(
      findClientModelByReference({
        models: [canonicalModel],
        reference: { modelId: '', model: 'canonical-model' }
      })
    ).toBeUndefined();
    expect(
      findClientModelByReference({
        models: [canonicalModel],
        reference: { modelId: 'missing-id', model: 'canonical-model' }
      })
    ).toBeUndefined();
  });

  it('uses legacy model only when modelId is absent', () => {
    expect(
      findClientModelByReference({
        models: [canonicalModel],
        reference: { model: 'canonical-model' }
      })
    ).toBe(canonicalModel);
    expect(findClientModelByReference({ models: [canonicalModel], reference: {} })).toBeUndefined();
  });
});

describe('resolveClientModelReferenceId', () => {
  it('preserves an existing modelId without validating or falling back', () => {
    expect(
      resolveClientModelReferenceId({
        models: [canonicalModel],
        reference: { modelId: '', model: 'canonical-model' }
      })
    ).toBe('');
    expect(
      resolveClientModelReferenceId({
        models: [canonicalModel],
        reference: { modelId: 'missing-id', model: 'canonical-model' }
      })
    ).toBe('missing-id');
  });

  it('normalizes legacy model only when modelId is absent', () => {
    expect(
      resolveClientModelReferenceId({
        models: [canonicalModel],
        reference: { model: 'canonical-model' }
      })
    ).toBe('shared-value');
    expect(
      resolveClientModelReferenceId({
        models: [canonicalModel],
        reference: { model: 'missing-model' }
      })
    ).toBeUndefined();
    expect(
      resolveClientModelReferenceId({ models: [canonicalModel], reference: {} })
    ).toBeUndefined();
  });
});
