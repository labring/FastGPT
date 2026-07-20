import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, defineDeprecatedIndexes, Schema } from '@fastgpt/service/common/mongo';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';

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

const legacyDefinition = {
  indexName: 'legacy_field_1',
  key: { legacyField: 1 }
} as const;

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
    schema.index({ currentField: 1 }, { name: 'current_field_1' });
    defineDeprecatedIndexes(schema, [legacyDefinition]);
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
    schema.index({ currentField: 1 }, { name: 'current_field_1' });
    const model = createModel({ schema });
    await model.collection.createIndex({ currentField: 1 }, { name: 'current_field_1' });
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_custom_1' });

    const result = await MongoIndexManager.syncModelIndexes({ model, logger });

    expect(await getIndexNames(model)).toContain('customer_custom_1');
    expect(result.cleanupReport.items).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('reuses an in-flight task for concurrent calls on the same Model', async () => {
    const schema = new Schema({ currentField: String }, { autoIndex: false });
    schema.index({ currentField: 1 }, { name: 'current_field_1' });
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
    schema.index({ currentField: 1 }, { name: 'current_field_1' });
    defineDeprecatedIndexes(schema, [legacyDefinition]);
    const model = createModel({ schema });
    await model.collection.createIndex({ conflictingField: 1 }, { name: 'current_field_1' });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    await expect(MongoIndexManager.syncModelIndexes({ model })).rejects.toThrow();

    expect(await getIndexNames(model)).toContain('legacy_field_1');
  });
});

describe('MongoIndexManager.cleanupModelDeprecatedIndexes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('supports dry-run without deleting a matched index', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedIndexes(schema, [
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

  it('preserves same-name indexes when key, key order, or options do not match', async () => {
    const schema = new Schema(
      { customerField: String, legacyField: String, otherField: String },
      { autoIndex: false }
    );
    defineDeprecatedIndexes(schema, [
      {
        ...legacyDefinition,
        options: { unique: true }
      },
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

  it('reports a missing deprecated index and formats its report', async () => {
    const schema = new Schema({ legacyField: String }, { autoIndex: false });
    defineDeprecatedIndexes(schema, [legacyDefinition]);
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
    defineDeprecatedIndexes(schema, [legacyDefinition]);
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
    defineDeprecatedIndexes(schema, [legacyDefinition]);
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
    defineDeprecatedIndexes(schema, [legacyDefinition]);
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
    defineDeprecatedIndexes(schema, [legacyDefinition]);
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
