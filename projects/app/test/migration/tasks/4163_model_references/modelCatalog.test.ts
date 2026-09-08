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

  it.each([false, true])(
    'uses the dataset slot default and falls back only when unconfigured (vision=%s)',
    async (vision) => {
      const ids = Array.from({ length: 5 }, () => new Types.ObjectId());
      await MongoAIModel.collection.insertMany([
        {
          _id: ids[0],
          scope: 'system',
          model: 'first',
          type: 'llm',
          isActive: true,
          config: { vision: true }
        },
        {
          _id: ids[1],
          scope: 'system',
          model: 'text-only',
          type: 'llm',
          isActive: true,
          config: {}
        },
        {
          _id: ids[2],
          scope: 'system',
          model: 'disabled',
          type: 'llm',
          isActive: false,
          config: { vision: true }
        },
        {
          _id: ids[3],
          scope: 'system',
          model: 'wrong-type',
          type: 'embedding',
          isActive: true,
          config: {}
        },
        {
          _id: ids[4],
          scope: 'system',
          model: 'preferred',
          type: 'llm',
          isActive: true,
          config: { vision: true }
        }
      ]);
      const slot = vision ? 'datasetImageLLM' : 'datasetTextLLM';
      for (const defaultId of [
        String(ids[4]),
        undefined,
        '',
        ' \t ',
        'missing-id',
        String(ids[2]),
        String(ids[3]),
        String(ids[1])
      ]) {
        await MongoAIDefaultModel.collection.updateOne(
          { scope: 'system' },
          {
            $set: {
              defaultModelIds: { llm: String(ids[4]), ...(defaultId ? { [slot]: defaultId } : {}) }
            }
          },
          { upsert: true }
        );
        const catalog = await loadModelCatalog();
        const expectedId = (() => {
          if (defaultId === undefined || defaultId === '' || defaultId === ' \t ') {
            return String(ids[0]);
          }
          if (
            defaultId === String(ids[4]) ||
            defaultId === String(ids[2]) ||
            (!vision && defaultId === String(ids[1]))
          ) {
            return defaultId;
          }
        })();
        expect(
          catalog.resolveDatasetUnderstandingModelId({
            legacyModel: 'deleted',
            modelId: undefined,
            vision
          })
        ).toBe(expectedId);
        // 默认模型不能覆盖原引用；文本缺省补默认，图片缺省保持未配置。
        expect(
          catalog.resolveDatasetUnderstandingModelId({
            legacyModel: 'first',
            modelId: undefined,
            vision
          })
        ).toBe(String(ids[0]));
        expect(
          catalog.resolveDatasetUnderstandingModelId({
            legacyModel: 'deleted',
            modelId: ids[0],
            vision
          })
        ).toBe(String(ids[0]));
        expect(
          catalog.resolveDatasetUnderstandingModelId({
            legacyModel: undefined,
            modelId: undefined,
            vision
          })
        ).toBe(vision ? undefined : expectedId);
      }
    }
  );

  it('checks IDs before empty legacy names and only skips defaulting for unconfigured images', async () => {
    const ids = Array.from({ length: 4 }, () => new Types.ObjectId());
    await MongoAIModel.collection.insertMany([
      {
        _id: ids[0],
        scope: 'system',
        model: 'disabled',
        type: 'llm',
        isActive: false,
        config: { vision: true }
      },
      { _id: ids[1], scope: 'system', model: 'text', type: 'llm', isActive: true, config: {} },
      {
        _id: ids[2],
        scope: 'system',
        model: 'vision',
        type: 'llm',
        isActive: true,
        config: { vision: true }
      },
      {
        _id: ids[3],
        scope: 'system',
        model: 'embedding',
        type: 'embedding',
        isActive: true,
        config: {}
      }
    ]);
    const catalog = await loadModelCatalog();
    const resolve = catalog.resolveDatasetUnderstandingModelId;
    expect(resolve({ legacyModel: 'deleted', modelId: undefined, vision: false })).toBe(
      String(ids[1])
    );
    expect(resolve({ legacyModel: 'deleted', modelId: undefined, vision: true })).toBe(
      String(ids[2])
    );
    expect(resolve({ legacyModel: 'text', modelId: ids[2], vision: false })).toBe(String(ids[2]));
    expect(resolve({ legacyModel: 'disabled', modelId: undefined, vision: true })).toBe(
      String(ids[0])
    );
    expect(resolve({ legacyModel: 'deleted', modelId: ids[0], vision: true })).toBe(String(ids[0]));
    expect(resolve({ legacyModel: 'vision', modelId: 'missing', vision: true })).toBe(
      String(ids[2])
    );
    expect(resolve({ legacyModel: 'text', modelId: ids[3], vision: true })).toBe(String(ids[2]));
    for (const legacyModel of [undefined, null, '', '  ', '\t\n']) {
      expect(resolve({ legacyModel, modelId: undefined, vision: true })).toBeUndefined();
      expect(resolve({ legacyModel, modelId: 'missing', vision: true })).toBeUndefined();
      expect(resolve({ legacyModel, modelId: ids[2], vision: true })).toBe(String(ids[2]));
      expect(resolve({ legacyModel, modelId: ids[1], vision: true })).toBeUndefined();
      expect(resolve({ legacyModel, modelId: undefined, vision: false })).toBe(String(ids[1]));
      expect(resolve({ legacyModel, modelId: 'missing', vision: false })).toBe(String(ids[1]));
      expect(resolve({ legacyModel, modelId: ids[2], vision: false })).toBe(String(ids[2]));
    }
    // 非字符串是无效配置而非空值，仍允许按引用失效规则回退。
    expect(resolve({ legacyModel: 123, modelId: undefined, vision: true })).toBe(String(ids[2]));
    await MongoAIModel.deleteMany({ isActive: true });
    const noActive = await loadModelCatalog();
    expect(
      noActive.resolveDatasetUnderstandingModelId({
        legacyModel: 'deleted',
        modelId: undefined,
        vision: true
      })
    ).toBeUndefined();
    await MongoAIModel.deleteMany({});
    const empty = await loadModelCatalog();
    expect(
      empty.resolveDatasetUnderstandingModelId({
        legacyModel: 'deleted',
        modelId: undefined,
        vision: false
      })
    ).toBeUndefined();
  });
});
