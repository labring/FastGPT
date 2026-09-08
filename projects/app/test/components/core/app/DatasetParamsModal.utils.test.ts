import { describe, expect, it } from 'vitest';
import { resolveQueryExtensionModelId } from '@/components/core/app/DatasetParamsModal.utils';

describe('resolveQueryExtensionModelId', () => {
  const models = [
    { modelId: 'first', model: 'first-model' },
    { modelId: 'default', model: 'default-model' }
  ];
  it.each([undefined, null, '', '   '])(
    'keeps empty enabled values unconfigured even when candidates are available (%s)',
    (modelId) => {
      expect(resolveQueryExtensionModelId({ enabled: true, modelId, models: [] })).toBeUndefined();
      expect(resolveQueryExtensionModelId({ enabled: true, modelId, models })).toBeUndefined();
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
