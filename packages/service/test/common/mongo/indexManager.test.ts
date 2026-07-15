import { beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionMongo, Schema } from '@fastgpt/service/common/mongo';
import { runMongoIndexSyncForModel } from '@fastgpt/service/common/mongo/indexManager';

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

const dropCollection = async (collectionName: string) => {
  try {
    await connectionMongo.connection.db?.collection(collectionName).drop();
  } catch (error: any) {
    if (error?.codeName !== 'NamespaceNotFound') {
      throw error;
    }
  }
};

describe('runMongoIndexSyncForModel', () => {
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

    await runMongoIndexSyncForModel({
      model,
      mode: 'create',
      logger
    });

    const indexNames = await getIndexNames(collectionName);
    expect(indexNames.has('schema_name_1')).toBe(true);
    expect(indexNames.has('customer_custom_1')).toBe(true);
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

    const result = await runMongoIndexSyncForModel({
      model,
      mode: 'dryRun',
      logger
    });

    const indexNames = await getIndexNames(collectionName);
    expect(result.toCreate.length).toBeGreaterThan(0);
    expect(indexNames.has('schema_name_1')).toBe(false);
    expect(indexNames.has('customer_custom_1')).toBe(true);
  });
});
