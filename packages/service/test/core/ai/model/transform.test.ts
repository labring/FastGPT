import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { formatDbModelToDocumentData } from '@fastgpt/service/core/ai/model/transform';
import { describe, expect, it } from 'vitest';

const document = {
  type: ModelTypeEnum.stt,
  model: 'legacy-stt',
  name: 'Legacy STT',
  provider: 'Private provider',
  scope: ModelScopeEnum.system,
  requestUrl: 'https://example.com/v1',
  requestAuth: 'fixture-auth',
  config: {}
};

describe('formatDbModelToDocumentData', () => {
  it.each([{}, { unitPrice: 0 }, { unitPrice: 0.4 }])(
    'normalizes old STT prices without changing stored fields: %j',
    (pricing) => {
      const raw = { ...document, pricing, obsolete: true };
      const before = structuredClone(raw);
      expect(formatDbModelToDocumentData(raw)).toEqual({
        ...document,
        pricing: { ...pricing, type: 'duration' }
      });
      expect(raw).toEqual(before);
    }
  );

  it.each([
    { type: 'duration', unitPrice: 0.4 },
    { type: 'tokens', unitPrice: 10 }
  ])('preserves explicit STT pricing: %j', (pricing) => {
    expect(formatDbModelToDocumentData({ ...document, pricing })).toEqual({
      ...document,
      pricing
    });
  });

  it.each([
    [],
    '0.4',
    { type: null, unitPrice: 0.4 },
    { type: 'unknown', unitPrice: 0.4 },
    { unitPrice: -1 },
    { unitPrice: '0.4' }
  ])('reads malformed database prices as unconfigured without blocking: %j', (pricing) => {
    expect(formatDbModelToDocumentData({ ...document, pricing }).pricing).toBeUndefined();
  });

  it.each([undefined, null])('keeps unconfigured STT prices free: %j', (pricing) => {
    expect(formatDbModelToDocumentData({ ...document, pricing }).pricing).toBeUndefined();
  });

  it('leaves other model units unchanged', () => {
    expect(
      formatDbModelToDocumentData({
        ...document,
        type: ModelTypeEnum.rerank,
        pricing: { unitPrice: 2 }
      }).pricing
    ).toEqual({ unitPrice: 2 });
  });
});
