import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectEmbeddingMongo,
  ensureMongoEmbeddingSearchIndex,
  initEmbeddingMongo,
  MongoEmbeddingSearchDefinition
} from '@fastgpt/service/common/vectorDB/mongo/controller';
import { MongoIndexManager } from '@fastgpt/service/common/mongo/indexManager';

const mocks = vi.hoisted(() => ({
  env: { EMBEDDING_MONGO_URL: 'mongodb://test/embeddings', DB_MAX_LINK: 10 },
  connection: { readyState: 0 },
  connect: vi.fn(),
  list: vi.fn(),
  create: vi.fn()
}));
vi.mock('@fastgpt/service/env', () => ({ serviceEnv: mocks.env }));
vi.mock('@fastgpt/service/common/vectorDB/mongo/schema', () => ({
  embeddingMongo: { connection: mocks.connection, connect: mocks.connect },
  MongoDatasetDataEmbedding: {
    collection: {
      listSearchIndexes: () => ({ toArray: mocks.list }),
      createSearchIndex: mocks.create
    }
  }
}));
const ready = () => ({
  status: 'READY',
  queryable: true,
  latestDefinition: MongoEmbeddingSearchDefinition
});

describe('Mongo embedding initialization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.env.EMBEDDING_MONGO_URL = 'mongodb://test/embeddings';
    mocks.connection.readyState = 0;
    global.embeddingMongoConnecting = undefined;
    mocks.connect.mockReset().mockResolvedValue(undefined);
    mocks.list.mockReset().mockResolvedValue([ready()]);
    mocks.create.mockReset().mockResolvedValue('embedding_int8');
  });

  it('requires a dedicated URL and reuses an established connection', async () => {
    mocks.env.EMBEDDING_MONGO_URL = '';
    await expect(connectEmbeddingMongo()).rejects.toThrow('EMBEDDING_MONGO_URL');
    mocks.env.EMBEDDING_MONGO_URL = 'mongodb://test/embeddings';
    mocks.connection.readyState = 1;
    await connectEmbeddingMongo();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('shares concurrent connections and allows retry after failure', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('offline'));
    await expect(connectEmbeddingMongo()).rejects.toThrow('offline');
    await Promise.all([connectEmbeddingMongo(), connectEmbeddingMongo()]);
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(global.embeddingMongoConnecting).toBeUndefined();
  });

  it('creates scalar/INT8 and tenant filter fields only when the managed index is absent', async () => {
    mocks.list.mockResolvedValueOnce([]);
    await ensureMongoEmbeddingSearchIndex();
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'embedding_int8',
      type: 'vectorSearch',
      definition: MongoEmbeddingSearchDefinition
    });
    mocks.create.mockClear();
    await ensureMongoEmbeddingSearchIndex();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('allows a concurrent creator but propagates unrelated errors', async () => {
    mocks.list.mockResolvedValueOnce([]);
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 68 }));
    await ensureMongoEmbeddingSearchIndex();
    mocks.list.mockResolvedValueOnce([]);
    mocks.create.mockRejectedValueOnce(new Error('permission denied'));
    await expect(ensureMongoEmbeddingSearchIndex()).rejects.toThrow('permission denied');
  });

  it('rejects incompatible or failed indexes without replacing them', async () => {
    mocks.list.mockResolvedValue([{ ...ready(), latestDefinition: { fields: [] } }]);
    await expect(ensureMongoEmbeddingSearchIndex()).rejects.toThrow('incompatible');
    mocks.list.mockResolvedValue([{ ...ready(), status: 'FAILED' }]);
    await expect(ensureMongoEmbeddingSearchIndex()).rejects.toThrow('build failed');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('accepts the server default HNSW but rejects flat or non-INT8 definitions', async () => {
    const fields = MongoEmbeddingSearchDefinition.fields.map((field) => {
      if (field.type !== 'vector') return field;
      const { indexingMethod: _method, ...rest } = field;
      return rest;
    });
    mocks.list.mockResolvedValue([{ ...ready(), latestDefinition: { fields } }]);
    await ensureMongoEmbeddingSearchIndex();
    for (const override of [{ indexingMethod: 'flat' }, { quantization: 'binary' }]) {
      mocks.list.mockResolvedValue([
        {
          ...ready(),
          latestDefinition: {
            fields: fields.map((field) =>
              field.type === 'vector' ? { ...field, ...override } : field
            )
          }
        }
      ]);
      await expect(ensureMongoEmbeddingSearchIndex()).rejects.toThrow('incompatible');
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('bounds initialization time for indexes that never become ready', async () => {
    vi.useFakeTimers();
    try {
      mocks.list.mockResolvedValue([{ ...ready(), status: 'PENDING', queryable: false }]);
      const result = expect(ensureMongoEmbeddingSearchIndex()).rejects.toThrow('180 seconds');
      await vi.advanceTimersByTimeAsync(180000);
      await result;
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a failed init and caches completed index initialization', async () => {
    const sync = vi
      .spyOn(MongoIndexManager, 'syncModelIndexes')
      .mockRejectedValueOnce(new Error('index error'))
      .mockResolvedValue({} as never);
    await expect(initEmbeddingMongo()).rejects.toThrow('index error');
    await Promise.all([initEmbeddingMongo(), initEmbeddingMongo()]);
    await initEmbeddingMongo();
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
