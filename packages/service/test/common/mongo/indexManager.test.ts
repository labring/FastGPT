import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectionMongo,
  defineIndex,
  getSchemaDeprecatedMongoIndexes,
  Schema
} from '@fastgpt/service/common/mongo';
import type { DeprecatedMongoIndexDefinition } from '@fastgpt/service/common/mongo/schemaIndexes';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';
import { withMongoDdlConnection } from '@fastgpt/dal/db/mongo/runtime';
import {
  LEGACY_DEPRECATED_MONGO_INDEXES,
  runLegacyDeprecatedMongoIndexCleanup
} from '@fastgpt/service/common/mongo/legacyDeprecatedIndexCleanup';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoModelStatusProbeRecord } from '@fastgpt/service/core/ai/modelStatus/schema';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const createModel = ({
  schema,
  prefix = 'MongoIndexManager'
}: {
  schema: InstanceType<typeof Schema>;
  prefix?: string;
}) => {
  const suffix = randomUUID().replaceAll('-', '');
  return connectionMongo.model(`${prefix}${suffix}`, schema, `${prefix.toLowerCase()}_${suffix}`);
};

const getIndexNames = async (model: ReturnType<typeof createModel>) =>
  new Set((await model.collection.indexes()).map((index) => index.name));

const defineDeprecatedTestIndexes = (
  schema: InstanceType<typeof Schema>,
  indexes: DeprecatedMongoIndexDefinition[]
) => {
  indexes.forEach(({ indexName, key, options }) => {
    defineIndex(schema, {
      key,
      options: { ...options, name: indexName },
      deprecated: true
    });
  });
};

const legacyDefinition = {
  indexName: 'legacy_field_1',
  key: { legacyField: 1 }
} as const;

describe('runtime configuration scope indexes', () => {
  it('uses the domain unique index for the Pro ENV scope alongside business domains', async () => {
    const model = createModel({
      schema: MongoSystemInstanceConfig.schema,
      prefix: 'InstanceScopeIndexes'
    });
    await model.createIndexes();
    await model.create([
      { domain: 'site', overrides: {} },
      { domain: 'proEnv', overrides: { teamMode: 'multi' } }
    ]);
    await expect(model.create({ domain: 'proEnv', overrides: {} })).rejects.toMatchObject({
      code: 11000
    });
    expect(await model.countDocuments()).toBe(2);
    expect(getSchemaDeprecatedMongoIndexes(MongoSystemInstanceConfig.schema)).toEqual([]);
  });
  it('removes only the deprecated legacy scope index via explicit cleanup and retains migration source records', async () => {
    const model = createModel({ schema: MongoSystemConfigs.schema, prefix: 'RuntimeScopeIndexes' });
    await model.collection.createIndex({ type: 1 });
    await model.collection.createIndex(
      { type: 1 },
      {
        name: 'runtime_scope_type_unique',
        unique: true,
        partialFilterExpression: { type: { $in: ['proEnv', 'subPlans', 'langfuse'] } }
      }
    );
    await model.create({ type: 'subPlans', value: { extraDatasetSize: { price: 4 } } });
    // Schema itself no longer holds deprecated tombstones; startup sync is additive-only
    expect(getSchemaDeprecatedMongoIndexes(MongoSystemConfigs.schema)).toEqual([]);
    await MongoIndexManager.syncModelIndexes({ model, logger });
    expect(await getIndexNames(model)).toContain('runtime_scope_type_unique');

    const cleanupRes = await runLegacyDeprecatedMongoIndexCleanup({
      entries: LEGACY_DEPRECATED_MONGO_INDEXES.filter((e) => e.collectionName === 'systemConfigs'),
      collectionOverrides: { systemConfigs: model.collection.collectionName }
    });
    expect(cleanupRes).toEqual([
      expect.objectContaining({ indexName: 'runtime_scope_type_unique', status: 'dropped' })
    ]);
    expect(await getIndexNames(model)).not.toContain('runtime_scope_type_unique');
    expect(await getIndexNames(model)).toContain('type_1');
    expect(await model.countDocuments()).toBe(1);
  });
});

describe('dataset synonym index declarations', () => {
  it('declares strict version uniqueness without legacy compatibility metadata', () => {
    const indexes = MongoDatasetSynonymMapping.schema.indexes();
    const normalizedTermIndex = indexes.find(
      ([key]) => 'normalizedStandardizedTerm' in key && 'fileVersion' in key
    );
    const logicalIdIndex = indexes.find(
      ([key]) => 'logicalMappingId' in key && 'fileVersion' in key
    );

    expect(normalizedTermIndex?.[1]).toMatchObject({ unique: true });
    expect(normalizedTermIndex?.[1].partialFilterExpression).toBeUndefined();
    expect(logicalIdIndex?.[1]).toMatchObject({ unique: true });
    expect(logicalIdIndex?.[1].partialFilterExpression).toBeUndefined();
    expect(getSchemaDeprecatedMongoIndexes(MongoDatasetSynonym.schema)).toEqual([]);
    expect(getSchemaDeprecatedMongoIndexes(MongoDatasetSynonymMapping.schema)).toEqual([]);
  });
});

describe('MongoIndexManager.syncModelIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates current indexes, removes declared legacy indexes, and preserves customer indexes', async () => {
    const schema = new Schema(
      {
        currentField: String,
        legacyField: String,
        customerField: String
      },
      { autoIndex: false }
    );
    defineIndex(schema, {
      key: { currentField: 1 },
      options: { name: 'current_field_1' }
    });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_custom_1' });

    const result = await MongoIndexManager.syncModelIndexes({ model, logger });

    const indexNames = await getIndexNames(model);
    expect(indexNames).toContain('current_field_1');
    expect(indexNames).toContain('customer_custom_1');
    expect(indexNames).not.toContain('legacy_field_1');
    expect(result.cleanupReport.items).toEqual([
      expect.objectContaining({
        action: 'drop',
        applied: true,
        collectionName: model.collection.collectionName,
        indexName: 'legacy_field_1'
      })
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Detected MongoDB indexes not declared by FastGPT schema',
      {
        collectionName: model.collection.collectionName,
        indexNames: expect.arrayContaining(['legacy_field_1', 'customer_custom_1'])
      }
    );
    expect(logger.info).toHaveBeenCalledWith('MongoDB indexes synchronized', {
      collectionName: model.collection.collectionName,
      created: 1,
      dropped: 1
    });
  });

  it('does not delete schema-external indexes when the Schema has no deprecated declarations', async () => {
    const schema = new Schema(
      { currentField: String, customerField: String },
      { autoIndex: false }
    );
    defineIndex(schema, {
      key: { currentField: 1 },
      options: { name: 'current_field_1' }
    });
    const model = createModel({ schema });
    await model.collection.createIndex({ currentField: 1 }, { name: 'current_field_1' });
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_custom_1' });

    const result = await MongoIndexManager.syncModelIndexes({ model, logger });

    expect(await getIndexNames(model)).toContain('customer_custom_1');
    expect(result.cleanupReport.items).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('replaces a full unique index with a named partial unique index on the same key', async () => {
    const schema = new Schema(
      { datasetId: String, fileVersion: Number, term: String },
      { autoIndex: false }
    );
    const key = { datasetId: 1, fileVersion: 1, term: 1 } as const;
    defineIndex(schema, {
      key,
      options: {
        name: 'version_term_unique_v2',
        unique: true,
        partialFilterExpression: {
          fileVersion: { $type: 'number' },
          term: { $type: 'string' }
        }
      }
    });
    defineIndex(schema, { key, options: { unique: true }, deprecated: true });
    const model = createModel({ schema });
    const legacyName = 'datasetId_1_fileVersion_1_term_1';
    await model.collection.createIndex(key, { name: legacyName, unique: true });

    await MongoIndexManager.syncModelIndexes({ model, logger });

    const indexNames = await getIndexNames(model);
    expect(indexNames).toContain('version_term_unique_v2');
    expect(indexNames).not.toContain(legacyName);
  });

  it('reuses an in-flight task for concurrent calls on the same Model', async () => {
    const schema = new Schema({ currentField: String }, { autoIndex: false });
    defineIndex(schema, {
      key: { currentField: 1 },
      options: { name: 'current_field_1' }
    });
    const model = createModel({ schema });
    const createIndexes = vi.spyOn(model, 'createIndexes');

    const [firstResult, secondResult] = await Promise.all([
      MongoIndexManager.syncModelIndexes({ model }),
      MongoIndexManager.syncModelIndexes({ model })
    ]);

    expect(firstResult).toBe(secondResult);
    expect(createIndexes).toHaveBeenCalledTimes(1);
  });

  it('does not clean deprecated indexes when creating current indexes fails', async () => {
    const schema = new Schema(
      { currentField: String, conflictingField: String, legacyField: String },
      { autoIndex: false }
    );
    defineIndex(schema, {
      key: { currentField: 1 },
      options: { name: 'current_field_1' }
    });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    await model.collection.createIndex({ conflictingField: 1 }, { name: 'current_field_1' });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    await expect(MongoIndexManager.syncModelIndexes({ model })).rejects.toThrow();

    expect(await getIndexNames(model)).toContain('legacy_field_1');
  });

  it('replaces the legacy global model unique index with the system-model partial index', async () => {
    const schema = new Schema({ model: String, scope: String }, { autoIndex: false });
    defineIndex(schema, {
      key: { scope: 1, model: 1 },
      options: {
        unique: true,
        partialFilterExpression: { scope: 'system' }
      }
    });
    defineIndex(schema, {
      key: { model: 1 },
      options: { unique: true },
      deprecated: true
    });
    const model = createModel({ schema, prefix: 'SystemModelIndex' });
    await model.collection.createIndex({ model: 1 }, { name: 'model_1', unique: true });

    await MongoIndexManager.syncModelIndexes({ model, logger });

    const indexes = await model.collection.indexes();
    expect(indexes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'model_1' })])
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'scope_1_model_1',
          key: { scope: 1, model: 1 },
          unique: true,
          partialFilterExpression: { scope: 'system' }
        })
      ])
    );
  });

  it('keeps legacy share and customer indexes while removing obsolete chat indexes via explicit cleanup', async () => {
    const schema = new Schema({}, { autoIndex: false });
    const [key, options] = MongoChat.schema.indexes().find(([key]) => 'publishSource.id' in key)!;
    defineIndex(schema, { key, options });
    const [legacyKey, legacyOptions] = MongoChat.schema
      .indexes()
      .find(([key]) => 'shareId' in key)!;
    defineIndex(schema, { key: legacyKey, options: legacyOptions });
    const [cursorLogKey, cursorLogOptions] = MongoChat.schema
      .indexes()
      .find(
        ([key]) => JSON.stringify(key) === JSON.stringify({ appId: 1, updateTime: -1, _id: -1 })
      )!;
    defineIndex(schema, { key: cursorLogKey, options: cursorLogOptions });
    expect(getSchemaDeprecatedMongoIndexes(MongoChat.schema)).toEqual([]);
    const model = createModel({ schema, prefix: 'ChatLeaseIndex' });
    await model.collection.createIndex(
      { shareId: 1, outLinkUid: 1, updateTime: -1 },
      { partialFilterExpression: { shareId: { $exists: true } } }
    );
    await model.collection.createIndex(
      { appId: 1, updateTime: -1 },
      { name: 'appId_1_updateTime_-1' }
    );
    await model.collection.createIndex(
      { chatGenerateStatus: 1, updateTime: 1 },
      {
        name: 'chatGenerateStatus_1_updateTime_1',
        partialFilterExpression: { chatGenerateStatus: 0 }
      }
    );
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_chat_index' });
    await model.collection.createIndex({ shareId: 1 }, { name: 'customer_share_index' });

    await MongoIndexManager.syncModelIndexes({ model, logger });
    const cleanupRes = await runLegacyDeprecatedMongoIndexCleanup({
      entries: LEGACY_DEPRECATED_MONGO_INDEXES.filter((e) => e.collectionName === 'chats'),
      collectionOverrides: { chats: model.collection.collectionName }
    });
    const indexNames = await getIndexNames(model);
    expect(indexNames).toContain('appId_1_updateTime_-1__id_-1');
    expect(indexNames).not.toContain('appId_1_updateTime_-1');
    expect(indexNames).not.toContain('chatGenerateStatus_1_updateTime_1');
    expect(indexNames).toContain('shareId_1_outLinkUid_1_updateTime_-1');
    expect(indexNames).toContain(
      'publishSource.type_1_publishSource.id_1_outLinkUid_1_updateTime_-1'
    );
    expect(indexNames).toContain('customer_chat_index');
    expect(indexNames).toContain('customer_share_index');
    expect(cleanupRes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'dropped',
          indexName: 'appId_1_updateTime_-1'
        }),
        expect.objectContaining({
          status: 'dropped',
          indexName: 'chatGenerateStatus_1_updateTime_1'
        })
      ])
    );
    expect(MongoChat.schema.path('shareId')).toBeDefined();
    expect(MongoChat.schema.indexes().some(([key]) => 'shareId' in key)).toBe(true);
    expect(MongoChat.schema.path('chatGenerateStatus')).toBeUndefined();
    expect(MongoChat.schema.indexes().some(([key]) => 'chatGenerateStatus' in key)).toBe(false);
    expect(
      MongoChat.schema
        .indexes()
        .some(([key]) => JSON.stringify(key) === JSON.stringify({ appId: 1, updateTime: -1 }))
    ).toBe(false);
  });

  it('replaces model status testedAt indexes with requestEndedAt indexes via explicit cleanup', async () => {
    const schema = new Schema({}, { autoIndex: false });
    defineIndex(schema, { key: { modelId: 1, requestEndedAt: -1 } });
    defineIndex(schema, {
      key: { requestEndedAt: 1 },
      options: { expireAfterSeconds: 30 * 24 * 60 * 60 }
    });
    expect(getSchemaDeprecatedMongoIndexes(MongoModelStatusProbeRecord.schema)).toEqual([]);
    const model = createModel({ schema, prefix: 'ModelStatusProbeIndex' });
    await model.collection.createIndex(
      { modelId: 1, testedAt: -1 },
      { name: 'modelId_1_testedAt_-1' }
    );
    await model.collection.createIndex(
      { testedAt: 1 },
      { name: 'testedAt_1', expireAfterSeconds: 30 * 24 * 60 * 60 }
    );

    await MongoIndexManager.syncModelIndexes({ model, logger });
    await runLegacyDeprecatedMongoIndexCleanup({
      entries: LEGACY_DEPRECATED_MONGO_INDEXES.filter(
        (e) => e.collectionName === 'model_status_probe_records'
      ),
      collectionOverrides: { model_status_probe_records: model.collection.collectionName }
    });

    const indexes = await model.collection.indexes();
    expect(indexes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['modelId_1_requestEndedAt_-1', 'requestEndedAt_1', '_id_'])
    );
    expect(indexes.map(({ name }) => name)).not.toEqual(
      expect.arrayContaining(['modelId_1_testedAt_-1', 'testedAt_1'])
    );
  });
});

describe('MongoIndexManager.cleanupModelDeprecatedIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supports dry-run without deleting a matched index', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [
      {
        ...legacyDefinition,
        options: { unique: true }
      }
    ]);
    const model = createModel({ schema });
    await model.collection.createIndex(
      { legacyField: 1 },
      { name: 'legacy_field_1', unique: true }
    );

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: false,
      logger
    });

    expect(report.items).toEqual([
      expect.objectContaining({ action: 'drop', applied: false, indexName: 'legacy_field_1' })
    ]);
    expect(await getIndexNames(model)).toContain('legacy_field_1');
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('preserves same-name indexes when key or key order does not match', async () => {
    const schema = new Schema(
      { customerField: String, legacyField: String, otherField: String },
      { autoIndex: false }
    );
    defineDeprecatedTestIndexes(schema, [
      legacyDefinition,
      {
        indexName: 'legacy_compound_1',
        key: { legacyField: 1, otherField: 1 }
      }
    ]);
    const model = createModel({ schema });
    await model.collection.createIndex({ customerField: 1 }, { name: 'legacy_field_1' });
    await model.collection.createIndex(
      { otherField: 1, legacyField: 1 },
      { name: 'legacy_compound_1' }
    );

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true,
      logger
    });

    expect(report.items).toEqual([
      expect.objectContaining({ action: 'skip_mismatch', indexName: 'legacy_field_1' }),
      expect.objectContaining({ action: 'skip_mismatch', indexName: 'legacy_compound_1' })
    ]);
    expect(await getIndexNames(model)).toEqual(
      expect.objectContaining(new Set(['_id_', 'legacy_field_1', 'legacy_compound_1']))
    );
  });

  it('drops a deprecated index even when options differ, as long as key matches', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [
      {
        ...legacyDefinition,
        options: { unique: true }
      }
    ]);
    const model = createModel({ schema });
    // 同名同 key 但 option 不同：只按 key 匹配，仍允许删除
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true,
      logger
    });

    expect(report.items).toEqual([
      expect.objectContaining({ action: 'drop', applied: true, indexName: 'legacy_field_1' })
    ]);
    expect(await getIndexNames(model)).not.toContain('legacy_field_1');
  });

  it('matches MongoDB text indexes via weights instead of the stored _fts key', async () => {
    const schema = new Schema(
      { title: String, body: String, otherField: String },
      { autoIndex: false }
    );
    defineDeprecatedTestIndexes(schema, [
      {
        indexName: 'title_text_body_text',
        key: { title: 'text', body: 'text' }
      }
    ]);
    const model = createModel({ schema });
    await model.collection.createIndex(
      { title: 'text', body: 'text' },
      { name: 'title_text_body_text' }
    );

    const indexes = (await model.collection.indexes()) as Array<Record<string, unknown>>;
    const textIndex = indexes.find((index) => index.name === 'title_text_body_text');
    expect(textIndex?.key).toEqual({ _fts: 'text', _ftsx: 1 });
    expect(textIndex?.weights).toEqual({ title: 1, body: 1 });

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true,
      logger
    });

    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'drop',
        applied: true,
        indexName: 'title_text_body_text'
      })
    ]);
    expect(await getIndexNames(model)).not.toContain('title_text_body_text');
  });

  it('skips text indexes when declared text fields do not match weights', async () => {
    const schema = new Schema({ title: String, body: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [
      {
        indexName: 'title_text',
        key: { title: 'text' }
      }
    ]);
    const model = createModel({ schema });
    await model.collection.createIndex({ body: 'text' }, { name: 'title_text' });

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true,
      logger
    });

    expect(report.items).toEqual([
      expect.objectContaining({ action: 'skip_mismatch', indexName: 'title_text' })
    ]);
    expect(await getIndexNames(model)).toContain('title_text');
  });

  it('reports a missing deprecated index and formats its report', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true
    });

    expect(report.items).toEqual([
      expect.objectContaining({ action: 'skip_missing', indexName: 'legacy_field_1' })
    ]);
    expect(MongoIndexManager.summarizeCleanupReport(report)).toEqual({
      total: 1,
      dropped: 0,
      droppable: 0,
      skippedMissing: 1,
      skippedMismatch: 0,
      errors: 0
    });
    expect(MongoIndexManager.formatCleanupReport(report)).toContain(
      `${model.collection.collectionName}.legacy_field_1 reason=Deprecated index does not exist`
    );
  });

  it('treats a concurrent IndexNotFound response as an idempotent skip', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    vi.spyOn(model.collection, 'dropIndex').mockRejectedValueOnce({
      codeName: 'IndexNotFound'
    });

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true
    });

    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'skip_missing',
        reason: 'Deprecated index was already removed'
      })
    ]);
  });

  it('recognizes the numeric MongoDB IndexNotFound code', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    vi.spyOn(model.collection, 'dropIndex').mockRejectedValueOnce({ code: 27 });

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true
    });

    expect(report.items[0]).toMatchObject({
      action: 'skip_missing',
      reason: 'Deprecated index was already removed'
    });
  });

  it('captures unexpected inspection errors in the cleanup report', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    vi.spyOn(model.collection, 'indexes').mockRejectedValueOnce(new Error('inspection failed'));

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true,
      logger
    });

    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'error',
        error: 'inspection failed',
        indexName: 'legacy_field_1'
      })
    ]);
    expect(logger.error).toHaveBeenCalledWith('Failed to cleanup deprecated MongoDB index', {
      collectionName: model.collection.collectionName,
      indexName: 'legacy_field_1',
      error: 'inspection failed'
    });
  });

  it('normalizes non-Error cleanup failures into report messages', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    vi.spyOn(model.collection, 'dropIndex').mockRejectedValueOnce('drop failed');

    const report = await MongoIndexManager.cleanupModelDeprecatedIndexes({
      model,
      apply: true
    });

    expect(report.items[0]).toMatchObject({ action: 'error', error: 'drop failed' });
  });

  it('summarizes every cleanup action and formats error details', () => {
    const report = {
      apply: true,
      items: [
        {
          collectionName: 'test_collection',
          indexName: 'legacy_drop_1',
          action: 'drop' as const,
          applied: false,
          reason: 'Can drop',
          error: 'test error'
        },
        {
          collectionName: 'test_collection',
          indexName: 'legacy_mismatch_1',
          action: 'skip_mismatch' as const,
          applied: false,
          reason: 'Mismatch'
        },
        {
          collectionName: 'test_collection',
          indexName: 'legacy_error_1',
          action: 'error' as const,
          applied: false,
          reason: 'Error'
        }
      ]
    };

    expect(MongoIndexManager.summarizeCleanupReport(report)).toEqual({
      total: 3,
      dropped: 0,
      droppable: 1,
      skippedMissing: 0,
      skippedMismatch: 1,
      errors: 1
    });
    expect(MongoIndexManager.formatCleanupReport(report)).toContain('error=test error');
  });
});

describe('dataset collection index consolidation', () => {
  it('replaces three managed indexes via explicit cleanup without growing the index count or breaking legacy hints', async () => {
    const schema = new Schema({}, { autoIndex: false });
    MongoDatasetCollection.schema.indexes().forEach(([key, options]) => {
      defineIndex(schema, { key, options });
    });
    expect(getSchemaDeprecatedMongoIndexes(MongoDatasetCollection.schema)).toEqual([]);
    const model = createModel({ schema, prefix: 'CollectionConsolidatedIndex' });
    await model.collection.createIndex({
      teamId: 1,
      datasetId: 1,
      parentId: 1,
      inheritPermission: 1
    });
    await model.collection.createIndex({ teamId: 1, datasetId: 1, tags: 1 });
    await model.collection.createIndex({ teamId: 1, 'metadata.relatedImgId': 1 });
    await model.collection.createIndex({ fileId: 1 }, { name: 'customer_file_lookup' });

    await MongoIndexManager.syncModelIndexes({ model, logger });
    const cleanupRes = await runLegacyDeprecatedMongoIndexCleanup({
      entries: LEGACY_DEPRECATED_MONGO_INDEXES.filter(
        (e) => e.collectionName === 'dataset_collections'
      ),
      collectionOverrides: { dataset_collections: model.collection.collectionName }
    });
    const names = await getIndexNames(model);
    expect(names.size).toBe(10); // 9 条内置索引（含 _id）及 1 条客户索引。
    expect(names).toContain('teamId_1_fileId_1');
    expect(names).toContain('teamId_1_datasetId_1_tags.tagId_1');
    expect(names).toContain('teamId_1_datasetId_1_tags.tagId_1_tags.value_1');
    expect(names).toContain('teamId_1_datasetId_1_type_1_parentId_1_inheritPermission_1__id_1');
    expect(names).toContain('teamId_1_datasetId_1_forbid_1__id_1');
    expect(names).toContain('customer_file_lookup');
    expect(cleanupRes.filter(({ status }) => status === 'dropped')).toHaveLength(3);
    expect(names).not.toContain('teamId_1_datasetId_1_tags_1');
    expect(names).not.toContain('teamId_1_metadata.relatedImgId_1');
    expect(names).not.toContain('teamId_1_datasetId_1_parentId_1_inheritPermission_1');
  });
});

describe('dataset training TTL index migration', () => {
  it('keeps the existing training TTL index unchanged', () => {
    const ttlIndex = MongoDatasetTraining.schema.indexes().find(([key]) => 'expireAt' in key);

    expect(ttlIndex).toEqual([
      { expireAt: 1 },
      expect.objectContaining({
        expireAfterSeconds: 7 * 24 * 60 * 60
      })
    ]);
    expect(getSchemaDeprecatedMongoIndexes(MongoDatasetTraining.schema)).toEqual([]);
  });
});

describe('dataset rebuild status index migration', () => {
  it('drops the old rebuilding index via explicit cleanup and retains the replacement and customer indexes', async () => {
    const schema = new Schema(
      { rebuilding: Boolean, indexStatus: String, teamId: String, datasetId: String },
      { autoIndex: false }
    );
    defineIndex(schema, { key: { indexStatus: 1, teamId: 1, datasetId: 1 } });
    expect(getSchemaDeprecatedMongoIndexes(MongoDatasetData.schema)).toEqual([]);
    const model = createModel({ schema, prefix: 'DatasetRebuildIndex' });
    await model.collection.createIndex({ rebuilding: 1, teamId: 1, datasetId: 1 });
    await model.collection.createIndex({ rebuilding: 1 }, { name: 'customer_rebuild_status' });
    await MongoIndexManager.syncModelIndexes({ model, logger });
    await runLegacyDeprecatedMongoIndexCleanup({
      entries: LEGACY_DEPRECATED_MONGO_INDEXES.filter((e) => e.collectionName === 'dataset_datas'),
      collectionOverrides: { dataset_datas: model.collection.collectionName }
    });
    const names = await getIndexNames(model);
    expect(names.has('rebuilding_1_teamId_1_datasetId_1')).toBe(false);
    expect(names.has('indexStatus_1_teamId_1_datasetId_1')).toBe(true);
    expect(names.has('customer_rebuild_status')).toBe(true);
  });
});

describe('sandbox quota index migration', () => {
  it('removes the old source quota index via explicit cleanup and retains current and customer indexes', async () => {
    const schema = new Schema({}, { autoIndex: false });
    MongoSandboxInstance.schema.indexes().forEach(([key, options]) => {
      defineIndex(schema, { key, options });
    });
    expect(getSchemaDeprecatedMongoIndexes(MongoSandboxInstance.schema)).toEqual([]);
    const model = createModel({ schema, prefix: 'SandboxQuotaIndex' });
    await model.collection.createIndex({ sourceType: 1, status: 1, provider: 1 });
    await model.collection.createIndex({ sourceType: 1 }, { name: 'customer_sandbox_source' });

    await MongoIndexManager.syncModelIndexes({ model, logger });
    await runLegacyDeprecatedMongoIndexCleanup({
      entries: LEGACY_DEPRECATED_MONGO_INDEXES.filter(
        (e) => e.collectionName === 'agent_sandbox_instances_v2'
      ),
      collectionOverrides: { agent_sandbox_instances_v2: model.collection.collectionName }
    });

    const names = await getIndexNames(model);
    expect(names).not.toContain('sourceType_1_status_1_provider_1');
    expect(names).toContain('teamId_1_status_1');
    expect(names).toContain('status_1_lastActiveAt_1');
    expect(names).toContain('sourceType_1_sourceId_1_userId_1');
    expect(names).toContain('customer_sandbox_source');
    expect(LEGACY_DEPRECATED_MONGO_INDEXES).toHaveLength(18);
  });
});

describe('legacy deprecated index explicit option signature protection', () => {
  it('declares explicit options on every LEGACY_DEPRECATED_MONGO_INDEXES entry and refuses to drop customer-customized same-name same-key indexes', async () => {
    expect(LEGACY_DEPRECATED_MONGO_INDEXES).toHaveLength(18);
    for (const entry of LEGACY_DEPRECATED_MONGO_INDEXES) {
      expect(entry.options).toBeDefined();
      expect(typeof entry.options).toBe('object');
    }

    const userIdEntry = LEGACY_DEPRECATED_MONGO_INDEXES.find(
      (entry) => entry.indexName === 'userId_1'
    );
    expect(userIdEntry).toBeDefined();
    expect(userIdEntry?.options).toEqual({});

    const chatCursorEntry = LEGACY_DEPRECATED_MONGO_INDEXES.find(
      (entry) => entry.collectionName === 'chats' && entry.indexName === 'appId_1_updateTime_-1'
    );
    expect(chatCursorEntry).toBeDefined();
    expect(chatCursorEntry?.options).toEqual({});

    const customerVariants: Array<{
      label: string;
      createOptions: Record<string, unknown>;
    }> = [
      {
        label: 'partial unique index',
        createOptions: {
          name: 'userId_1',
          unique: true,
          partialFilterExpression: { status: 'active' }
        }
      },
      {
        label: 'partial non-unique index',
        createOptions: {
          name: 'userId_1',
          partialFilterExpression: { status: 'active' }
        }
      },
      {
        label: 'TTL index',
        createOptions: {
          name: 'userId_1',
          expireAfterSeconds: 3600
        }
      },
      {
        label: 'collation index',
        createOptions: {
          name: 'userId_1',
          collation: { locale: 'en', strength: 2 }
        }
      }
    ];

    for (const variant of customerVariants) {
      const schema = new Schema({ userId: String, status: String }, { autoIndex: false });
      const model = createModel({ schema, prefix: 'LegacyOptProtect' });
      await model.collection.createIndex({ userId: 1 }, variant.createOptions as any);

      const results = await runLegacyDeprecatedMongoIndexCleanup({
        entries: [userIdEntry!],
        collectionOverrides: { [userIdEntry!.collectionName]: model.collection.collectionName }
      });

      expect(results, `expected skipped_mismatch for ${variant.label}`).toEqual([
        expect.objectContaining({
          indexName: 'userId_1',
          status: 'skipped_mismatch'
        })
      ]);
      expect(await getIndexNames(model)).toContain('userId_1');
    }
  });
});

describe('Step 0 Mongo index safety fixes', () => {
  it('respects MONGO_DEPRECATE_INDEX=false by creating missing indexes without dropping deprecated ones', async () => {
    const schema = new Schema({ currentField: String, legacyField: String }, { autoIndex: false });
    defineIndex(schema, { key: { currentField: 1 }, options: { name: 'current_field_1' } });
    defineDeprecatedTestIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema, prefix: 'DeprecateGate' });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    const prev = process.env.MONGO_DEPRECATE_INDEX;
    process.env.MONGO_DEPRECATE_INDEX = 'false';
    try {
      const result = await MongoIndexManager.syncModelIndexes({ model, logger });
      const names = await getIndexNames(model);

      expect(names).toContain('current_field_1');
      expect(names).toContain('legacy_field_1');
      expect(result.cleanupReport.apply).toBe(false);
      expect(result.cleanupReport.items).toEqual([
        expect.objectContaining({
          action: 'drop',
          applied: false,
          indexName: 'legacy_field_1'
        })
      ]);
    } finally {
      if (prev === undefined) {
        delete process.env.MONGO_DEPRECATE_INDEX;
      } else {
        process.env.MONGO_DEPRECATE_INDEX = prev;
      }
    }
  });

  it('matches compound text indexes including non-text prefix fields and rejects mismatched prefixes', async () => {
    const matchingSchema = new Schema(
      { teamId: String, name: String, description: String },
      { autoIndex: false }
    );
    defineIndex(matchingSchema, {
      key: { teamId: 1, name: 'text', description: 'text' },
      options: { name: 'compound_text_legacy' },
      deprecated: true
    });
    const matchingModel = createModel({ schema: matchingSchema, prefix: 'CompoundTextMatch' });
    await matchingModel.collection.createIndex(
      { teamId: 1, name: 'text', description: 'text' },
      { name: 'compound_text_legacy' }
    );

    const matchResult = await MongoIndexManager.syncModelIndexes({ model: matchingModel, logger });
    expect(await getIndexNames(matchingModel)).not.toContain('compound_text_legacy');
    expect(matchResult.cleanupReport.items).toEqual([
      expect.objectContaining({ action: 'drop', applied: true, indexName: 'compound_text_legacy' })
    ]);

    // 前导列从 teamId 换成 otherId（同名同 text 权重但前导列不同），必须按 skip_mismatch 保留，绝不误删。
    const mismatchedSchema = new Schema(
      { teamId: String, otherId: String, name: String, description: String },
      { autoIndex: false }
    );
    defineIndex(mismatchedSchema, {
      key: { teamId: 1, name: 'text', description: 'text' },
      options: { name: 'compound_text_mismatch' },
      deprecated: true
    });
    const mismatchedModel = createModel({
      schema: mismatchedSchema,
      prefix: 'CompoundTextMismatch'
    });
    await mismatchedModel.collection.createIndex(
      { otherId: 1, name: 'text', description: 'text' },
      { name: 'compound_text_mismatch' }
    );

    const mismatchResult = await MongoIndexManager.syncModelIndexes({
      model: mismatchedModel,
      logger
    });
    expect(await getIndexNames(mismatchedModel)).toContain('compound_text_mismatch');
    expect(mismatchResult.cleanupReport.items).toEqual([
      expect.objectContaining({
        action: 'skip_mismatch',
        applied: false,
        indexName: 'compound_text_mismatch'
      })
    ]);
  });

  it('opens an isolated DDL connection with autoIndex disabled and socketTimeoutMS=0 and closes it after execution', async () => {
    const uri = process.env.MONGODB_URI;
    expect(uri).toBeTruthy();

    let capturedAutoIndex: unknown;
    let capturedReadyStateInside: number | undefined;
    let capturedDdlDb: { connection: { readyState: number } } | undefined;

    await withMongoDdlConnection({
      url: uri!,
      execute: async (ddlDb) => {
        capturedAutoIndex = ddlDb.get('autoIndex');
        capturedReadyStateInside = ddlDb.connection.readyState;
        capturedDdlDb = ddlDb;
      }
    });

    expect(capturedAutoIndex).toBe(false);
    expect(capturedReadyStateInside).toBe(1);
    expect(capturedDdlDb?.connection.readyState).toBe(0);
  });
});
