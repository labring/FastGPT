import readHandler from '@/pages/api/core/dataset/collection/read';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreateGetDatasetFileURL } = vi.hoisted(() => ({
  mockCreateGetDatasetFileURL: vi.fn()
}));

// delCollection 之外的 fileId 签发入口需要本地提供 createGetDatasetFileURL。
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    createGetDatasetFileURL: mockCreateGetDatasetFileURL,
    deleteDatasetFilesByKeys: vi.fn()
  })
}));

const createCollection = async ({ teamId, tmbId }: { teamId: string; tmbId: string }) => {
  const dataset = await MongoDataset.create({
    name: 'read-source',
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

describe('read collection source S3 binding', () => {
  beforeEach(() => {
    mockCreateGetDatasetFileURL.mockReset();
    mockCreateGetDatasetFileURL.mockResolvedValue({ url: 'https://files.test/signed' });
  });

  it('signs the collection fileId when it belongs to the collection dataset', async () => {
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

    const response = await Call(readHandler, {
      auth: member,
      body: { collectionId: String(collection._id) }
    });

    expect(response.code).toBe(200);
    expect(mockCreateGetDatasetFileURL).toHaveBeenCalledWith(
      expect.objectContaining({ key: ownFileId, datasetId: String(dataset._id) })
    );
    expect(response.data.value).toBe('https://files.test/signed');
  });

  it('does not sign a fileId that belongs to another dataset', async () => {
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

    const response = await Call(readHandler, {
      auth: member,
      body: { collectionId: String(collection._id) }
    });

    expect(response.code).toBe(200);
    expect(mockCreateGetDatasetFileURL).not.toHaveBeenCalled();
    expect(response.data.value).toBe('');
  });
});
