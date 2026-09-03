import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { LegacySystemModelCollectionName } from '@fastgpt/service/core/ai/config/constants';
import { bootstrapAIModelsFromLegacy } from '@/migration/tasks/20260903_migrate_legacy_system_models/service';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';

// 本文件验证首次模型体系初始化的事务原子性，不能使用全局的无事务测试替身。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

const pluginLlm: SystemModelDocumentDataType = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'plugin-llm',
  name: 'Plugin LLM',
  scope: 'system',
  isActive: true,
  config: {
    maxContext: 128000,
    maxResponse: 32000,
    quoteMaxToken: 100000
  }
};

const createLegacyLlm = (model: string) => ({
  model,
  metadata: {
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    name: model,
    maxContext: 32000,
    maxResponse: 16000,
    quoteMaxToken: 24000
  }
});

describe('bootstrapAIModelsFromLegacy', () => {
  const legacyCollection = MongoAIModel.db.collection(LegacySystemModelCollectionName);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await Promise.all([
      MongoAIModel.deleteMany({}),
      MongoAIDefaultModel.deleteMany({}),
      legacyCollection.deleteMany({})
    ]);
  });

  it('preserves an existing valid default while merging a legacy model', async () => {
    const existingModel = await MongoAIModel.create(pluginLlm);
    await MongoAIDefaultModel.create({
      scope: 'system',
      defaultModelIds: { llm: String(existingModel._id) }
    });
    const legacy = await legacyCollection.insertOne({
      ...createLegacyLlm('legacy-default-candidate'),
      isActive: true,
      isDefault: true
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 1,
      targetCount: 2,
      migratedCount: 1
    });
    await expect(MongoAIModel.findById(existingModel._id)).resolves.not.toBeNull();
    await expect(MongoAIModel.findById(legacy.insertedId)).resolves.not.toBeNull();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(2);
    await expect(MongoAIDefaultModel.findOne({ scope: 'system' }).lean()).resolves.toMatchObject({
      scope: 'system',
      defaultModelIds: { llm: String(existingModel._id) }
    });
  });

  it('migrates legacy default flags into the single system default record', async () => {
    const result = await legacyCollection.insertMany([
      {
        ...createLegacyLlm('legacy-default-llm'),
        isActive: true,
        isDefault: true,
        isDefaultDatasetTextModel: true,
        isDefaultChatTitleModel: true
      },
      {
        model: 'legacy-default-embedding',
        isActive: true,
        metadata: {
          type: ModelTypeEnum.embedding,
          provider: 'OpenAI',
          name: 'Legacy embedding',
          defaultToken: 500,
          maxToken: 3000,
          weight: 100,
          isDefault: true
        }
      }
    ]);

    await bootstrapAIModelsFromLegacy({ pluginDocuments: [] });

    await expect(MongoAIDefaultModel.findOne({ scope: 'system' }).lean()).resolves.toMatchObject({
      scope: 'system',
      defaultModelIds: {
        llm: String(result.insertedIds[0]),
        embedding: String(result.insertedIds[1]),
        datasetTextLLM: String(result.insertedIds[0]),
        chatTitleLLM: String(result.insertedIds[0])
      }
    });
    const migratedModels = await MongoAIModel.collection.find({}).toArray();
    for (const model of migratedModels) {
      expect(model).not.toHaveProperty('isDefault');
      expect(model).not.toHaveProperty('isDefaultDatasetTextModel');
      expect(model).not.toHaveProperty('isDefaultChatTitleModel');
    }
  });

  it('keeps auto-preinstalled models while inserting legacy-only models', async () => {
    await MongoAIModel.create(pluginLlm);
    const legacy = await legacyCollection.insertOne(createLegacyLlm('legacy-model'));

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 1,
      targetCount: 2,
      migratedCount: 1
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(2);
    await expect(MongoAIModel.findById(legacy.insertedId)).resolves.not.toBeNull();
    await expect(MongoAIModel.exists({ model: pluginLlm.model })).resolves.not.toBeNull();
    await expect(MongoAIDefaultModel.exists({ scope: 'system' })).resolves.not.toBeNull();
  });

  it('keeps the later legacy record when model names are duplicated', async () => {
    const result = await legacyCollection.insertMany([
      {
        ...createLegacyLlm('duplicate-model'),
        metadata: {
          ...createLegacyLlm('duplicate-model').metadata,
          name: 'Older duplicate',
          maxContext: 32000
        }
      },
      {
        ...createLegacyLlm('duplicate-model'),
        metadata: {
          ...createLegacyLlm('duplicate-model').metadata,
          name: 'Newer duplicate',
          maxContext: 64000
        }
      }
    ]);

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 2,
      targetCount: 1,
      migratedCount: 1
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
    const migrated = await MongoAIModel.findOne({ model: 'duplicate-model' }).lean();
    expect(migrated).toMatchObject({
      name: 'Newer duplicate',
      config: { maxContext: 64000 }
    });
    expect(String(migrated?._id)).toBe(String(result.insertedIds[1]));
    await expect(legacyCollection.countDocuments()).resolves.toBe(2);
  });

  it('rejects an invalid legacy record before writing any candidate', async () => {
    await legacyCollection.insertMany([
      createLegacyLlm('valid-before-invalid'),
      { model: 'invalid-model', metadata: { type: 'unknown' } }
    ]);

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).rejects.toThrow(
      'Invalid legacy system model'
    );
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    await expect(legacyCollection.countDocuments()).resolves.toBe(2);
  });

  it('rolls back model and default changes when the merge fails', async () => {
    await MongoAIModel.create(pluginLlm);
    await legacyCollection.insertOne(createLegacyLlm('legacy-write-failure'));
    const writeError = new Error('simulated target initialization failure');
    vi.spyOn(MongoAIModel.collection, 'bulkWrite').mockRejectedValue(writeError);

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).rejects.toBe(writeError);
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
    await expect(MongoAIModel.exists({ model: pluginLlm.model })).resolves.not.toBeNull();
    await expect(MongoAIDefaultModel.exists({ scope: 'system' })).resolves.toBeNull();
  });

  it('repairs a damaged legacy model from its plugin template and preserves the old id', async () => {
    const legacy = await legacyCollection.insertOne({
      model: pluginLlm.model,
      metadata: {
        name: 'Legacy display name',
        maxContext: 'invalid'
      }
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [pluginLlm] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 1,
      targetCount: 1,
      migratedCount: 1
    });
    await expect(MongoAIModel.findById(legacy.insertedId).lean()).resolves.toMatchObject({
      model: pluginLlm.model,
      name: 'Legacy display name',
      provider: pluginLlm.provider,
      type: pluginLlm.type,
      config: pluginLlm.config
    });
  });

  it('writes only canonical fields while leaving the legacy snapshot unchanged', async () => {
    const legacyDocument = {
      model: 'mixed-legacy-model',
      type: ModelTypeEnum.llm,
      provider: 'Top-level provider',
      name: 'Top-level name',
      isSystem: true,
      maxContext: 64000,
      maxResponse: 16000,
      quoteMaxToken: 24000,
      unknownLegacyField: 'keep only in legacy',
      metadata: {
        type: ModelTypeEnum.embedding,
        provider: 'Metadata provider',
        name: 'Metadata name',
        maxContext: 1
      }
    };
    const legacy = await legacyCollection.insertOne(legacyDocument);

    await bootstrapAIModelsFromLegacy({ pluginDocuments: [] });

    const migrated = await MongoAIModel.collection.findOne({ _id: legacy.insertedId });
    expect(migrated).toMatchObject({
      _id: legacy.insertedId,
      model: 'mixed-legacy-model',
      type: ModelTypeEnum.llm,
      provider: 'Top-level provider',
      name: 'Top-level name',
      scope: 'system',
      config: { maxContext: 64000, maxResponse: 16000, quoteMaxToken: 24000 }
    });
    expect(migrated).not.toHaveProperty('metadata');
    expect(migrated).not.toHaveProperty('isSystem');
    expect(migrated).not.toHaveProperty('maxContext');
    expect(migrated).not.toHaveProperty('unknownLegacyField');
    await expect(legacyCollection.findOne({ _id: legacy.insertedId })).resolves.toEqual({
      _id: legacy.insertedId,
      ...legacyDocument
    });
  });

  it('reapplies the latest legacy snapshot without duplicating a model', async () => {
    const legacy = await legacyCollection.insertOne({
      ...createLegacyLlm('repeatable-model'),
      metadata: {
        ...createLegacyLlm('repeatable-model').metadata,
        name: 'Legacy version 1'
      }
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 1,
      targetCount: 1,
      migratedCount: 1
    });
    await expect(MongoAIModel.findById(legacy.insertedId).lean()).resolves.toMatchObject({
      model: 'repeatable-model',
      name: 'Legacy version 1',
      config: { maxContext: 32000 }
    });

    await legacyCollection.updateOne(
      { _id: legacy.insertedId },
      {
        $set: {
          'metadata.name': 'Legacy version 2',
          'metadata.maxContext': 64000
        }
      }
    );
    await MongoAIModel.updateOne(
      { _id: legacy.insertedId },
      { $set: { name: 'Target changed again' } }
    );

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 1,
      targetCount: 1,
      migratedCount: 1
    });
    await expect(MongoAIModel.findById(legacy.insertedId).lean()).resolves.toMatchObject({
      model: 'repeatable-model',
      name: 'Legacy version 2',
      config: { maxContext: 64000 }
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('keeps a same-name target id while replacing its fields with the legacy model', async () => {
    const legacy = await legacyCollection.insertOne({
      ...createLegacyLlm('same-name-model'),
      isActive: true
    });
    const conflictingTarget = await MongoAIModel.create({
      ...pluginLlm,
      model: 'same-name-model',
      name: 'Conflicting target'
    });
    const unrelatedTarget = await MongoAIModel.create({
      ...pluginLlm,
      model: 'unrelated-model',
      name: 'Unrelated target'
    });
    await MongoAIDefaultModel.create({
      scope: 'system',
      defaultModelIds: { llm: String(conflictingTarget._id) }
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 1,
      targetCount: 2,
      migratedCount: 1
    });

    await expect(MongoAIModel.findById(conflictingTarget._id).lean()).resolves.toMatchObject({
      model: 'same-name-model',
      name: 'same-name-model',
      isActive: true,
      config: {
        maxContext: 32000,
        maxResponse: 16000,
        quoteMaxToken: 24000
      }
    });
    await expect(MongoAIModel.findById(legacy.insertedId)).resolves.toBeNull();
    await expect(MongoAIModel.findById(unrelatedTarget._id)).resolves.not.toBeNull();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(2);
    await expect(MongoAIDefaultModel.findOne({ scope: 'system' }).lean()).resolves.toMatchObject({
      defaultModelIds: { llm: String(conflictingTarget._id) }
    });
  });

  it('replaces a same-name preinstalled model with active legacy metadata', async () => {
    const legacy = await legacyCollection.insertOne({
      model: 'same-name-embedding',
      metadata: {
        type: ModelTypeEnum.embedding,
        provider: 'OpenAI',
        name: 'Legacy embedding',
        isActive: true,
        defaultToken: 500,
        maxToken: 3000,
        weight: 100
      }
    });
    const preinstalled = await MongoAIModel.create({
      type: ModelTypeEnum.embedding,
      provider: 'Plugin provider',
      model: 'same-name-embedding',
      name: 'Preinstalled embedding',
      scope: 'system',
      isActive: false,
      config: {
        defaultToken: 1000,
        maxToken: 8000,
        weight: 50
      }
    });

    await bootstrapAIModelsFromLegacy({ pluginDocuments: [] });

    await expect(MongoAIModel.findById(preinstalled._id).lean()).resolves.toMatchObject({
      model: 'same-name-embedding',
      provider: 'OpenAI',
      name: 'Legacy embedding',
      isActive: true,
      config: {
        defaultToken: 500,
        maxToken: 3000,
        weight: 100
      }
    });
    await expect(MongoAIModel.findById(legacy.insertedId)).resolves.toBeNull();
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('replaces an active same-name target with the inactive legacy state', async () => {
    await legacyCollection.insertOne({
      ...createLegacyLlm('same-name-active-target'),
      metadata: {
        ...createLegacyLlm('same-name-active-target').metadata,
        isActive: false
      }
    });
    const target = await MongoAIModel.create({
      ...pluginLlm,
      model: 'same-name-active-target'
    });

    await bootstrapAIModelsFromLegacy({ pluginDocuments: [] });

    await expect(MongoAIModel.findById(target._id).lean()).resolves.toMatchObject({
      model: 'same-name-active-target',
      isActive: false
    });
  });

  it('replaces an invalid existing default with the resolved id of the legacy default', async () => {
    const existingModel = await MongoAIModel.create({
      ...pluginLlm,
      model: 'same-name-default',
      name: 'Existing model'
    });
    await MongoAIDefaultModel.create({
      scope: 'system',
      defaultModelIds: { llm: 'missing-model-id' }
    });
    await legacyCollection.insertOne({
      ...createLegacyLlm('same-name-default'),
      isActive: true,
      isDefault: true,
      isDefaultDatasetTextModel: true
    });

    await bootstrapAIModelsFromLegacy({ pluginDocuments: [] });

    await expect(MongoAIDefaultModel.findOne({ scope: 'system' }).lean()).resolves.toMatchObject({
      defaultModelIds: {
        llm: String(existingModel._id),
        datasetTextLLM: String(existingModel._id)
      }
    });
  });

  it('rejects a legacy id collision without changing the unrelated target model', async () => {
    const legacy = await legacyCollection.insertOne(createLegacyLlm('legacy-id-conflict'));
    await MongoAIModel.create({
      _id: legacy.insertedId,
      ...pluginLlm,
      model: 'unrelated-target'
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).rejects.toThrow(
      'Legacy system model id conflicts with target model'
    );
    await expect(MongoAIModel.findById(legacy.insertedId).lean()).resolves.toMatchObject({
      model: 'unrelated-target'
    });
    await expect(MongoAIDefaultModel.exists({ scope: 'system' })).resolves.toBeNull();
  });

  it('rejects a legacy model whose type conflicts with its plugin template before writing', async () => {
    await legacyCollection.insertOne({
      model: pluginLlm.model,
      metadata: {
        type: ModelTypeEnum.embedding,
        provider: 'OpenAI',
        name: 'Conflicting embedding',
        defaultToken: 500,
        maxToken: 3000,
        weight: 100
      }
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [pluginLlm] })).rejects.toThrow(
      'System model type does not match plugin template'
    );
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    await expect(MongoAIDefaultModel.exists({ scope: 'system' })).resolves.toBeNull();
  });
});
