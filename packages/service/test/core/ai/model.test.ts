import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { createModelHandle, publishModelHandle } from '../../../core/ai/config/handle';
import * as entity from '../../../core/ai/config/entity';
vi.unmock('@fastgpt/service/core/ai/model');
import { getModelHandle, isImageEmbeddingModel } from '../../../core/ai/model';

const model: SystemModelDataType = {
  modelId: '68ee0bd23d17260b7829b137',
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-llm',
  name: 'Display name',
  scope: 'system' as const,
  isActive: true,
  config: { maxContext: 128000, maxResponse: 8192, quoteMaxToken: 100000, vision: true }
};
const build = (models: SystemModelDataType[] = [model], revision = 0) =>
  createModelHandle({
    models,
    defaultModels: { llm: models[0] as typeof model },
    configuredDefaultModelIds: { llm: model.modelId },
    revision,
    version: 'v' + revision
  });

describe('getModelHandle', () => {
  beforeEach(() => {
    publishModelHandle(build());
    vi.spyOn(entity, 'readSystemModelRevision').mockResolvedValue(0);
  });
  afterEach(() => vi.restoreAllMocks());

  it('reuses the same handle without rebuilding an unchanged snapshot', async () => {
    const first = await getModelHandle();
    const second = await getModelHandle();
    expect(second).toBe(first);
    expect(first.getLLMModelData({ modelId: model.modelId }).config.maxContext).toBe(128000);
  });

  it('keeps issued handles bound to their original model and version', async () => {
    const first = await getModelHandle();
    publishModelHandle(build([{ ...model, name: 'New alias' }], 1));
    const next = await getModelHandle();
    expect(next).not.toBe(first);
    expect(first.getLLMModelData({ modelId: model.modelId }).name).toBe('Display name');
    expect(first.revision).toBe(0);
    expect(next.getLLMModelData({ modelId: model.modelId }).name).toBe('New alias');
  });

  it('merges concurrent version checks and does not retry an unchanged directory', async () => {
    const read = vi.mocked(entity.readSystemModelRevision);
    await Promise.all([getModelHandle(), getModelHandle(), getModelHandle()]);
    expect(read).toHaveBeenCalledOnce();
  });

  it('falls back to the local handle on failed version reads', async () => {
    const first = await getModelHandle();
    vi.mocked(entity.readSystemModelRevision).mockRejectedValue(new Error('offline'));
    expect(await getModelHandle()).toBe(first);
  });

  it('rejects initial reads when no snapshot is available', async () => {
    publishModelHandle(undefined);
    vi.mocked(entity.readSystemModelRevision).mockRejectedValue(new Error('offline'));
    await expect(getModelHandle()).rejects.toThrow('offline');
  });
});

describe('model handle operations', () => {
  it('does not fall back from invalid IDs or search display aliases', () => {
    const handle = build();
    expect(handle.getLLMModelData({ model: model.model }).modelId).toBe(model.modelId);
    expect(handle.getLLMModelData({ modelId: '', model: model.model }).modelId).toBe(model.modelId);
    expect(() => handle.getLLMModelData({})).toThrow('modelUnConfigured');
    for (const ref of [{ modelId: 'missing', model: model.model }, { model: model.name }]) {
      expect(() => handle.getLLMModelData(ref)).toThrow('modelUnExist');
    }
  });

  it('optional only accepts missing references, not invalid or inactive ones', () => {
    const handle = build([{ ...model, isActive: false }]);
    expect(handle.getLLMModelData({}, { optional: true })).toBeUndefined();
    expect(() => handle.getLLMModelData({ modelId: model.modelId }, { optional: true })).toThrow();
    expect(handle.findModelData({ modelId: model.modelId })).toMatchObject({ isActive: false });
    expect(handle.getActiveModels()).toEqual([]);
  });

  it('keeps type and vision validation for runtime and display lookup', () => {
    const handle = build([{ ...model, config: { ...model.config, vision: false } }]);
    expect(() => handle.getVlmModelData({ modelId: model.modelId })).toThrow();
    expect(() => handle.getEmbeddingModelData({ modelId: model.modelId })).toThrow();
    expect(handle.findModelData({ modelId: model.modelId }, { type: 'embedding' })).toBeUndefined();
    expect(
      handle.findModelData({ modelId: model.modelId }, { type: 'llm', vision: true })
    ).toBeUndefined();
    expect(handle.findModelData({ modelId: 'missing' })).toBeUndefined();
  });

  it('protects shared configuration and returns editable lookup copies', () => {
    const input = structuredClone(model);
    const handle = build([input]);
    input.name = 'Changed input';
    const resolved = handle.getLLMModelData({ modelId: model.modelId });
    expect(resolved.name).toBe('Display name');
    expect(() => {
      resolved.name = 'Wrong';
    }).toThrow();
    expect(() => {
      resolved.config.maxContext = 1;
    }).toThrow();
    expect(() => handle.getAllModels().pop()).toThrow();
    const copy = handle.findModelData({ modelId: model.modelId })!;
    copy.name = 'Draft';
    expect(resolved.name).toBe('Display name');
  });

  it('preserves strict defaults and optional image/title slots', () => {
    const handle = build();
    expect(handle.getDefaultModelData('llm').modelId).toBe(model.modelId);
    expect(handle.getSystemDefaultModelIds().llm).toBe(model.modelId);
    expect(handle.getDefaultModelData('datasetImageLLM')).toBeUndefined();
    expect(handle.getDefaultModelData('chatTitleLLM')).toBeUndefined();
    expect(() => handle.getDefaultModelData('embedding')).toThrow();
  });

  it('recognizes image embeddings without reading any cache', () => {
    expect(isImageEmbeddingModel()).toBe(false);
    expect(isImageEmbeddingModel({ config: { vision: true } } as never)).toBe(true);
  });

  it('rejects malformed default types and accepts configured visual/title defaults', () => {
    const valid = createModelHandle({
      models: [model],
      defaultModels: { datasetImageLLM: model, chatTitleLLM: model },
      configuredDefaultModelIds: {},
      revision: 0,
      version: 'defaults'
    });
    expect(valid.getDefaultModelData('datasetImageLLM')?.modelId).toBe(model.modelId);
    expect(valid.getDefaultModelData('chatTitleLLM')?.modelId).toBe(model.modelId);
    const invalid = createModelHandle({
      models: [model],
      defaultModels: { embedding: model as never },
      configuredDefaultModelIds: {},
      revision: 0,
      version: 'invalid'
    });
    expect(() => invalid.getDefaultModelData('embedding')).toThrow('modelUnExist');
    const noVision = createModelHandle({
      models: [model],
      defaultModels: { datasetImageLLM: { ...model, config: { ...model.config, vision: false } } },
      configuredDefaultModelIds: {},
      revision: 0,
      version: 'no-vision'
    });
    expect(() => noVision.getDefaultModelData('datasetImageLLM')).toThrow('modelUnExist');
  });
});
