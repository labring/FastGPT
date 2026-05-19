import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { getLogger } from '@fastgpt/service/common/logger';

const logger = getLogger(['initv4150']);

export type Initv4150Response = {
  message: string;
  indexMigration: {
    modelUniqueIndexDropped: boolean;
    newIndexesCreated: string[];
  };
  dataMigration: {
    total: number;
    isSharedSet: number;
  };
};

/**
 * Drop the unique index on `model` field (from old schema),
 * so multiple custom models can share the same OpenAI model name.
 */
async function dropModelUniqueIndex(): Promise<boolean> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping index drop');
    return false;
  }

  try {
    const indexes = await db.collection('system_models').listIndexes().toArray();
    const uniqueModelIndex = indexes.find(
      (idx: { key?: Record<string, unknown>; unique?: boolean; name?: string }) =>
        idx.key?.model === 1 && idx.unique === true
    );

    if (!uniqueModelIndex?.name) {
      logger.info('No unique index on model field found, skipping');
      return false;
    }

    await db.collection('system_models').dropIndex(uniqueModelIndex.name);
    logger.info(`Dropped unique index: ${uniqueModelIndex.name}`);
    return true;
  } catch (error) {
    logger.error('Failed to drop model unique index', { error });
    return false;
  }
}

/**
 * Create new indexes defined in the updated schema:
 * - teamId: for querying models by team
 * - tmbId: for querying models by owner
 * - isShared: for filtering shared models
 */
async function createNewIndexes(): Promise<string[]> {
  const db = connectionMongo.connection.db;
  if (!db) {
    logger.warn('MongoDB connection not available, skipping index creation');
    return [];
  }

  const created: string[] = [];
  const newIndexes: { key: Record<string, number>; name: string }[] = [
    { key: { teamId: 1 }, name: 'teamId_1' },
    { key: { tmbId: 1 }, name: 'tmbId_1' },
    { key: { isShared: 1 }, name: 'isShared_1' }
  ];

  for (const { key, name } of newIndexes) {
    try {
      const existingIndexes = await db.collection('system_models').listIndexes().toArray();
      const exists = existingIndexes.some((idx: { name?: string }) => idx.name === name);

      if (exists) {
        logger.info(`Index ${name} already exists, skipping`);
        continue;
      }

      await db.collection('system_models').createIndex(key, { name, background: true });
      created.push(name);
      logger.info(`Created index: ${name}`);
    } catch (error) {
      logger.error(`Failed to create index ${name}`, { error });
    }
  }

  return created;
}

/**
 * Set isShared = true on existing models that don't have it set.
 * Old models were inherently shared; this is backward compatible.
 */
async function migrateModelData(): Promise<{ total: number; isSharedSet: number }> {
  const models = await MongoSystemModel.find({}).lean();
  logger.info(`Found ${models.length} models`);

  let isSharedSet = 0;

  for (const model of models) {
    const updates: Record<string, any> = {};

    if (model.isShared === undefined) {
      updates.isShared = true;
    }

    if (Object.keys(updates).length > 0) {
      await MongoSystemModel.updateOne({ _id: model._id }, { $set: updates });
      isSharedSet++;
    }
  }

  logger.info(`Data migration complete: isShared set on ${isSharedSet} models`);
  return { total: models.length, isSharedSet };
}

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<Initv4150Response>
): Promise<Initv4150Response> {
  await authCert({ req, authRoot: true });

  logger.info('=== Starting v4.15.0 model management migration ===');

  // Step 1: Drop old unique index on model field
  const modelUniqueIndexDropped = await dropModelUniqueIndex();

  // Step 2: Create new indexes
  const newIndexesCreated = await createNewIndexes();

  // Step 3: Migrate model data (set isShared)
  let dataMigration = { total: 0, isSharedSet: 0 };
  try {
    dataMigration = await migrateModelData();
  } catch (error) {
    logger.error('Data migration failed', { error });
  }

  logger.info('=== v4.15.0 migration complete ===');

  return {
    message: 'v4.15.0 model management migration completed',
    indexMigration: {
      modelUniqueIndexDropped,
      newIndexesCreated
    },
    dataMigration
  };
}

export default NextAPI(handler);
