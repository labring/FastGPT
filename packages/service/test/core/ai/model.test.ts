import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import {
  getLLMModelData,
  getOptionalLLMModelData,
  getOptionalVlmModelData,
  getSystemDefaultModelIds,
  getEmbeddingModelData,
  getDefaultLLMModelData,
  assertModelAvailable
} from '../../../core/ai/model';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';

// 本文件验证真实模型校验，不能使用全局测试环境中绕过校验的 embedding stub。
vi.unmock('@fastgpt/service/core/ai/model');

const modelId = '68ee0bd23d17260b7829b137';
const modelData: LLMSystemModelDataType = {
  modelId,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'gpt-test',
  name: 'GPT test display name',
  scope: ModelScopeEnum.system,
  isActive: true,
  isCustom: false,
  config: {
    maxContext: 128000,
    maxResponse: 8192,
    quoteMaxToken: 100000
  }
};

describe('getLLMModelData', () => {
  const originalMap = global.systemModelMap;
  const originalDefaults = global.systemDefaultModel;

  beforeEach(() => {
    global.systemModelMap = new Map([
      [`id:${modelId}`, modelData],
      [`model:${modelData.model}`, modelData]
    ]);
    global.systemDefaultModel = { llm: modelData };
  });

  afterEach(() => {
    global.systemModelMap = originalMap;
    global.systemDefaultModel = originalDefaults;
  });

  it('resolves modelId and returns canonical modelData', () => {
    const result = getLLMModelData({ modelId });

    expect(result.config.maxContext).toBe(128000);
    expect(result).not.toHaveProperty('maxContext');
  });

  it('uses deprecated model only when modelId is absent', () => {
    expect(getLLMModelData({ model: 'gpt-test' }).model).toBe('gpt-test');
    expect(() =>
      getLLMModelData({ modelId: '68ee0bd23d17260b7829b138', model: 'gpt-test' })
    ).toThrow(ModelErrEnum.unExist);
    expect(getLLMModelData({ modelId: '', model: 'gpt-test' }).model).toBe('gpt-test');
  });

  it('does not resolve display names or missing model identifiers', () => {
    expect(() => getLLMModelData({})).toThrow(ModelErrEnum.unConfigured);
    expect(() => getLLMModelData({ model: 'GPT test display name' })).toThrow(ModelErrEnum.unExist);
    expect(() => getLLMModelData({ model: 'missing-model' })).toThrow(ModelErrEnum.unExist);
  });

  it('returns undefined only when an optional model reference is empty', () => {
    expect(getOptionalLLMModelData({})).toBeUndefined();
    expect(getOptionalVlmModelData({ modelId: undefined, model: undefined })).toBeUndefined();
    expect(getOptionalLLMModelData({ modelId: '', model: 'gpt-test' })?.model).toBe('gpt-test');
    expect(() => getOptionalLLMModelData({ model: 'missing-model' })).toThrow(ModelErrEnum.unExist);
    expect(() =>
      getOptionalLLMModelData({ modelId: '68ee0bd23d17260b7829b138', model: 'gpt-test' })
    ).toThrow(ModelErrEnum.unExist);
  });

  it('rejects disabled models for execution', () => {
    const disabledModel = { ...modelData, isActive: false };
    global.systemModelMap.set(`id:${modelId}`, disabledModel);
    global.systemModelMap.set(`model:${modelData.model}`, disabledModel);
    expect(() => getLLMModelData({ modelId })).toThrow(ModelErrEnum.unExist);
    expect(() => getLLMModelData({ model: modelData.model })).toThrow(ModelErrEnum.unExist);
    try {
      getLLMModelData({ modelId });
    } catch (error) {
      expect(getErrText(error)).toBe('Model is disabled: GPT test display name');
    }
  });

  it('reports type mismatch and unsupported vision with the actual model name', () => {
    for (const run of [
      () => getEmbeddingModelData({ modelId }),
      () => getOptionalVlmModelData({ modelId })
    ]) {
      expect(run).toThrow(ModelErrEnum.unExist);
      try {
        run();
      } catch (error) {
        expect(error).toBeInstanceOf(UserError);
        expect(getErrText(error)).toBe('Model type mismatch: GPT test display name');
      }
    }
  });

  it('keeps missing references distinct from delisted models and validates default state', () => {
    expect(() => getLLMModelData({})).toThrow(ModelErrEnum.unConfigured);
    expect(() => getLLMModelData({ modelId: 'deleted' })).toThrow(ModelErrEnum.unExist);
    global.systemDefaultModel = {};
    expect(() => getDefaultLLMModelData()).toThrow(ModelErrEnum.unConfigured);
    global.systemDefaultModel = { llm: { ...modelData, isActive: false } };
    try {
      getDefaultLLMModelData();
    } catch (error) {
      expect(getErrText(error)).toBe('Model is disabled: GPT test display name');
    }
    global.systemDefaultModel = { llm: modelData };
    expect(getDefaultLLMModelData()).toBe(modelData);
  });

  it('accepts vision models and uses the model identifier when its display name is empty', () => {
    expect(() =>
      assertModelAvailable({
        model: { ...modelData, config: { ...modelData.config, vision: true } },
        type: ModelTypeEnum.llm,
        vision: true
      })
    ).not.toThrow();
    expect(() => assertModelAvailable({ type: ModelTypeEnum.llm })).toThrow(ModelErrEnum.unExist);
    try {
      assertModelAvailable({
        model: { ...modelData, name: '', isActive: false },
        type: ModelTypeEnum.llm
      });
    } catch (error) {
      expect(getErrText(error)).toBe('Model is disabled: gpt-test');
    }
  });

  it.each([undefined, null, '', '   '])('treats empty references consistently (%s)', (modelId) => {
    expect(() => getLLMModelData({ modelId })).toThrow(ModelErrEnum.unConfigured);
    expect(getOptionalLLMModelData({ modelId })).toBeUndefined();
    expect(getOptionalVlmModelData({ modelId })).toBeUndefined();
    expect(getLLMModelData({ modelId, model: 'gpt-test' }).model).toBe('gpt-test');
  });

  it('returns effective system default model ids by model type', () => {
    expect(getSystemDefaultModelIds()).toMatchObject({
      [ModelTypeEnum.llm]: modelId
    });
  });
});
