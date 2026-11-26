import {
  ModelScopeEnum,
  ModelTypeEnum,
  REASONING_EFFORT_LEVELS
} from '@fastgpt/global/core/ai/constants';
import { LLMModelConfigSchema } from '@fastgpt/global/core/ai/model/schema';
import { formatDbModelToRuntimeModel } from '@fastgpt/service/core/ai/model/runtime';
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

  it('preserves omitted reasoningEffortList in document transforms while falling back to all levels on runtime model load', () => {
    const legacyRaw = {
      ...document,
      _id: '507f1f77bcf86cd799439011',
      type: ModelTypeEnum.llm,
      model: 'legacy-reasoning-llm',
      config: {
        maxContext: 64000,
        maxResponse: 8000,
        quoteMaxToken: 32000,
        reasoning: true,
        reasoningEffort: true
      }
    };

    // JSON 导出 / 持久化文档转换保留缺省语义（含历史 null），避免阻断加载或把运行期六档写回数据库
    for (const rawDoc of [
      legacyRaw,
      { ...legacyRaw, config: { ...legacyRaw.config, reasoningEffortList: null } }
    ]) {
      const exportedDoc = formatDbModelToDocumentData(rawDoc);
      expect(exportedDoc.type).toBe(ModelTypeEnum.llm);
      if (exportedDoc.type === ModelTypeEnum.llm) {
        expect(exportedDoc.config.reasoningEffortList).toBeUndefined();
      }
    }

    // 写入 Schema 仍严格拒绝 null
    expect(
      LLMModelConfigSchema.safeParse({
        ...legacyRaw.config,
        reasoningEffortList: null
      }).success
    ).toBe(false);

    // 运行期模型加载对缺省、null、空数组及全未知枚举兜底为全部 6 档
    for (const rawList of [undefined, null, [], ['only_unknown_level']]) {
      const runtime = formatDbModelToRuntimeModel(
        {
          ...legacyRaw,
          config: {
            ...legacyRaw.config,
            ...(rawList !== undefined ? { reasoningEffortList: rawList } : {})
          }
        },
        { fallbackProvider: true }
      );
      expect(runtime.type).toBe(ModelTypeEnum.llm);
      if (runtime.type === ModelTypeEnum.llm) {
        expect(runtime.config.reasoningEffortList).toEqual([...REASONING_EFFORT_LEVELS]);
      }
    }
  });
});

describe('flatModelToDocumentData', () => {
  it('preserves omitted reasoningEffortList when installing legacy plugin templates', () => {
    const doc = flatModelToDocumentData({
      type: ModelTypeEnum.llm,
      provider: 'ChatGLM',
      model: 'glm-5.3',
      name: 'GLM-5.3',
      maxContext: 1000000,
      maxTokens: 128000,
      quoteMaxToken: 900000,
      reasoning: true,
      reasoningEffort: true
    });

    expect(doc.type).toBe(ModelTypeEnum.llm);
    if (doc.type === ModelTypeEnum.llm) {
      expect(doc.config.reasoningEffort).toBe(true);
      expect(doc.config.reasoningEffortList).toBeUndefined();
    }
  });
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
