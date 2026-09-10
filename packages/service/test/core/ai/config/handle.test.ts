import { assertModelAvailable } from '@fastgpt/service/core/ai/utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  LLMSystemModelDataType,
  ModelReferenceType,
  SystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError, getErrText } from '@fastgpt/global/common/error/utils';
import { createModelHandle } from '../../../../core/ai/config/handle';

const vlm: LLMSystemModelDataType = {
  modelId: '68ee0bd23d17260b7829b137',
  type: ModelTypeEnum.llm,
  scope: 'system' as const,
  provider: 'OpenAI',
  model: 'test-vlm',
  name: 'Visual model',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000, vision: true }
};

const createHandle = (models: SystemModelDataType[] = [vlm]) =>
  createModelHandle({
    models,
    defaultModels: {},
    configuredDefaultModelIds: {},
    revision: 0,
    version: 'test'
  });

describe('tryGetVlmModelData', () => {
  it('returns the same snapshot model as the strict getter and narrows the result after destructuring', () => {
    const handle = createHandle();
    const { error, model } = handle.tryGetVlmModelData({ modelId: vlm.modelId });
    expect(error).toBeUndefined();
    if (error) throw error;
    expectTypeOf(model).toEqualTypeOf<LLMSystemModelDataType>();
    expect(model).toBe(handle.getVlmModelData({ modelId: vlm.modelId }));
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('supports legacy names only when the stable ID is absent', () => {
    expect(createHandle().tryGetVlmModelData({ model: vlm.model }).model?.modelId).toBe(
      vlm.modelId
    );
  });

  it.each<ModelReferenceType>([
    { modelId: 'missing' },
    { model: 'missing' },
    { modelId: 'missing', model: vlm.model },
    { model: vlm.name }
  ])('returns a model-unavailable result for an invalid reference: %j', (reference) => {
    const handle = createHandle();
    const { error, model } = handle.tryGetVlmModelData(reference);
    expect(model).toBeUndefined();
    expect(error).toBeInstanceOf(UserError);
    expect(error?.message).toBe(ModelErrEnum.unExist);
    expect(() => handle.getVlmModelData(reference)).toThrow(ModelErrEnum.unExist);
  });

  it.each<SystemModelDataType>([
    { ...vlm, isActive: false },
    { ...vlm, config: { ...vlm.config, vision: false } },
    {
      ...vlm,
      type: ModelTypeEnum.embedding,
      config: { defaultToken: 1, maxToken: 100, weight: 0, vision: true }
    }
  ])('returns unavailable for disabled, nonvisual or wrong-type models: $type', (model) => {
    const result = createHandle([model]).tryGetVlmModelData({ modelId: vlm.modelId });
    expect(result.model).toBeUndefined();
    expect(result.error?.message).toBe(ModelErrEnum.unExist);
  });

  it.each([
    new TypeError('unexpected failure'),
    new Error(ModelErrEnum.unExist),
    new UserError('unrelated user error')
  ])('rethrows unexpected failures unchanged: %s', (error) => {
    // 使用真实输入访问异常，不 mock 严格 getter，证明结果包装不会吞掉非预期错误。
    const reference: ModelReferenceType = {
      get modelId(): string {
        throw error;
      }
    };
    expect(() => createHandle().tryGetVlmModelData(reference)).toThrow(error);
  });
});

describe('upstream model selection semantics', () => {
  it.each([undefined, null, '', '   '])('treats empty references consistently (%s)', (modelId) => {
    const handle = createHandle();
    expect(() => handle.getLLMModelData({ modelId })).toThrow(ModelErrEnum.unConfigured);
    expect(handle.getLLMModelData({ modelId }, { optional: true })).toBeUndefined();
    expect(handle.getVlmModelData({ modelId }, { optional: true })).toBeUndefined();
    expect(handle.getLLMModelData({ modelId, model: vlm.model }).modelId).toBe(vlm.modelId);
    expect(handle.tryGetVlmModelData({ modelId }).error?.message).toBe(ModelErrEnum.unConfigured);
  });

  it('reports disabled and wrong-type models by actual display name', () => {
    for (const [model, type, vision, message] of [
      [{ ...vlm, isActive: false }, ModelTypeEnum.llm, false, 'Model is disabled: Visual model'],
      [vlm, ModelTypeEnum.embedding, false, 'Model type mismatch: Visual model'],
      [
        { ...vlm, config: { ...vlm.config, vision: false } },
        ModelTypeEnum.llm,
        true,
        'Model type mismatch: Visual model'
      ],
      [
        { ...vlm, name: '', isActive: false },
        ModelTypeEnum.llm,
        false,
        'Model is disabled: test-vlm'
      ]
    ] as const) {
      expect(() => assertModelAvailable({ model, type, vision })).toThrow(ModelErrEnum.unExist);
      try {
        assertModelAvailable({ model, type, vision });
      } catch (error) {
        expect(getErrText(error)).toBe(message);
      }
    }
    expect(() => assertModelAvailable({ type: ModelTypeEnum.llm })).toThrow(ModelErrEnum.unExist);
  });

  it('distinguishes absent defaults from disabled defaults', () => {
    expect(() => createHandle().getDefaultModelData('llm')).toThrow(ModelErrEnum.unConfigured);
    const handle = createModelHandle({
      models: [vlm],
      defaultModels: { llm: { ...vlm, isActive: false } },
      configuredDefaultModelIds: {},
      revision: 0,
      version: 'disabled'
    });
    expect(() => handle.getDefaultModelData('llm')).toThrow(ModelErrEnum.unExist);
    try {
      handle.getDefaultModelData('llm');
    } catch (error) {
      expect(getErrText(error)).toBe('Model is disabled: Visual model');
    }
  });
});
