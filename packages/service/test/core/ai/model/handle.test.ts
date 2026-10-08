import { assertModelAvailable } from '@fastgpt/service/core/ai/utils';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  LLMSystemModelDataType,
  ModelReferenceType,
  SystemModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError, getErrText } from '@fastgpt/global/common/error/utils';
import { createModelHandle } from '../../../../core/ai/model/handle';
import { isImageEmbeddingModel } from '../../../../core/ai/model';

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

describe('getVlmModelData and model lookup', () => {
  it('returns the snapshot model and narrows the result', () => {
    const handle = createHandle();
    const model = handle.getVlmModelData({ modelId: vlm.modelId });
    expectTypeOf(model).toEqualTypeOf<LLMSystemModelDataType>();
    expect(model.modelId).toBe(vlm.modelId);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('supports legacy names only when the stable ID is absent', () => {
    expect(createHandle().getVlmModelData({ model: vlm.model }).modelId).toBe(vlm.modelId);
  });

  it('does not index team models into modelsByName map to prevent tenant model hijacking', () => {
    const teamModel: SystemModelDataType = {
      modelId: 'team-model-id',
      type: ModelTypeEnum.llm,
      scope: 'team' as const,
      provider: 'OpenAI',
      model: 'team-vlm',
      name: 'Team Visual model',
      isActive: true,
      config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000, vision: true },
      tmbId: 'user-tmb-1'
    };
    const handle = createHandle([vlm, teamModel]);
    // Can still find by modelId
    expect(handle.findModelData({ modelId: 'team-model-id' })?.modelId).toBe('team-model-id');
    // Cannot find team model by legacy model name
    expect(handle.findModelData({ model: 'team-vlm' })).toBeUndefined();
    // System model can still be found by legacy model name
    expect(handle.findModelData({ model: vlm.model })?.modelId).toBe(vlm.modelId);
  });

  it('resolves legacy model name only to system model when system and multiple members install models with the same name', () => {
    const sysGpt: SystemModelDataType = {
      modelId: 'sys-gpt-id',
      type: ModelTypeEnum.llm,
      scope: 'system' as const,
      provider: 'OpenAI',
      model: 'gpt-4o',
      name: 'System GPT-4o',
      isActive: true,
      config: { maxContext: 128000, maxResponse: 4096, quoteMaxToken: 100000, vision: true }
    };
    const memberAGpt: SystemModelDataType = {
      modelId: 'member-a-gpt-id',
      type: ModelTypeEnum.llm,
      scope: 'team' as const,
      tmbId: 'member-a',
      teamId: 'team-1',
      provider: 'OpenAI',
      model: 'gpt-4o',
      name: 'Member A Private GPT-4o',
      isActive: true,
      config: { maxContext: 128000, maxResponse: 4096, quoteMaxToken: 100000, vision: true }
    };
    const memberBGpt: SystemModelDataType = {
      modelId: 'member-b-gpt-id',
      type: ModelTypeEnum.llm,
      scope: 'team' as const,
      tmbId: 'member-b',
      teamId: 'team-1',
      provider: 'OpenAI',
      model: 'gpt-4o',
      name: 'Member B Private GPT-4o',
      isActive: true,
      config: { maxContext: 128000, maxResponse: 4096, quoteMaxToken: 100000, vision: true }
    };

    // Regardless of order in database / snapshot (even if team models appear later or earlier)
    const handle = createHandle([memberBGpt, sysGpt, memberAGpt]);

    // Legacy reference with model name 'gpt-4o' must always resolve to the system model
    const resolved = handle.getLLMModelData({ model: 'gpt-4o' });
    expect(resolved.modelId).toBe('sys-gpt-id');
    expect(resolved.name).toBe('System GPT-4o');

    // Neither member's team model can be resolved by bare model name
    expect(handle.findModelData({ model: 'gpt-4o' })?.modelId).toBe('sys-gpt-id');

    // Team models are strictly resolved by stable modelId
    expect(handle.getLLMModelData({ modelId: 'member-a-gpt-id' }).name).toBe(
      'Member A Private GPT-4o'
    );
    expect(handle.getLLMModelData({ modelId: 'member-b-gpt-id' }).name).toBe(
      'Member B Private GPT-4o'
    );
  });

  it.each<ModelReferenceType>([
    { modelId: 'missing' },
    { model: 'missing' },
    { modelId: 'missing', model: vlm.model },
    { model: vlm.name }
  ])('throws ModelErrEnum.unExist for an invalid reference: %j', (reference) => {
    const handle = createHandle();
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
  ])('throws unExist for disabled, nonvisual or wrong-type models: $type', (model) => {
    expect(() => createHandle([model]).getVlmModelData({ modelId: vlm.modelId })).toThrow(
      ModelErrEnum.unExist
    );
  });

  it.each([
    new TypeError('unexpected failure'),
    new Error(ModelErrEnum.unExist),
    new UserError('unrelated user error')
  ])('rethrows unexpected failures unchanged: %s', (error) => {
    const reference: ModelReferenceType = {
      get modelId(): string {
        throw error;
      }
    };
    expect(() => createHandle().getVlmModelData(reference)).toThrow(error);
  });
});

describe('upstream model selection semantics', () => {
  it.each([undefined, null, '', '   '])('treats empty references consistently (%s)', (modelId) => {
    const handle = createHandle();
    expect(() => handle.getLLMModelData({ modelId })).toThrow(ModelErrEnum.unConfigured);
    expect(handle.getLLMModelData({ modelId }, { optional: true })).toBeUndefined();
    expect(handle.getVlmModelData({ modelId }, { optional: true })).toBeUndefined();
    expect(handle.getLLMModelData({ modelId, model: vlm.model }).modelId).toBe(vlm.modelId);
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
    const resolved = handle.getLLMModelData({ modelId: vlm.modelId });
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

  it('recognizes image embeddings without reading any cache', () => {
    expect(isImageEmbeddingModel()).toBe(false);
    expect(isImageEmbeddingModel({ config: { vision: true } } as never)).toBe(true);
  });
});
