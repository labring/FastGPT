import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, Schema } from '@fastgpt/service/common/mongo';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';
import type { DeprecatedMongoIndexDefinition } from '@fastgpt/service/common/mongo/deprecatedIndexes';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

const getIndexNames = async (collectionName: string) => {
  const indexes = await connectionMongo.connection.db?.collection(collectionName).indexes();
  return new Set(indexes?.map((index: { name?: string }) => index.name));
};

const getCleanupCollectionName = () => `mongo_index_cleanup_${randomUUID().replace(/-/g, '')}`;

const dropCollection = async (collectionName: string) => {
  try {
    await connectionMongo.connection.db?.collection(collectionName).drop();
  } catch (error: any) {
    if (error?.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }
};

const getDb = () => {
  const db = connectionMongo.connection.db;
  if (!db) {
    throw new Error('Mongo test db is not connected');
  }
  return db;
};

describe('MongoIndexManager.runModelIndexMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates missing schema indexes without deleting customer indexes in create mode', async () => {
    const collectionName = `mongo_index_create_${Date.now()}`;
    await dropCollection(collectionName);

    const schema = new Schema(
      {
        name: String,
        customerField: String
      },
      { autoIndex: false }
    );
    schema.index({ name: 1 }, { name: 'schema_name_1' });

    const model = connectionMongo.model(`MongoIndexCreate${Date.now()}`, schema, collectionName);
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_custom_1' });

    await MongoIndexManager.runModelIndexMode({
      model,
      mode: 'create',
      logger
    });

    const indexNames = await getIndexNames(collectionName);
    expect(indexNames.has('schema_name_1')).toBe(true);
    expect(indexNames.has('customer_custom_1')).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      'MongoDB schema indexes ensured',
      expect.objectContaining({
        mode: 'create',
        collectionName,
        toCreateCount: expect.any(Number),
        schemaExternalIndexCount: expect.any(Number)
      })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'MongoDB schema index ensure detail',
      expect.objectContaining({
        mode: 'create',
        collectionName,
        schemaExternalIndexNames: expect.arrayContaining(['customer_custom_1']),
        toCreate: expect.any(Array)
      })
    );
  });

  it('does not create or delete indexes in dryRun mode', async () => {
    const collectionName = `mongo_index_dry_run_${Date.now()}`;
    await dropCollection(collectionName);

    const schema = new Schema(
      {
        name: String,
        customerField: String
      },
      { autoIndex: false }
    );
    schema.index({ name: 1 }, { name: 'schema_name_1' });

    const model = connectionMongo.model(`MongoIndexDryRun${Date.now()}`, schema, collectionName);
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_custom_1' });

    const result = await MongoIndexManager.runModelIndexMode({
      model,
      mode: 'dryRun',
      logger
    });

    const indexNames = await getIndexNames(collectionName);
    expect(result.toCreate.length).toBeGreaterThan(0);
    expect(indexNames.has('schema_name_1')).toBe(false);
    expect(indexNames.has('customer_custom_1')).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      'MongoDB index dry-run completed',
      expect.objectContaining({
        mode: 'dryRun',
        collectionName,
        toCreateCount: result.toCreate.length,
        schemaExternalIndexCount: expect.any(Number)
      })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'MongoDB index diff inspected',
      expect.objectContaining({
        mode: 'dryRun',
        collectionName,
        schemaExternalIndexNames: expect.arrayContaining(['customer_custom_1']),
        toCreate: result.toCreate
      })
    );
  });

  it('creates schema indexes without deleting indexes in per-model sync mode', async () => {
    const collectionName = `mongo_index_sync_${Date.now()}`;
    await dropCollection(collectionName);

    const schema = new Schema(
      {
        name: String,
        customerField: String,
        legacyField: String
      },
      { autoIndex: false }
    );
    schema.index({ name: 1 }, { name: 'schema_name_1' });

    const model = connectionMongo.model(`MongoIndexSync${Date.now()}`, schema, collectionName);
    await model.collection.createIndex({ customerField: 1 }, { name: 'customer_custom_1' });
    await model.collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    const result = await MongoIndexManager.runModelIndexMode({
      model,
      mode: 'sync',
      logger
    });

    const indexNames = await getIndexNames(collectionName);
    expect(result.toDrop).toContain('customer_custom_1');
    expect(result.toDrop).toContain('legacy_field_1');
    expect(indexNames.has('schema_name_1')).toBe(true);
    expect(indexNames.has('customer_custom_1')).toBe(true);
    expect(indexNames.has('legacy_field_1')).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      'MongoDB managed index sync started',
      expect.objectContaining({
        mode: 'sync',
        collectionName,
        cleanupPolicy: 'deprecated_indexes_are_cleaned_once_per_connection'
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      'MongoDB managed index sync completed',
      expect.objectContaining({
        mode: 'sync',
        collectionName,
        cleanupPolicy: 'deprecated_indexes_are_cleaned_once_per_connection'
      })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'MongoDB managed index sync detail',
      expect.objectContaining({
        mode: 'sync',
        collectionName,
        schemaExternalIndexNames: expect.arrayContaining(['customer_custom_1', 'legacy_field_1']),
        toCreate: expect.any(Array),
        cleanupPolicy: 'deprecated_indexes_are_cleaned_once_per_connection'
      })
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Detected MongoDB indexes not declared by FastGPT schema',
      expect.objectContaining({
        mode: 'sync',
        collectionName,
        schemaExternalIndexNames: expect.arrayContaining(['customer_custom_1', 'legacy_field_1']),
        cleanupPolicy: 'only_registered_deprecated_indexes_can_be_dropped'
      })
    );
  });
});

describe('MongoIndexManager.cleanupDeprecatedIndexes', () => {
  it('runs deprecated index cleanup only once for the same connection key', async () => {
    vi.clearAllMocks();
    const collectionName = getCleanupCollectionName();
    const cleanupKey = `test:${randomUUID()}`;
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_field_1',
        key: { legacyField: 1 },
        deprecatedVersion: '4.15.0',
        reason: 'test legacy index'
      }
    ];

    const firstReport = await MongoIndexManager.runDeprecatedIndexCleanupOnce({
      db: getDb(),
      cleanupKey,
      apply: true,
      indexes,
      logger
    });
    await collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    const secondReport = await MongoIndexManager.runDeprecatedIndexCleanupOnce({
      db: getDb(),
      cleanupKey,
      apply: true,
      indexes,
      logger
    });

    const indexNames = await getIndexNames(collectionName);
    expect(firstReport).toBe(secondReport);
    expect(indexNames.has('legacy_field_1')).toBe(true);
    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(
      'MongoDB deprecated index cleanup skipped',
      expect.objectContaining({
        cleanupKey,
        reason: 'already_started_or_completed'
      })
    );
  });

  it('dry-runs matched deprecated indexes without deleting them', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_field_1',
        key: { legacyField: 1 },
        deprecatedVersion: '4.15.0',
        reason: 'test legacy index'
      }
    ];

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: false,
      indexes
    });

    const indexNames = await getIndexNames(collectionName);
    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'drop',
        applied: false,
        collectionName,
        indexName: 'legacy_field_1'
      })
    ]);
    expect(indexNames.has('legacy_field_1')).toBe(true);
  });

  it('drops only matched deprecated indexes when apply is enabled', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    await collection.createIndex({ currentField: 1 }, { name: 'current_field_1' });

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_field_1',
        key: { legacyField: 1 },
        deprecatedVersion: '4.15.0',
        replacementIndexNames: ['current_field_1'],
        reason: 'test legacy index'
      }
    ];

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: true,
      indexes
    });

    const indexNames = await getIndexNames(collectionName);
    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'drop',
        applied: true,
        collectionName,
        indexName: 'legacy_field_1'
      })
    ]);
    expect(indexNames.has('legacy_field_1')).toBe(false);
    expect(indexNames.has('current_field_1')).toBe(true);
  });

  it('skips same-name indexes when key or options do not match registry', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex({ customerField: 1 }, { name: 'legacy_field_1' });

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_field_1',
        key: { legacyField: 1 },
        options: { unique: true },
        deprecatedVersion: '4.15.0',
        reason: 'test legacy index'
      }
    ];

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: true,
      indexes
    });

    const indexNames = await getIndexNames(collectionName);
    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'skip_mismatch',
        applied: false,
        collectionName,
        indexName: 'legacy_field_1'
      })
    ]);
    expect(indexNames.has('legacy_field_1')).toBe(true);
  });

  it('skips same-name compound indexes when key order does not match registry', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex(
      { customerField: 1, legacyField: 1 },
      { name: 'legacy_compound_1' }
    );

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_compound_1',
        key: { legacyField: 1, customerField: 1 },
        deprecatedVersion: '4.15.0',
        reason: 'test legacy index'
      }
    ];

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: true,
      indexes
    });

    const indexNames = await getIndexNames(collectionName);
    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'skip_mismatch',
        applied: false,
        collectionName,
        indexName: 'legacy_compound_1'
      })
    ]);
    expect(indexNames.has('legacy_compound_1')).toBe(true);
  });

  it('skips cleanup when replacement index is required but missing', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_field_1',
        key: { legacyField: 1 },
        deprecatedVersion: '4.15.0',
        replacementIndexNames: ['current_field_1'],
        reason: 'test legacy index'
      }
    ];

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: true,
      indexes
    });

    const indexNames = await getIndexNames(collectionName);
    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'skip_missing_replacement',
        applied: false,
        collectionName,
        indexName: 'legacy_field_1'
      })
    ]);
    expect(indexNames.has('legacy_field_1')).toBe(true);
  });

  it('skips cleanup until every replacement index exists', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);
    const collection = getDb().collection(collectionName);
    await collection.createIndex({ legacyField: 1 }, { name: 'legacy_field_1' });
    await collection.createIndex({ currentField: 1 }, { name: 'current_field_1' });

    const indexes: DeprecatedMongoIndexDefinition[] = [
      {
        collectionName,
        indexName: 'legacy_field_1',
        key: { legacyField: 1 },
        deprecatedVersion: '4.15.0',
        replacementIndexNames: ['current_field_1', 'current_field_2'],
        reason: 'test legacy index'
      }
    ];

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: true,
      indexes
    });

    const indexNames = await getIndexNames(collectionName);
    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'skip_missing_replacement',
        applied: false,
        collectionName,
        indexName: 'legacy_field_1',
        missingReplacementIndexNames: ['current_field_2']
      })
    ]);
    expect(indexNames.has('legacy_field_1')).toBe(true);
  });

  it('reports missing deprecated indexes and formats the report', async () => {
    const collectionName = getCleanupCollectionName();
    await dropCollection(collectionName);

    const report = await MongoIndexManager.cleanupDeprecatedIndexes({
      db: getDb(),
      apply: false,
      indexes: [
        {
          collectionName,
          indexName: 'missing_1',
          key: { missing: 1 },
          deprecatedVersion: '4.15.0',
          reason: 'test missing index'
        }
      ]
    });

    expect(report.items).toEqual([
      expect.objectContaining({
        action: 'skip_missing',
        collectionName,
        indexName: 'missing_1'
      })
    ]);
    expect(MongoIndexManager.summarizeCleanupReport(report)).toEqual({
      total: 1,
      dropped: 0,
      droppable: 0,
      skippedMissing: 1,
      skippedMismatch: 0,
      skippedMissingReplacement: 0,
      errors: 0
    });
    expect(MongoIndexManager.formatCleanupReport(report)).toContain(
      `${collectionName}.missing_1 version=4.15.0`
    );
  });
});
