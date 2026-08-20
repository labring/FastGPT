import { describe, expect, it } from 'vitest';
import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymJobTypeEnum,
  DatasetSynonymOperationStatusEnum
} from '@fastgpt/global/core/dataset/synonym';
import { Types } from '@fastgpt/service/common/mongo';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymJob,
  MongoDatasetSynonymMapping,
  MongoDatasetSynonymOperation
} from '@fastgpt/service/core/dataset/synonym/schema';
import {
  cleanupRetiredDatasetSynonymVersion,
  failDatasetSynonymJobBeforeProcessing
} from '@fastgpt/service/core/dataset/synonym/controller';

const teamId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const synonymFileId = new Types.ObjectId();

const createCleanupContext = async ({
  activeVersion = 2,
  pendingVersion
}: {
  activeVersion?: number;
  pendingVersion?: number;
} = {}) => {
  await MongoDatasetSynonym.create({
    _id: synonymFileId,
    teamId,
    datasetId,
    activeVersion,
    latestVersion: 2,
    ...(pendingVersion ? { pendingVersion } : {})
  });
  const job = await MongoDatasetSynonymJob.create({
    teamId,
    tmbId: new Types.ObjectId(),
    datasetId,
    billId: new Types.ObjectId(),
    synonymFileId,
    fileVersion: 2,
    fencingToken: 1,
    type: DatasetSynonymJobTypeEnum.update,
    status: DatasetSynonymJobStatusEnum.completed,
    cleanupPending: true,
    retiredVersion: 1,
    affectedLogicalMappingIds: []
  });
  await MongoDatasetSynonymMapping.create({
    logicalMappingId: new Types.ObjectId(),
    teamId,
    datasetId,
    synonymFileId,
    fileVersion: 1,
    standardizedTerm: '退款',
    normalizedStandardizedTerm: '退款',
    synonymTerms: ['退货'],
    normalizedSynonymTerms: ['退货'],
    allTerms: '退款 退货',
    fingerprint: 'fingerprint',
    jobId: job._id
  });
  return job;
};

describe('cleanupRetiredDatasetSynonymVersion', () => {
  it('清理不再被引用的 mapping 版本', async () => {
    const job = await createCleanupContext();

    await expect(cleanupRetiredDatasetSynonymVersion(String(job._id))).resolves.toBe(true);

    expect(await MongoDatasetSynonymMapping.exists({ datasetId, fileVersion: 1 })).toBeNull();
    const completedJob = await MongoDatasetSynonymJob.findById(job._id).lean();
    expect(completedJob).not.toHaveProperty('cleanupPending');
    expect(completedJob).not.toHaveProperty('retiredVersion');
  });

  it('存在未完成 operation 时保留退休资源', async () => {
    const job = await createCleanupContext();
    await MongoDatasetSynonymOperation.create({
      operationId: 'cleanup-blocked-operation',
      teamId,
      datasetId,
      jobId: job._id,
      trainingId: new Types.ObjectId(),
      dataId: new Types.ObjectId(),
      targetVersion: 2,
      status: DatasetSynonymOperationStatusEnum.mongoCommitted
    });

    await expect(cleanupRetiredDatasetSynonymVersion(String(job._id))).resolves.toBe(false);

    expect(await MongoDatasetSynonymMapping.exists({ datasetId, fileVersion: 1 })).toBeTruthy();
  });

  it('不删除仍被 active 配置引用的版本', async () => {
    const job = await createCleanupContext({ activeVersion: 1 });

    await expect(cleanupRetiredDatasetSynonymVersion(String(job._id))).resolves.toBe(false);

    expect(await MongoDatasetSynonymMapping.exists({ datasetId, fileVersion: 1 })).toBeTruthy();
  });

  it('重复清理保持幂等', async () => {
    const job = await createCleanupContext();
    await expect(cleanupRetiredDatasetSynonymVersion(String(job._id))).resolves.toBe(true);
    await expect(cleanupRetiredDatasetSynonymVersion(String(job._id))).resolves.toBe(true);
    expect(await MongoDatasetSynonymMapping.exists({ datasetId, fileVersion: 1 })).toBeNull();
  });
});

describe('failDatasetSynonymJobBeforeProcessing', () => {
  const createPendingContext = async () => {
    const config = await MongoDatasetSynonym.create({
      teamId,
      datasetId,
      activeVersion: 1,
      latestVersion: 2,
      pendingVersion: 2,
      pendingFileName: 'synonyms.csv'
    });
    const job = await MongoDatasetSynonymJob.create({
      teamId,
      tmbId: new Types.ObjectId(),
      datasetId,
      billId: new Types.ObjectId(),
      synonymFileId: config._id,
      fileVersion: 2,
      snapshotReady: true,
      fencingToken: 1,
      type: DatasetSynonymJobTypeEnum.update,
      status: DatasetSynonymJobStatusEnum.marking,
      isActive: true,
      affectedLogicalMappingIds: []
    });
    await MongoDatasetSynonymMapping.create({
      logicalMappingId: new Types.ObjectId(),
      teamId,
      datasetId,
      synonymFileId: config._id,
      fileVersion: 2,
      standardizedTerm: '退款',
      normalizedStandardizedTerm: '退款',
      synonymTerms: ['退钱'],
      normalizedSynonymTerms: ['退钱'],
      allTerms: '退款 退钱',
      fingerprint: 'fingerprint',
      jobId: job._id
    });
    return { config, job };
  };

  it('失败时保留完整 Mongo snapshot 供 retry', async () => {
    const { config, job } = await createPendingContext();

    await expect(
      failDatasetSynonymJobBeforeProcessing({ jobId: String(job._id), error: new Error('failed') })
    ).resolves.toBe(true);

    expect(await MongoDatasetSynonymMapping.countDocuments({ jobId: job._id })).toBe(1);
    expect(await MongoDatasetSynonym.findById(config._id).lean()).not.toHaveProperty(
      'pendingVersion'
    );
    await expect(MongoDatasetSynonymJob.findById(job._id).lean()).resolves.toMatchObject({
      status: DatasetSynonymJobStatusEnum.failed,
      snapshotReady: true
    });
  });

  it('主动取消时删除未生效 snapshot', async () => {
    const { job } = await createPendingContext();

    await expect(
      failDatasetSynonymJobBeforeProcessing({
        jobId: String(job._id),
        error: new Error('cancelled'),
        finalStatus: DatasetSynonymJobStatusEnum.cancelled
      })
    ).resolves.toBe(true);

    expect(await MongoDatasetSynonymMapping.countDocuments({ jobId: job._id })).toBe(0);
  });
});
