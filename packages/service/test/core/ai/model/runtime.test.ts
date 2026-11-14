import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
import { describe, expect, it } from 'vitest';

const document = {
  _id: '68ad85a7463006c963799a07',
  type: ModelTypeEnum.stt,
  model: 'legacy-stt',
  name: 'Legacy STT',
  provider: 'OpenAI',
  scope: ModelScopeEnum.system,
  config: {}
};

describe('formatDbModelToRuntimeModel', () => {
  it.each([{}, { unitPrice: 0 }, { unitPrice: 0.2 }])(
    'reads an old STT price as duration without mutating the document: %j',
    (pricing) => {
      const raw = { ...document, pricing };
      const before = structuredClone(raw);
      expect(formatDbModelToRuntimeModel(raw).pricing).toEqual({ ...pricing, type: 'duration' });
      expect(raw).toEqual(before);
    }
  );

  it.each([
    { type: 'duration', unitPrice: 0.2 },
    { type: 'tokens', inputPrice: 10, outputPrice: 20 }
  ])('preserves explicit STT pricing: %j', (pricing) => {
    expect(formatDbModelToRuntimeModel({ ...document, pricing }).pricing).toEqual(pricing);
  });

  it.each([
    [],
    '0.2',
    { type: null, unitPrice: 0.2 },
    { type: 'unknown', unitPrice: 0.2 },
    { unitPrice: -1 },
    { unitPrice: '0.2' },
    { unitPrice: Infinity }
  ])('keeps malformed STT database prices free without blocking model loading: %j', (pricing) => {
    expect(formatDbModelToRuntimeModel({ ...document, pricing }).pricing).toBeUndefined();
  });

  it.each([undefined, null])('keeps unconfigured STT prices free: %j', (pricing) => {
    expect(formatDbModelToRuntimeModel({ ...document, pricing }).pricing).toBeUndefined();
  });

  it('leaves other model price units unchanged', () => {
    expect(
      formatDbModelToRuntimeModel({
        ...document,
        type: ModelTypeEnum.rerank,
        pricing: { unitPrice: 2 }
      }).pricing
    ).toEqual({ unitPrice: 2 });
  });
});
