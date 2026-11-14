import { randomUUID } from 'node:crypto';
import { Mongoose, Schema } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    MONGODB_URI: 'mongodb://127.0.0.1:27017/unused_index_startup',
    DB_MAX_LINK: 20,
    SYNC_INDEX: false
  },
  sync: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('../../../src/env', () => ({ marketplaceEnv: mocks.env }));
vi.mock('@fastgpt/service/common/mongo/indexManager', () => ({
  MongoIndexManager: { syncModelIndexes: mocks.sync }
}));
vi.mock('../../../src/service/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { INFRA: { MONGO: 'mongo' } }
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.sync.mockResolvedValue(undefined);
  mocks.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused_index_startup';
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_PHASE', undefined);
  vi.stubEnv('SYNC_INDEX', 'false');
  // 只验证启动委派，不建立数据库连接。
  vi.stubGlobal('mongodb', new Mongoose());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getMongoModel index startup', () => {
  const loadModel = async () => {
    const { getMongoModel } = await import('../../../src/service/mongo');
    return getMongoModel(
      `IndexStartup${randomUUID().replaceAll('-', '')}`,
      new Schema({ value: String }, { autoIndex: false, autoCreate: false })
    );
  };

  it('maintains indexes even when the retired switch is false', async () => {
    const model = await loadModel();
    expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ model, logger: mocks.logger });
  });

  it.each(['test', 'build', 'missing database'])('skips maintenance during %s', async (reason) => {
    if (reason === 'test') vi.stubEnv('NODE_ENV', 'test');
    if (reason === 'build') vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    if (reason === 'missing database') mocks.env.MONGODB_URI = '';

    await loadModel();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('reports maintenance failures with the affected collection', async () => {
    const error = new Error('index creation failed');
    mocks.sync.mockRejectedValueOnce(error);
    const model = await loadModel();

    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to ensure MongoDB indexes', {
      modelName: model.modelName,
      collectionName: model.collection.collectionName,
      error
    });
  });
});
