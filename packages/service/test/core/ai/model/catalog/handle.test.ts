import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  AIModelDataType,
  LLMModelDataType,
  ModelReferenceType
} from '@fastgpt/global/core/ai/model/schema';
import { createModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { assertModelAvailable } from '@fastgpt/service/core/ai/utils';
import { describe, expect, expectTypeOf, it } from 'vitest';

const vlm: LLMModelDataType = {
  modelId: '68ee0bd23d17260b7829b137',
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  provider: 'OpenAI',
  model: 'test-vlm',
  name: 'Visual model',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000, vision: true }
};

const createHandle = (models: AIModelDataType[] = [vlm]) =>
  createModelHandle({
    models,
    defaultModels: {},
    configuredDefaultModelIds: {},
    revision: 0,
    version: 'test'
  });

describe('getModelData and model lookup', () => {
  it('returns the snapshot model and narrows the result', () => {
    const handle = createHandle();
    const model = handle.getModelData(
      { modelId: vlm.modelId },
      { type: ModelTypeEnum.llm, vision: true }
    );
    expectTypeOf(model).toEqualTypeOf<LLMModelDataType>();
    expect(model.modelId).toBe(vlm.modelId);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('resolves legacy names to system models and requires IDs for private models', () => {
    const first = {
      ...vlm,
      modelId: 'member-a',
      scope: ModelScopeEnum.team,
      tmbId: 'member-a'
    };
    const second = { ...first, modelId: 'member-b', tmbId: 'member-b' };
    const privateOnly = { ...first, modelId: 'private-only', model: 'private-vlm' };
    const handle = createHandle([first, vlm, second, privateOnly]);

    expect(handle.getModelData({ model: vlm.model }, { type: ModelTypeEnum.llm }).modelId).toBe(
      vlm.modelId
    );
    expect(handle.findModelData({ model: privateOnly.model })).toBeUndefined();
    for (const model of [first, second, privateOnly]) {
      expect(
        handle.getModelData({ modelId: model.modelId }, { type: ModelTypeEnum.llm }).modelId
      ).toBe(model.modelId);
    }
  });

  it.each<ModelReferenceType>([
    { modelId: 'missing' },
    { model: 'missing' },
    { modelId: 'missing', model: vlm.model },
    { model: vlm.name }
  ])('throws ModelErrEnum.unExist for an invalid reference: %j', (reference) => {
    const handle = createHandle();
    expect(() => handle.getModelData(reference, { type: ModelTypeEnum.llm, vision: true })).toThrow(
      ModelErrEnum.unExist
    );
  });

  it.each<AIModelDataType>([
    { ...vlm, isActive: false },
    { ...vlm, config: { ...vlm.config, vision: false } },
    {
      ...vlm,
      type: ModelTypeEnum.embedding,
      config: { defaultToken: 1, maxToken: 100, weight: 0, vision: true }
    }
  ])('throws unExist for disabled, nonvisual or wrong-type models: $type', (model) => {
    expect(() =>
      createHandle([model]).getModelData(
        { modelId: vlm.modelId },
        { type: ModelTypeEnum.llm, vision: true }
      )
    ).toThrow(ModelErrEnum.unExist);
  });
});

describe('upstream model selection semantics', () => {
  it.each([undefined, null, '', '   '])('treats empty references consistently (%s)', (modelId) => {
    const handle = createHandle();
    expect(() => handle.getModelData({ modelId }, { type: ModelTypeEnum.llm })).toThrow(
      ModelErrEnum.unConfigured
    );
    expect(
      handle.getModelData({ modelId }, { type: ModelTypeEnum.llm, optional: true })
    ).toBeUndefined();
    expect(
      handle.getModelData({ modelId }, { type: ModelTypeEnum.llm, vision: true, optional: true })
    ).toBeUndefined();
    expect(
      handle.getModelData({ modelId, model: vlm.model }, { type: ModelTypeEnum.llm }).modelId
    ).toBe(vlm.modelId);
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

  it('protects shared configuration and returns editable lookup copies', () => {
    const input = structuredClone(vlm);
    const handle = createHandle([input]);
    input.name = 'Changed input';
    const resolved = handle.getModelData({ modelId: vlm.modelId }, { type: ModelTypeEnum.llm });
    expect(resolved.name).toBe('Visual model');
    expect(() => {
      (resolved as any).name = 'Wrong';
    }).toThrow();
    expect(() => {
      resolved.config.maxContext = 1;
    }).toThrow();
    expect(() => handle.getAllModels().pop()).toThrow();
    const copy = handle.findModelData({ modelId: vlm.modelId })!;
    copy.name = 'Draft';
    expect(resolved.name).toBe('Visual model');
  });
});
