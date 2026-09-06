import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import { loadModelCatalog } from '@/migration/tasks/4163_model_references/modelCatalog';

describe('loadModelCatalog', () => {
  const llmRequirement = { type: ModelTypeEnum.llm };
  const visionRequirement = { type: ModelTypeEnum.llm, vision: true };

  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoAIModel.deleteMany({});
    await MongoAIDefaultModel.deleteMany({});
  });

  it('accepts an empty catalog but guards every operation needing a model', async () => {
    const catalog = await loadModelCatalog();
    for (const modelId of [undefined, null, '']) {
      expect(catalog.hasModelId(modelId)).toBe(false);
      expect(catalog.hasMatchingModelId(modelId, llmRequirement)).toBe(false);
      expect(catalog.resolveModelId({ modelId, requirement: llmRequirement })).toBeUndefined();
    }
    expect(catalog.resolveModelIdByName(undefined)).toBeUndefined();
    expect(catalog.resolveModelIdByName('')).toBeUndefined();
    for (const resolve of [
      () => catalog.assertAvailable(),
      () => catalog.hasModelId('id'),
      () => catalog.hasMatchingModelId('id', llmRequirement),
      () => catalog.resolveModelIdByName('legacy'),
      () => catalog.resolveModelId({ legacyModel: 'legacy', requirement: llmRequirement }),
      () => catalog.resolveModelId({ modelId: 'id', requirement: llmRequirement }),
      () => catalog.resolveFallbackModelId(llmRequirement)
    ]) {
      expect(resolve).toThrow('Cannot migrate model references while ai_models is empty');
    }
  });

  it('preserves ID precedence, exact legacy matching and deterministic typed defaults', async () => {
    const ids = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    await MongoAIModel.collection.insertMany([
      { _id: ids[0], scope: 'system', model: 'llm', type: 'llm', isActive: false, config: {} },
      {
        _id: ids[1],
        scope: 'system',
        model: 'vision',
        type: 'llm',
        isActive: true,
        config: { vision: true }
      },
      {
        _id: ids[2],
        scope: 'system',
        model: 'embedding',
        type: 'embedding',
        isActive: true,
        config: {}
      }
    ]);
    await MongoAIDefaultModel.collection.insertOne({
      scope: 'system',
      defaultModelIds: {
        llm: String(ids[1]),
        embedding: String(ids[0]),
        tts: new Types.ObjectId().toString()
      }
    });
    const catalog = await loadModelCatalog();
    expect(() => catalog.assertAvailable()).not.toThrow();
    expect(catalog.hasModelId(ids[0])).toBe(true);
    expect(catalog.hasModelId('missing')).toBe(false);
    expect(catalog.hasMatchingModelId(ids[0], llmRequirement)).toBe(true);
    expect(catalog.hasMatchingModelId(ids[0], visionRequirement)).toBe(false);
    expect(catalog.hasMatchingModelId(ids[1], visionRequirement)).toBe(true);
    expect(catalog.hasMatchingModelId(ids[2], llmRequirement)).toBe(false);
    expect(catalog.hasMatchingModelId('missing', llmRequirement)).toBe(false);
    expect(catalog.resolveModelIdByName('llm')).toBe(String(ids[0]));
    expect(catalog.resolveModelIdByName('missing')).toBeUndefined();
    expect(
      catalog.resolveModelId({
        modelId: ids[0],
        legacyModel: 'vision',
        requirement: llmRequirement
      })
    ).toBe(String(ids[0]));
    expect(
      catalog.resolveModelId({
        modelId: ids[2],
        legacyModel: 'vision',
        requirement: llmRequirement
      })
    ).toBe(String(ids[1]));
    expect(
      catalog.resolveModelId({ legacyModel: 'embedding', requirement: llmRequirement })
    ).toBeUndefined();
    expect(
      catalog.resolveModelId({ legacyModel: 'missing', requirement: llmRequirement })
    ).toBeUndefined();
    expect(catalog.resolveFallbackModelId(llmRequirement)).toBe(String(ids[1]));
    expect(catalog.resolveFallbackModelId({ type: ModelTypeEnum.embedding })).toBe(String(ids[2]));
    expect(catalog.resolveFallbackModelId({ type: ModelTypeEnum.tts })).toBeUndefined();
    expect(catalog.resolveFallbackModelId({ type: ModelTypeEnum.stt })).toBeUndefined();

    await MongoAIDefaultModel.deleteMany({});
    const fallbackCatalog = await loadModelCatalog();
    expect(fallbackCatalog.resolveFallbackModelId(llmRequirement)).toBe(String(ids[0]));
    expect(fallbackCatalog.resolveFallbackModelId(visionRequirement)).toBe(String(ids[1]));
  });

  it('propagates database failures instead of treating them as an empty installation', async () => {
    vi.spyOn(MongoAIModel, 'find').mockImplementation(() => {
      throw new Error('database unavailable');
    });
    await expect(loadModelCatalog()).rejects.toThrow('database unavailable');
  });
});
