import { DatasetCollectionTypeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { getFakeUsers } from '@test/datas/users';
import { describe, expect, it, vi } from 'vitest';

/**
 * NFR-8（越权召回 = 0）：结果回查防御层。
 *
 * 向量库过滤条件可能失效（引擎差异、索引不一致等），此时召回结果里会出现不可读 collection
 * 的命中。`embeddingRecall` 回查 data/collection 时必须再按过滤集合裁剪，本用例模拟
 * 「向量库泄漏」以锁定该防御不被移除。
 */

const { recallFromVectorStoreMock, getVectorsMock } = vi.hoisted(() => ({
  recallFromVectorStoreMock: vi.fn(),
  getVectorsMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/vectorDB/controller', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recallFromVectorStore: recallFromVectorStoreMock
}));
vi.mock('@fastgpt/service/core/ai/embedding', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectors: getVectorsMock
}));

import { embeddingRecall } from '@fastgpt/service/core/dataset/search/defaultRecall/embeddingRecall';

type User = Awaited<ReturnType<typeof getFakeUsers>>['owner'];

const createDataset = async (user: User) =>
  mongoSessionRun(async (session) => {
    const dataset = await MongoDataset.create({
      teamId: user.teamId,
      tmbId: user.tmbId,
      type: DatasetTypeEnum.dataset,
      name: 'embedding-recall-recheck-dataset'
    });
    await createResourceDefaultCollaborators({
      resource: {
        _id: String(dataset._id),
        type: dataset.type,
        teamId: String(dataset.teamId)
      },
      resourceType: PerResourceTypeEnum.dataset,
      session,
      tmbId: String(user.tmbId)
    });
    return dataset;
  });

describe.sequential('embeddingRecall collection permission re-check', () => {
  it('drops recalled data whose collection is outside the readable set', async () => {
    const users = await getFakeUsers(1);
    const { owner } = users;
    const teamId = String(owner.teamId);
    const dataset = await createDataset(owner);
    const datasetId = String(dataset._id);

    const readableCollection = await MongoDatasetCollection.create({
      teamId,
      tmbId: owner.tmbId,
      datasetId,
      type: DatasetCollectionTypeEnum.file,
      name: 'readable-collection'
    });
    const hiddenCollection = await MongoDatasetCollection.create({
      teamId,
      tmbId: owner.tmbId,
      datasetId,
      type: DatasetCollectionTypeEnum.file,
      name: 'hidden-collection'
    });

    const readableData = await MongoDatasetData.create({
      teamId,
      tmbId: owner.tmbId,
      datasetId,
      collectionId: readableCollection._id,
      q: 'readable question',
      a: 'readable answer',
      indexes: [{ dataId: 'vec-readable', text: 'readable question' }]
    });
    await MongoDatasetData.create({
      teamId,
      tmbId: owner.tmbId,
      datasetId,
      collectionId: hiddenCollection._id,
      q: 'hidden question',
      a: 'hidden answer',
      indexes: [{ dataId: 'vec-hidden', text: 'hidden question' }]
    });

    // 向量库「泄漏」：即便已下发 filterCollectionIdList，仍返回不可读 collection 的命中。
    recallFromVectorStoreMock.mockResolvedValue({
      results: [
        { id: 'vec-readable', collectionId: String(readableCollection._id) },
        { id: 'vec-hidden', collectionId: String(hiddenCollection._id) }
      ]
    });
    getVectorsMock.mockResolvedValue({ tokens: 1, vectors: [[0.1, 0.2]] });

    const result = await embeddingRecall({
      teamId,
      datasetIds: [datasetId],
      model: { model: 'embedding' } as never,
      imageQueries: [],
      textQueries: ['question'],
      imageCaptionQueries: [],
      limit: 10,
      forbidCollectionIdList: [],
      filterCollectionIdList: [String(readableCollection._id)]
    });

    expect(result.textEmbeddingRecallResults.map((item) => item.collectionId)).toEqual([
      String(readableCollection._id)
    ]);
    // 不可读 collection 的 data 与 collection 本身都不得出现在结果里。
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(String(hiddenCollection._id));
    expect(serialized).not.toContain('hidden question');
    expect(serialized).not.toContain('hidden answer');
    expect(serialized).toContain(String(readableData._id));
  });
});
