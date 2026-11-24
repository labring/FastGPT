import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { LLMModelConfigSchema } from '@fastgpt/global/core/ai/model/schema';
import {
  flatModelToDocumentData,
  formatDbModelToDocumentData
} from '@fastgpt/service/core/ai/model/transform';
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
    { type: 'tokens', inputPrice: 10, outputPrice: 20 }
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

  it('normalizes unknown or unordered LLM reasoningEffortList on read without mutating source', () => {
    const raw = {
      ...document,
      type: ModelTypeEnum.llm,
      model: 'future-reasoning-llm',
      config: {
        maxContext: 64000,
        maxResponse: 8000,
        quoteMaxToken: 32000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['high', 'future_level', 'none', 'high', 123]
      }
    };
    const before = structuredClone(raw);

    const parsed = formatDbModelToDocumentData(raw);
    expect(parsed.type).toBe(ModelTypeEnum.llm);
    if (parsed.type === ModelTypeEnum.llm) {
      expect(parsed.config.reasoningEffortList).toEqual(['none', 'high']);
    }
    expect(raw).toEqual(before);
    expect(
      LLMModelConfigSchema.safeParse({
        maxContext: 64000,
        maxResponse: 8000,
        quoteMaxToken: 32000,
        reasoning: true,
        reasoningEffort: true,
        reasoningEffortList: ['high', 'future_level']
      }).success
    ).toBe(false);
  });
});

describe('flatModelToDocumentData', () => {
  it('maps plugin flat reasoningEffortList into canonical LLM config and drops unknown future levels', () => {
    const doc = flatModelToDocumentData({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'gpt-5.4',
      name: 'GPT-5.4',
      maxContext: 400000,
      maxTokens: 128000,
      quoteMaxToken: 300000,
      vision: true,
      reasoning: true,
      reasoningEffort: true,
      reasoningEffortList: ['xhigh', 'ultra_future', 'none', 'low', 'medium', 'high', 'none'],
      toolChoice: true
    });

    expect(doc.type).toBe(ModelTypeEnum.llm);
    if (doc.type === ModelTypeEnum.llm) {
      expect(doc.config.reasoningEffort).toBe(true);
      expect(doc.config.reasoningEffortList).toEqual(['none', 'low', 'medium', 'high', 'xhigh']);
    }
  });
});
