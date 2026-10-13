import { describe, expect, it } from 'vitest';
import { getDatasetModelReference } from '../../../core/dataset/model';

describe('getDatasetModelReference', () => {
  it.each([
    ['embedding', 'vectorModelId', 'vectorModel'],
    ['agent', 'agentModelId', 'agentModel'],
    ['vlm', 'vlmModelId', 'vlmModel']
  ] as const)('extracts the %s reference without resolving a model', (slot, idKey, nameKey) => {
    expect(
      getDatasetModelReference({ [idKey]: 'stable-id', [nameKey]: 'legacy-name' }, slot)
    ).toEqual({ modelId: 'stable-id', model: 'legacy-name' });
    expect(getDatasetModelReference({ [nameKey]: 'legacy-name' }, slot)).toEqual({
      modelId: undefined,
      model: 'legacy-name'
    });
    expect(getDatasetModelReference({ [idKey]: '' }, slot).modelId).toBe('');
    expect(getDatasetModelReference({}, slot)).toEqual({ modelId: undefined, model: undefined });
  });
});
