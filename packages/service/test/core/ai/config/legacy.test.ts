import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { LegacySystemModelCollectionName } from '@fastgpt/service/core/ai/config/constants';
import { bootstrapAIModelsFromLegacy } from '@fastgpt/service/core/ai/config/legacy';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';

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

  it('migrates an empty legacy collection with a zero source count', async () => {
    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'migrated',
      sourceCount: 0
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(0);
    await expect(MongoAIDefaultModel.findOne({ scope: 'system' }).lean()).resolves.toMatchObject({
      scope: 'system',
      defaultModelIds: {}
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

  it('skips before inspecting invalid legacy data when ai_models is non-empty', async () => {
    await MongoAIModel.create(pluginLlm);
    await legacyCollection.insertOne({ model: '', metadata: { type: 'unknown' } });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'skipped',
      sourceCount: 0
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('skips when another instance fills ai_models before the transactional recheck', async () => {
    await legacyCollection.insertOne(createLegacyLlm('legacy-race-model'));
    const countDocuments = MongoAIModel.countDocuments.bind(MongoAIModel);
    vi.spyOn(MongoAIModel, 'countDocuments').mockImplementationOnce(async () => {
      await MongoAIModel.collection.insertOne(pluginLlm);
      return 1;
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'skipped',
      sourceCount: 1
    });
    vi.mocked(MongoAIModel.countDocuments).mockRestore();
    await expect(countDocuments({})).resolves.toBe(1);
    await expect(MongoAIModel.findOne({ model: 'legacy-race-model' })).resolves.toBeNull();
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
      sourceCount: 2
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
      sourceCount: 1
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

  it('converges to skipped when another instance writes the complete candidate set', async () => {
    await legacyCollection.insertMany([createLegacyLlm('race-a'), createLegacyLlm('race-b')]);
    const insertMany = MongoAIModel.collection.insertMany.bind(MongoAIModel.collection);
    const raceError = new Error('simulated transaction race');
    vi.spyOn(MongoAIModel.collection, 'insertMany').mockImplementationOnce(async (documents) => {
      await insertMany(documents);
      await MongoAIDefaultModel.create({ scope: 'system', defaultModelIds: {} });
      throw raceError;
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).resolves.toEqual({
      status: 'skipped',
      sourceCount: 2
    });
    await expect(MongoAIModel.countDocuments()).resolves.toBe(2);
  });

  it('rethrows a race error when another instance writes only part of the candidate set', async () => {
    await legacyCollection.insertMany([createLegacyLlm('partial-a'), createLegacyLlm('partial-b')]);
    const insertOne = MongoAIModel.collection.insertOne.bind(MongoAIModel.collection);
    const raceError = new Error('simulated partial transaction race');
    vi.spyOn(MongoAIModel.collection, 'insertMany').mockImplementationOnce(async (documents) => {
      await insertOne(documents[0]);
      throw raceError;
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).rejects.toBe(raceError);
    await expect(MongoAIModel.countDocuments()).resolves.toBe(1);
  });

  it('rethrows a race error when an id is occupied by a different model', async () => {
    await legacyCollection.insertMany([
      createLegacyLlm('mismatch-a'),
      createLegacyLlm('mismatch-b')
    ]);
    const insertMany = MongoAIModel.collection.insertMany.bind(MongoAIModel.collection);
    const raceError = new Error('simulated mismatched transaction race');
    vi.spyOn(MongoAIModel.collection, 'insertMany').mockImplementationOnce(async (documents) => {
      await insertMany(
        documents.map((document, index) =>
          index === 0 ? { ...document, model: 'different-model' } : document
        )
      );
      throw raceError;
    });

    await expect(bootstrapAIModelsFromLegacy({ pluginDocuments: [] })).rejects.toBe(raceError);
    await expect(MongoAIModel.countDocuments()).resolves.toBe(2);
  });
});
