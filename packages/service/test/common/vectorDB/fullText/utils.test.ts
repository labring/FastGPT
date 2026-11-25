import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { normalizeSqlFullTextScope } from '@fastgpt/service/common/vectorDB/fullText/utils';

describe('SQL full-text scope normalization', () => {
  it('converts IDs from an actual Mongoose document before SQL drivers can JSON-encode them', async () => {
    const teamId = new Types.ObjectId(),
      datasetId = new Types.ObjectId(),
      collectionId = new Types.ObjectId();
    const doc = await MongoDatasetData.create({
      teamId,
      datasetId,
      collectionId,
      tmbId: new Types.ObjectId(),
      indexes: []
    });
    expect(typeof doc.teamId).toBe('object');
    const normalized = normalizeSqlFullTextScope({
      teamId: doc.teamId,
      datasetIds: [doc.datasetId],
      filterCollectionIdList: [doc.collectionId],
      forbidCollectionIdList: [doc.collectionId],
      query: '原始查询',
      limit: 10
    });
    expect(normalized).toEqual({
      teamId: String(teamId),
      datasetIds: [String(datasetId)],
      filterCollectionIdList: [String(collectionId)],
      forbidCollectionIdList: [String(collectionId)],
      query: '原始查询',
      limit: 10
    });
  });
});
