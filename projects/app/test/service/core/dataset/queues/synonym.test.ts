import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymJobTypeEnum,
  DatasetSynonymOperationStatusEnum
} from '@fastgpt/global/core/dataset/synonym';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  MongoDatasetSynonymJob,
  MongoDatasetSynonymOperation
} from '@fastgpt/service/core/dataset/synonym/schema';
import { getRootUser } from '@test/datas/users';
import { mockVectorDelete, resetVectorMocks } from '@test/mocks/common/vector';
import { reconcileOrphanDatasetSynonymOperations } from '@/service/core/dataset/queues/synonym';

const { mockPushGenerateVectorUsage } = vi.hoisted(() => ({
  mockPushGenerateVectorUsage: vi.fn(async () => ({ success: true, totalPoints: 1 }))
}));

vi.mock('@/service/support/wallet/usage/push', () => ({
  pushGenerateVectorUsage: mockPushGenerateVectorUsage
}));

const createOrphanOperation = async ({
  status,
  dataVersion,
  insertedVectorIds,
  obsoleteVectorIds
}: {
  status: DatasetSynonymOperationStatusEnum;
  dataVersion: number;
  insertedVectorIds: string[];
  obsoleteVectorIds: string[];
}) => {
  const root = await getRootUser();
  const dataset = await MongoDataset.create({
    name: 'synonym operation dataset',
    teamId: root.teamId,
    tmbId: root.tmbId,
    type: DatasetTypeEnum.dataset,
    vectorModel: 'text-embedding-ada-002',
    agentModel: 'gpt-5'
  });
  const collectionId = new Types.ObjectId();
  const data = await MongoDatasetData.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    collectionId,
    q: 'question',
    a: '',
    synonymIndexVersion: dataVersion,
    indexes: [
      {
        type: DatasetDataIndexTypeEnum.default,
        text: 'question',
        dataId: dataVersion === 2 ? insertedVectorIds[0] : 'active-vector'
      }
    ]
  });
  const billId = new Types.ObjectId();
  const job = await MongoDatasetSynonymJob.create({
    teamId: root.teamId,
    tmbId: root.tmbId,
    datasetId: dataset._id,
    billId,
    fileVersion: 2,
    fencingToken: 1,
    type: DatasetSynonymJobTypeEnum.update,
    status: DatasetSynonymJobStatusEnum.failed,
    affectedLogicalMappingIds: []
  });
  const trainingId = new Types.ObjectId();
  const operationId = `${job._id}:${data._id}:2`;
  const operation = await MongoDatasetSynonymOperation.create({
    operationId,
    teamId: root.teamId,
    datasetId: dataset._id,
    jobId: job._id,
    trainingId,
    dataId: data._id,
    targetVersion: 2,
    status,
    inputTokens: 12,
    attempt: 3,
    insertedVectorIds,
    obsoleteVectorIds
  });

  return { root, dataset, job, operation, operationId, billId };
};

describe('orphan dataset synonym operation reconciliation', () => {
  beforeEach(() => {
    resetVectorMocks();
    mockPushGenerateVectorUsage.mockClear();
    mockPushGenerateVectorUsage.mockResolvedValue({ success: true, totalPoints: 1 });
  });

  it('deletes obsolete vectors after Mongo was committed and submits idempotent usage', async () => {
    const context = await createOrphanOperation({
      status: DatasetSynonymOperationStatusEnum.mongoCommitted,
      dataVersion: 2,
      insertedVectorIds: ['new-vector'],
      obsoleteVectorIds: ['old-vector']
    });

    await reconcileOrphanDatasetSynonymOperations();

    expect(mockVectorDelete).toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['old-vector'] })
    );
    expect(mockPushGenerateVectorUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: String(context.root.teamId),
        usageId: String(context.billId),
        operationId: `${context.operationId}:embedding:3`,
        inputTokens: 12
      })
    );
    await expect(
      MongoDatasetSynonymOperation.findById(context.operation._id).lean()
    ).resolves.toMatchObject({ status: DatasetSynonymOperationStatusEnum.completed });
  });

  it('reclaims inserted vectors when Mongo was not committed', async () => {
    const context = await createOrphanOperation({
      status: DatasetSynonymOperationStatusEnum.vectorsPrepared,
      dataVersion: 1,
      insertedVectorIds: ['uncommitted-vector'],
      obsoleteVectorIds: ['active-vector']
    });

    await reconcileOrphanDatasetSynonymOperations();

    expect(mockVectorDelete).toHaveBeenCalledWith(
      expect.objectContaining({ idList: ['uncommitted-vector'] })
    );
    expect(mockPushGenerateVectorUsage).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: `${context.operationId}:embedding:3` })
    );
    await expect(
      MongoDatasetSynonymOperation.findById(context.operation._id).lean()
    ).resolves.toMatchObject({ status: DatasetSynonymOperationStatusEnum.completed });
  });
});
