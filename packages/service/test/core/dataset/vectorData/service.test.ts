import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({ count: vi.fn(), provider: 'pg' }));
vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({ getVectorCount: mocks.count }));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => mocks.provider
}));
import { getDatasetVectorSearchData } from '@fastgpt/service/core/dataset/vectorData/service';

describe('getDatasetVectorSearchData', () => {
  beforeEach(() => {
    mocks.provider = 'pg';
    mocks.count.mockReset().mockResolvedValue(50);
  });

  it('reads one metadata snapshot, deduplicates datasets and keeps counts outside Mongo', async () => {
    const teamId = String(new Types.ObjectId());
    const datasets = await MongoDataset.create(
      ['none', 'ready'].map((pgIndex) => ({
        teamId,
        tmbId: new Types.ObjectId(),
        name: pgIndex,
        type: DatasetTypeEnum.dataset,
        ...(pgIndex === 'ready' ? { vectorData: { pgIndex, pgIndexCheckedAt: new Date() } } : {})
      }))
    );
    const datasetIds = datasets.map((d) => String(d._id));
    const result = await getDatasetVectorSearchData({
      teamId,
      datasetIds: [...datasetIds, datasetIds[0]]
    });
    expect(result).toEqual([
      { datasetId: datasetIds[0], rows: 50, pgIndex: 'none' },
      { datasetId: datasetIds[1], rows: 50, pgIndex: 'ready' }
    ]);
    expect(mocks.count).toHaveBeenCalledTimes(2);
    expect((await MongoDataset.findById(datasetIds[0]).lean())?.vectorData).toBeUndefined();
    expect(
      await getDatasetVectorSearchData({ teamId: String(new Types.ObjectId()), datasetIds })
    ).toEqual([]);
  });

  it('skips empty scopes and other providers', async () => {
    expect(await getDatasetVectorSearchData({ teamId: 'team', datasetIds: [] })).toBeUndefined();
    mocks.provider = 'milvus';
    expect(
      await getDatasetVectorSearchData({ teamId: 'team', datasetIds: ['id'] })
    ).toBeUndefined();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('bounds concurrent cold counts to four', async () => {
    const teamId = String(new Types.ObjectId());
    const datasets = await MongoDataset.create(
      Array.from({ length: 9 }, () => ({
        teamId,
        tmbId: new Types.ObjectId(),
        name: 'vectors',
        type: DatasetTypeEnum.dataset
      }))
    );
    let active = 0;
    let maxActive = 0;
    mocks.count.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      return 40;
    });
    const result = await getDatasetVectorSearchData({
      teamId,
      datasetIds: datasets.map((d) => String(d._id))
    });
    expect(result).toHaveLength(9);
    expect(maxActive).toBe(4);
  });
});
