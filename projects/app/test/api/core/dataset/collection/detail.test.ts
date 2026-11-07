import detailHandler from '@/pages/api/core/dataset/collection/detail';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetFileMetadata } = vi.hoisted(() => ({
  mockGetFileMetadata: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    getFileMetadata: mockGetFileMetadata,
    deleteDatasetFilesByKeys: vi.fn()
  })
}));

const createCollection = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) => {
  const dataset = await MongoDataset.create({
    name: 'detail-source',
    teamId,
    tmbId,
    vectorModel: 'test',
    agentModel: 'test'
  });
  const collection = await MongoDatasetCollection.create({
    name: 'file',
    type: DatasetCollectionTypeEnum.file,
    teamId,
    tmbId,
    datasetId: dataset._id
  });

  return { dataset, collection };
};

describe('collection detail S3 metadata binding', () => {
  beforeEach(() => {
    mockGetFileMetadata.mockReset();
    mockGetFileMetadata.mockResolvedValue({
      filename: 'own.pdf',
      contentType: 'application/pdf',
      contentLength: 10
    });
  });

  it.each([null, undefined, 'remote-parent'])(
    '兼容 API 文件旧父级字段：%s',
    async (apiFileParentId) => {
      const users = await getFakeUsers(1);
      const member = users.members[0];
      const { collection } = await createCollection({
        teamId: users.owner.teamId,
        tmbId: member.tmbId
      });
      // 直接写原始记录，包含历史版本可能持久化的 null。
      await MongoDatasetCollection.collection.updateOne(
        { _id: new Types.ObjectId(collection._id) },
        { $set: { type: DatasetCollectionTypeEnum.apiFile, apiFileParentId } }
      );

      const response = await Call(detailHandler, {
        auth: member,
        query: { id: String(collection._id) }
      });

      expect(response.code).toBe(200);
      expect(response.data.apiFileParentId).toBe(apiFileParentId ?? undefined);
    }
  );

  it('reads metadata when the fileId belongs to the collection dataset', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { dataset, collection } = await createCollection({
      teamId: users.owner.teamId,
      tmbId: member.tmbId
    });
    const ownFileId = `dataset/${dataset._id}/own.pdf`;
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { fileId: ownFileId } }
    );

    const response = await Call(detailHandler, {
      auth: member,
      query: { id: String(collection._id) }
    });

    expect(response.code).toBe(200);
    expect(mockGetFileMetadata).toHaveBeenCalledWith(ownFileId);
  });

  it('rejects a fileId that belongs to another dataset without reading metadata', async () => {
    const users = await getFakeUsers(1);
    const member = users.members[0];
    const { collection } = await createCollection({
      teamId: users.owner.teamId,
      tmbId: member.tmbId
    });
    await MongoDatasetCollection.updateOne(
      { _id: collection._id },
      { $set: { fileId: 'dataset/507f1f77bcf86cd799439099/foreign.pdf' } }
    );

    const response = await Call(detailHandler, {
      auth: member,
      query: { id: String(collection._id) }
    });

    expect(response.code).not.toBe(200);
    expect(mockGetFileMetadata).not.toHaveBeenCalled();
  });
});
