import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { getLLMModelData } from '../../../core/ai/model';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

const modelId = '68ee0bd23d17260b7829b137';
const modelData: SystemModelDataType = {
  modelId,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'gpt-test',
  name: 'GPT test display name',
  isSystem: true,
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
  });

  it('does not resolve display names or missing model identifiers', () => {
    expect(() => getLLMModelData({ model: 'GPT test display name' })).toThrow(ModelErrEnum.unExist);
    expect(() => getLLMModelData({ model: 'missing-model' })).toThrow(ModelErrEnum.unExist);
  });

  it('rejects disabled models for execution', () => {
    global.systemModelMap.set(`id:${modelId}`, { ...modelData, isActive: false });
    expect(() => getLLMModelData({ modelId })).toThrow(ModelErrEnum.unExist);
  });
});
