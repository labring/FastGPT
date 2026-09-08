import { describe, expect, it } from 'vitest';
import { resolveQueryExtensionModelId } from '@/components/core/app/DatasetParamsModal.utils';

describe('resolveQueryExtensionModelId', () => {
  const models = [
    { modelId: 'first', model: 'first-model' },
    { modelId: 'default', model: 'default-model' }
  ];
  it.each([undefined, null, ''])(
    'fills empty enabled values (%s) with the usable default or first model',
    (modelId) => {
      expect(
        resolveQueryExtensionModelId({ enabled: true, modelId, models, defaultModelId: 'default' })
      ).toBe('default');
      expect(
        resolveQueryExtensionModelId({
          enabled: true,
          modelId,
          models,
          defaultModelId: 'unavailable'
        })
      ).toBe('first');
    }
  );
  it('does not invent IDs before candidates arrive and preserves nonempty choices', () => {
    expect(resolveQueryExtensionModelId({ enabled: true, models: [] })).toBeUndefined();
    expect(resolveQueryExtensionModelId({ enabled: true, models, modelId: 'deleted' })).toBe(
      'deleted'
    );
    expect(
      resolveQueryExtensionModelId({ enabled: false, models, modelId: 'first' })
    ).toBeUndefined();
  });
  it('only resolves legacy names exactly', () => {
    expect(
      resolveQueryExtensionModelId({ enabled: true, models, legacyModel: 'first-model' })
    ).toBe('first');
    expect(
      resolveQueryExtensionModelId({ enabled: true, models, legacyModel: 'missing' })
    ).toBeUndefined();
  });
});
