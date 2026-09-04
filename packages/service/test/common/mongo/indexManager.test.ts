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
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';

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

describe('dataset training TTL index migration', () => {
  it('excludes synonym rebuild tasks from TTL and removes the obsolete index', () => {
    const ttlIndex = MongoDatasetTraining.schema
      .indexes()
      .find(
        ([key, options]) =>
          'expireAt' in key &&
          options.partialFilterExpression?.synonymVersion !== undefined &&
          !options.deprecated
      );

    expect(ttlIndex).toEqual([
      { expireAt: 1 },
      expect.objectContaining({
        name: 'expireAt_1_non_synonym_rebuild',
        expireAfterSeconds: 7 * 24 * 60 * 60,
        partialFilterExpression: { synonymVersion: null }
      })
    ]);
    expect(getSchemaDeprecatedMongoIndexes(MongoDatasetTraining.schema)).toContainEqual({
      indexName: 'expireAt_1',
      key: { expireAt: 1 },
      options: expect.objectContaining({
        expireAfterSeconds: 7 * 24 * 60 * 60
      })
    });
  });
});
