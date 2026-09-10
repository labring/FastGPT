import './mocks';

import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { initGlobalVariables } from '@/service/common/system';
import { afterAll, beforeAll, beforeEach, inject, onTestFinished, vi } from 'vitest';
import setupModels from './setupModels';
import { clean } from './datas/users';
import { connectionLogMongo, connectionMongo } from '@fastgpt/service/common/mongo';
import { loadVectorDBEnv } from './utils/env';
import type { Mongoose } from '@fastgpt/service/common/mongo';

vi.stubEnv('NODE_ENV', 'test');

loadVectorDBEnv({ envFileNames: ['.env.test.local'] });

/**
 * Clears documents while keeping collections and indexes warm inside one test file.
 * File-level DB names are already isolated, so per-case cleanup does not need to
 * drop the whole database and force MongoDB to rebuild collection metadata.
 */
const clearMongoCollections = async (db: Mongoose | undefined) => {
  const database = db?.connection.db;
  if (!database) return;

  const collections = await database.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

beforeAll(async () => {
  vi.stubEnv('MONGODB_URI', inject('MONGODB_URI'));
  await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  initGlobalVariables();
  global.systemEnv = {} as any;

  global.feConfigs = {
    isPlus: false
  } as any;
  await setupModels();
});

afterAll(async () => {
  await connectionMongo?.connection.db?.dropDatabase();
  await connectionLogMongo?.connection.db?.dropDatabase();
  await connectionMongo?.disconnect();
  await connectionLogMongo?.disconnect();
});

beforeEach(async () => {
  // await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  // await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  onTestFinished(async () => {
    clean();

    try {
      await Promise.all([
        clearMongoCollections(connectionMongo),
        clearMongoCollections(connectionLogMongo)
      ]);
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Error during test cleanup:', error);
    }
  });
});
