import { getModelTestDefaults, addModelTestModel } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getRootUser } from '@test/datas/users';
import { Types } from '@fastgpt/service/common/mongo';
import { mockVectorInsert, resetVectorMocks } from '@test/mocks/common/vector';
import { createMockVectorsResponse, mockGetVectors } from '@test/mocks/core/ai/embedding';
import { serviceEnv } from '@fastgpt/service/env';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));
vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn().mockResolvedValue(true)
}));

import { generateVector } from '@/service/core/dataset/queues/generateVector';

let embeddingModel: NonNullable<ReturnType<typeof getModelTestDefaults>['embedding']>;

const createContext = async ({
  indexStatus,
  indexes = []
}: {
  indexStatus?: DatasetDataIndexStatusEnum;
  indexes?: { type: DatasetDataIndexTypeEnum; text: string; dataId: string }[];
} = {}) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    name: 'vector pre create',
    vectorModelId: embeddingModel.modelId
  });
  const collection = await MongoDatasetCollection.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    name: 'collection',
    type: DatasetCollectionTypeEnum.file,
    indexPrefixTitle: false
  });

  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    q: 'chunk content',
    chunkIndex: 0,
    indexes,
    ...(indexStatus && { indexStatus })
  });

  const task = await MongoDatasetTraining.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId: collection._id,
    mode: TrainingModeEnum.chunk,
    billId: new Types.ObjectId().toString(),
    dataId: data._id,
    q: 'chunk content',
    chunkIndex: 0,
    retryCount: 5,
    lockTime: new Date('2000-01-01')
  });

  return { root, dataset, collection, data, task };
};

describe('generateVector pre-created data routing', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = false;
    global.vectorQueueLen = 0;
    resetVectorMocks();
    embeddingModel = {
      ...getModelTestDefaults().embedding!,
      modelId: '507f1f77bcf86cd799439031',
      model: 'pre-create-embedding',
      name: 'pre-create-embedding',
      config: { ...getModelTestDefaults().embedding!.config, maxToken: 100, weight: 100 }
    };
    addModelTestModel(embeddingModel);
    mockGetVectors.mockImplementation(async ({ inputs }) =>
      createMockVectorsResponse(inputs.map((input) => input.input))
    );
    mockVectorInsert.mockResolvedValue({ insertIds: ['pre_vector_1'] });
  });

  /** CP-04 / DS-07 规则 3：待索引数据走提前落库路径，更新同一条数据。 */
  it('updates the same pre-created data and marks it indexed', async () => {
    const { data, task } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.parsed
    });

    await generateVector();

    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed,
      q: 'chunk content'
    });
    expect(updated!.indexes.length).toBeGreaterThan(0);
    expect(updated!.indexes.every((index) => Boolean(index.dataId))).toBe(true);

    // 同一 dataId 只有一条数据行，训练任务按现有逻辑删除。
    expect(await MongoDatasetData.countDocuments({ collectionId: data.collectionId })).toBe(1);
    expect(await MongoDatasetTraining.findById(task._id)).toBeNull();
  });

  /**
   * DS-07：新路径开始处理时把 parsed 更新为 indexing。
   * 向量调用发生在一步之后，因此在该回调里读库能观察到标记是否已经落盘。
   */
  it('marks the pre-created data as indexing before writing vectors', async () => {
    const { data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.parsed
    });

    const statusesDuringVectorWrite: (string | undefined)[] = [];
    mockGetVectors.mockImplementation(async ({ inputs }) => {
      const current = await MongoDatasetData.findById(data._id).lean();
      statusesDuringVectorWrite.push(current?.indexStatus);
      return createMockVectorsResponse(inputs.map((input) => input.input));
    });

    await generateVector();

    expect(statusesDuringVectorWrite).not.toHaveLength(0);
    expect(statusesDuringVectorWrite).toContain(DatasetDataIndexStatusEnum.indexing);
    // 完成态仍收敛到 indexed。
    expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.indexed
    );
  });

  /** DS-10.3：Mongo $text provider 的全文行与 indexed 标记同边界写入。 */
  it('writes the full-text record together with the indexed status', async () => {
    const { data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.indexing
    });

    await generateVector();

    expect(await MongoDatasetData.findById(data._id).lean()).toMatchObject({
      indexStatus: DatasetDataIndexStatusEnum.indexed
    });
    expect(await MongoDatasetDataText.countDocuments({ dataId: data._id })).toBe(1);
  });

  /** DS-07：提前落库路径不得触发重建接力，任务表不产生重建链残留。 */
  it('does not enqueue a following rebuild task', async () => {
    const { dataset, data } = await createContext({
      indexStatus: DatasetDataIndexStatusEnum.parsed
    });

    await generateVector();

    expect(await MongoDatasetTraining.countDocuments({ datasetId: dataset._id })).toBe(0);
    const updated = await MongoDatasetData.findById(data._id).lean();
    expect(updated?.rebuilding).toBeUndefined();
    // 内容未变化时不写入历史记录。
    expect(updated?.history ?? []).toHaveLength(0);
  });

  /** CP-03：关联数据无状态时继续走现有正式数据重建路径。 */
  it('keeps the rebuild path for data without indexStatus', async () => {
    const { data } = await createContext({
      indexes: [
        {
          type: DatasetDataIndexTypeEnum.custom,
          text: 'legacy custom index',
          dataId: 'legacy_vector_1'
        }
      ]
    });

    await generateVector();

    const updated = await MongoDatasetData.findById(data._id).lean();
    // 正式重建路径不改写 indexStatus 字段。
    expect(updated?.indexStatus).toBeUndefined();
    expect(updated!.indexes.map((index) => index.text)).toContain('legacy custom index');
  });
});
