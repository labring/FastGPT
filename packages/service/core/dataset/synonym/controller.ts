import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymJobTypeEnum,
  DatasetSynonymMappingSourceEnum,
  DatasetMutationLockOwnerTypeEnum,
  DatasetSynonymOperationStatusEnum,
  DatasetSynonymSchemaVersion,
  type NormalizedSynonymMappingType
} from '@fastgpt/global/core/dataset/synonym';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { Types } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetTraining } from '../training/schema';
import {
  acquireDatasetMutationLock,
  assertDatasetMutationLock,
  releaseDatasetMutationLock,
  renewDatasetMutationLock
} from '../mutationLock/service';
import {
  assertDatasetSynonymConfigMigrated,
  getDatasetSynonymMappings,
  getDatasetSynonymMatcher,
  invalidateDatasetSynonymMatcherCache
} from './entity';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymJob,
  MongoDatasetSynonymMapping,
  MongoDatasetSynonymOperation
} from './schema';
import { calculateSynonymMappingDiff, getPendingSynonymMappings } from './service';

const synonymJobLeaseMs = 5 * 60_000;
const mappingWriteBatchSize = 500;
const dataScanBatchSize = 200;

type SynonymFileMetadata = {
  fileName: string;
  size: number;
  uploadTime: Date;
};

const emptyProgress = {
  affectedDataCount: 0,
  completedDataCount: 0,
  failedDataCount: 0,
  scannedDataCount: 0
};

/**
 * 创建不可变 pendingVersion 快照。锁和 job/config 元数据先用短事务提交，mapping
 * 再按批次幂等写入；任何失败只清理 pending 上下文，不覆盖 activeVersion。
 */
export const createDatasetSynonymVersion = async ({
  teamId,
  tmbId,
  datasetId,
  billId,
  mappings,
  file,
  expectedSynonymId,
  type
}: {
  teamId: string;
  tmbId: string;
  datasetId: string;
  billId: string;
  mappings: NormalizedSynonymMappingType[];
  file?: SynonymFileMetadata;
  expectedSynonymId?: string;
  type: DatasetSynonymJobTypeEnum;
}) => {
  const jobId = new Types.ObjectId();
  const ownerId = `synonym:${jobId}`;
  const lock = await acquireDatasetMutationLock({
    teamId,
    datasetId,
    ownerId,
    ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob,
    leaseMs: synonymJobLeaseMs
  });

  let synonymId: string | undefined;
  let fileVersion: number | undefined;

  try {
    const config = await MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();
    assertDatasetSynonymConfigMigrated(config);
    if (expectedSynonymId && String(config?._id) !== expectedSynonymId) {
      throw new Error('同义词配置已变化，请刷新页面后重试');
    }
    if (type === DatasetSynonymJobTypeEnum.delete && !config?.activeVersion) {
      throw new Error('知识库未配置同义词');
    }

    const activeMappings = config
      ? await getDatasetSynonymMappings({ teamId, datasetId, fileVersion: config.activeVersion })
      : [];
    const diff = calculateSynonymMappingDiff({ activeMappings, newMappings: mappings });
    const pendingMappings = getPendingSynonymMappings(diff);
    const configId = config?._id ?? new Types.ObjectId();
    const synonymFileId = String(configId);
    const nextFileVersion = (config?.latestVersion ?? 0) + 1;
    synonymId = synonymFileId;
    fileVersion = nextFileVersion;
    const now = new Date();
    const diffSummary = {
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length,
      unchanged: diff.unchanged.length,
      ...emptyProgress
    };

    await mongoSessionRun(async (session) => {
      await assertDatasetMutationLock({
        teamId,
        datasetId,
        ownerId,
        fencingToken: lock.fencingToken,
        session
      });

      if (config) {
        const updateResult = await MongoDatasetSynonym.updateOne(
          { _id: config._id, pendingVersion: { $exists: false } },
          {
            $set: {
              latestVersion: fileVersion,
              pendingVersion: fileVersion,
              schemaVersion: DatasetSynonymSchemaVersion,
              ...(file
                ? {
                    pendingFileName: file.fileName,
                    pendingSize: file.size,
                    pendingUploaderId: tmbId,
                    pendingUploadTime: file.uploadTime
                  }
                : {}),
              updateTime: now
            }
          },
          { session }
        );
        if (updateResult.modifiedCount !== 1) throw new Error('已有同义词任务正在处理');
      } else {
        await MongoDatasetSynonym.create(
          [
            {
              _id: configId,
              teamId,
              datasetId,
              activeVersion: 0,
              latestVersion: fileVersion,
              pendingVersion: fileVersion,
              schemaVersion: DatasetSynonymSchemaVersion,
              ...(file
                ? {
                    pendingFileName: file.fileName,
                    pendingSize: file.size,
                    pendingUploaderId: tmbId,
                    pendingUploadTime: file.uploadTime
                  }
                : {}),
              updateTime: now
            }
          ],
          { session, ordered: true }
        );
      }

      await MongoDatasetSynonymJob.create(
        [
          {
            _id: jobId,
            teamId,
            tmbId,
            datasetId,
            billId,
            synonymFileId: configId,
            fileName: file?.fileName,
            size: file?.size,
            uploadTime: file?.uploadTime,
            fileVersion,
            snapshotReady: false,
            fencingToken: lock.fencingToken,
            type,
            status: DatasetSynonymJobStatusEnum.diffing,
            isActive: true,
            diffSummary,
            affectedLogicalMappingIds: diff.affectedLogicalMappingIds,
            createTime: now,
            updateTime: now
          }
        ],
        { session, ordered: true }
      );
    });

    for (let start = 0; start < pendingMappings.length; start += mappingWriteBatchSize) {
      await renewDatasetMutationLock({
        teamId,
        datasetId,
        ownerId,
        fencingToken: lock.fencingToken,
        leaseMs: synonymJobLeaseMs
      });
      const batch = pendingMappings.slice(start, start + mappingWriteBatchSize);
      await MongoDatasetSynonymMapping.bulkWrite(
        batch.map((mapping) => ({
          updateOne: {
            filter: {
              teamId,
              datasetId,
              fileVersion: nextFileVersion,
              normalizedStandardizedTerm: mapping.normalizedStandardizedTerm
            },
            update: {
              $setOnInsert: {
                logicalMappingId: mapping.logicalMappingId,
                teamId,
                datasetId,
                synonymFileId,
                fileVersion: nextFileVersion,
                standardizedTerm: mapping.standardizedTerm,
                normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
                synonymTerms: mapping.synonymTerms,
                normalizedSynonymTerms: mapping.normalizedSynonymTerms,
                allTerms: mapping.allTerms,
                fingerprint: mapping.fingerprint,
                jobId: String(jobId),
                source: DatasetSynonymMappingSourceEnum.job,
                createTime: now,
                updateTime: now
              }
            },
            upsert: true
          }
        })),
        { ordered: true }
      );
    }

    const writtenCount = await MongoDatasetSynonymMapping.countDocuments({
      teamId,
      datasetId,
      fileVersion: nextFileVersion
    });
    if (writtenCount !== pendingMappings.length) {
      throw new Error('同义词 pending mapping 快照校验失败');
    }

    await MongoDatasetSynonymJob.updateOne(
      { _id: jobId, status: DatasetSynonymJobStatusEnum.diffing },
      {
        $set: {
          status: DatasetSynonymJobStatusEnum.marking,
          snapshotReady: true,
          updateTime: new Date()
        }
      }
    );
    invalidateDatasetSynonymMatcherCache({ teamId, datasetId });

    if (!synonymId || !fileVersion) {
      throw new Error('同义词版本创建结果不完整');
    }

    return {
      synonymId,
      fileName: file?.fileName ?? '',
      size: file?.size ?? 0,
      uploadTime: file?.uploadTime ?? now,
      jobId: String(jobId),
      fileVersion,
      diffSummary
    };
  } catch (error) {
    if (fileVersion) {
      await MongoDatasetSynonymMapping.deleteMany({ teamId, datasetId, fileVersion }).catch(
        () => {}
      );
    }
    if (synonymId) {
      await MongoDatasetSynonym.updateOne(
        { _id: synonymId, pendingVersion: fileVersion },
        {
          $unset: {
            pendingVersion: '',
            pendingFileName: '',
            pendingSize: '',
            pendingUploaderId: '',
            pendingUploadTime: ''
          },
          $set: { updateTime: new Date() }
        }
      ).catch(() => {});
    }
    await MongoDatasetSynonymJob.updateOne(
      { _id: jobId, isActive: true },
      {
        $set: {
          status: DatasetSynonymJobStatusEnum.failed,
          errorMsg: error instanceof Error ? error.message : String(error),
          updateTime: new Date(),
          finishTime: new Date()
        },
        $unset: { isActive: '' }
      }
    ).catch(() => {});
    await releaseDatasetMutationLock({
      teamId,
      datasetId,
      ownerId,
      fencingToken: lock.fencingToken
    }).catch(() => {});
    throw error;
  }
};

const isDataAffected = ({
  data,
  activeTransform,
  pendingTransform
}: {
  data: { q?: string; a?: string; indexes: Array<{ type: string; text: string }> };
  activeTransform: (text: string) => string;
  pendingTransform: (text: string) => string;
}) => {
  const texts = [
    data.q ?? '',
    data.a ?? '',
    ...data.indexes
      .filter((index) => index.type !== DatasetDataIndexTypeEnum.imageEmbedding)
      .map((index) => index.text)
  ];
  return texts.some((text) => activeTransform(text) !== pendingTransform(text));
};

/**
 * 扫描并标记一个游标批次。粗筛只影响性能，最终始终比较 active/pending 派生文本，
 * 因而不会为 Mongo regex 的误命中产生 embedding 费用。
 */
export const markNextDatasetSynonymBatch = async (jobId: string) => {
  const job = await MongoDatasetSynonymJob.findOne({
    _id: jobId,
    status: DatasetSynonymJobStatusEnum.marking
  }).lean();
  if (!job) return { done: true };

  const teamId = String(job.teamId);
  const datasetId = String(job.datasetId);
  const ownerId = `synonym:${job._id}`;
  await renewDatasetMutationLock({
    teamId,
    datasetId,
    ownerId,
    fencingToken: job.fencingToken,
    leaseMs: synonymJobLeaseMs
  });

  const config = await MongoDatasetSynonym.findOne({
    _id: job.synonymFileId,
    pendingVersion: job.fileVersion
  }).lean();
  if (!config) throw new Error('同义词 pending 配置不存在');

  const [activeMatcher, pendingMatcher] = await Promise.all([
    config.activeVersion > 0
      ? getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: config.activeVersion })
      : undefined,
    getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: job.fileVersion })
  ]);
  const activeTransform = (text: string) => activeMatcher?.transform(text).transformedText ?? text;
  const pendingTransform = (text: string) => pendingMatcher.transform(text).transformedText;
  const dataList = await MongoDatasetData.find({
    teamId,
    datasetId,
    ...(job.markingCursor ? { _id: { $gt: job.markingCursor } } : {})
  })
    .sort({ _id: 1 })
    .limit(dataScanBatchSize)
    .select({ _id: 1, collectionId: 1, q: 1, a: 1, indexes: 1 })
    .lean();

  const affectedData = dataList.filter((data) =>
    isDataAffected({ data, activeTransform, pendingTransform })
  );
  const mode =
    job.type === DatasetSynonymJobTypeEnum.delete
      ? TrainingModeEnum.synonymRestore
      : TrainingModeEnum.synonymStandardize;

  if (affectedData.length > 0) {
    await MongoDatasetTraining.bulkWrite(
      affectedData.map((data) => ({
        updateOne: {
          filter: {
            'dataMetadata.synonymJobId': job._id,
            dataId: data._id,
            mode
          },
          update: {
            $setOnInsert: {
              teamId: job.teamId,
              tmbId: job.tmbId,
              datasetId: job.datasetId,
              collectionId: data.collectionId,
              billId: job.billId,
              mode,
              dataId: data._id,
              q: '',
              a: '',
              chunkIndex: 0,
              weight: 0,
              indexes: [],
              retryCount: 5,
              lockTime: new Date(0),
              expireAt: new Date(),
              dataMetadata: {
                synonymJobId: job._id,
                fileVersion: job.fileVersion,
                fencingToken: job.fencingToken,
                synonymFileId: job.synonymFileId,
                affectedLogicalMappingIds: job.affectedLogicalMappingIds
              }
            }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );
  }

  const lastDataId = dataList.at(-1)?._id;
  await MongoDatasetSynonymJob.updateOne(
    { _id: job._id, status: DatasetSynonymJobStatusEnum.marking },
    {
      ...(lastDataId ? { $set: { markingCursor: lastDataId, updateTime: new Date() } } : {}),
      $inc: {
        'diffSummary.scannedDataCount': dataList.length,
        'diffSummary.affectedDataCount': affectedData.length
      }
    }
  );

  if (dataList.length === dataScanBatchSize) return { done: false };

  const taskCount = await MongoDatasetTraining.countDocuments({
    'dataMetadata.synonymJobId': job._id,
    mode
  });
  await MongoDatasetSynonymJob.updateOne(
    { _id: job._id, status: DatasetSynonymJobStatusEnum.marking },
    {
      $set: {
        status: DatasetSynonymJobStatusEnum.processing,
        'diffSummary.affectedDataCount': taskCount,
        updateTime: new Date()
      }
    }
  );
  if (taskCount === 0) await activateDatasetSynonymVersion(String(job._id));
  return { done: true };
};

/** marking 阶段尚无向量写入；失败保留完整快照供 Mongo retry，主动取消才删除。 */
export const failDatasetSynonymJobBeforeProcessing = async ({
  jobId,
  error,
  finalStatus = DatasetSynonymJobStatusEnum.failed
}: {
  jobId: string;
  error: unknown;
  finalStatus?: DatasetSynonymJobStatusEnum.failed | DatasetSynonymJobStatusEnum.cancelled;
}) => {
  const job = await MongoDatasetSynonymJob.findOne({
    _id: jobId,
    status: {
      $in: [
        DatasetSynonymJobStatusEnum.pending,
        DatasetSynonymJobStatusEnum.diffing,
        DatasetSynonymJobStatusEnum.marking
      ]
    }
  }).lean();
  if (!job) return false;

  await mongoSessionRun(async (session) => {
    await MongoDatasetTraining.deleteMany({ 'dataMetadata.synonymJobId': job._id }, { session });
    if (finalStatus === DatasetSynonymJobStatusEnum.cancelled) {
      await MongoDatasetSynonymMapping.deleteMany(
        { jobId: job._id, fileVersion: job.fileVersion },
        { session }
      );
    }
    await MongoDatasetSynonym.updateOne(
      { _id: job.synonymFileId, pendingVersion: job.fileVersion },
      {
        $unset: {
          pendingVersion: '',
          pendingFileName: '',
          pendingSize: '',
          pendingUploaderId: '',
          pendingUploadTime: ''
        },
        $set: { updateTime: new Date() }
      },
      { session }
    );
    await MongoDatasetSynonymJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: finalStatus,
          errorMsg: error instanceof Error ? error.message : String(error),
          updateTime: new Date(),
          finishTime: new Date()
        },
        $unset: { isActive: '' }
      },
      { session }
    );
  });

  await releaseDatasetMutationLock({
    teamId: String(job.teamId),
    datasetId: String(job.datasetId),
    ownerId: `synonym:${job._id}`,
    fencingToken: job.fencingToken
  }).catch(() => {});
  invalidateDatasetSynonymMatcherCache({
    teamId: String(job.teamId),
    datasetId: String(job.datasetId)
  });
  return true;
};

/** 取消尚未产生向量写入的任务；processing/rollback 必须由补偿状态机收敛。 */
export const cancelDatasetSynonymJob = async (jobId: string) => {
  const cancelled = await failDatasetSynonymJobBeforeProcessing({
    jobId,
    error: new Error('用户取消任务'),
    finalStatus: DatasetSynonymJobStatusEnum.cancelled
  });
  if (!cancelled) throw new Error('任务已进入索引处理阶段，不能直接取消');
};

/** 持续处理单个 job 的 marking 游标；重复调用会因状态条件自然幂等退出。 */
export const processDatasetSynonymMarkingJob = async (jobId: string) => {
  try {
    while (true) {
      const { done } = await markNextDatasetSynonymBatch(jobId);
      if (done) return;
    }
  } catch (error) {
    await failDatasetSynonymJobBeforeProcessing({ jobId, error });
  }
};

/** 进程启动恢复所有 marking job，避免 API 提交后进程退出造成任务永久停滞。 */
export const resumeDatasetSynonymMarkingJobs = async () => {
  const jobs = await MongoDatasetSynonymJob.find({
    status: DatasetSynonymJobStatusEnum.marking
  })
    .select({ _id: 1 })
    .lean();
  await Promise.all(jobs.map((job) => processDatasetSynonymMarkingJob(String(job._id))));
};

/**
 * 幂等清理已退休的 mapping 快照。只有当该 job 的训练任务和
 * operation 全部收敛，且资源不再是 active/pending 时才删除；失败时保留上下文供启动恢复。
 */
export const cleanupRetiredDatasetSynonymVersion = async (jobId: string) => {
  const job = await MongoDatasetSynonymJob.findOne({
    _id: jobId,
    status: DatasetSynonymJobStatusEnum.completed,
    cleanupPending: true
  }).lean();
  if (!job) return true;

  try {
    const [remainingTraining, remainingOperation, config] = await Promise.all([
      MongoDatasetTraining.exists({ 'dataMetadata.synonymJobId': job._id }),
      MongoDatasetSynonymOperation.exists({
        jobId: job._id,
        status: { $ne: DatasetSynonymOperationStatusEnum.completed }
      }),
      MongoDatasetSynonym.findOne({ teamId: job.teamId, datasetId: job.datasetId }).lean()
    ]);
    if (remainingTraining || remainingOperation) return false;

    const retiredVersionIsReferenced =
      !!job.retiredVersion &&
      (config?.activeVersion === job.retiredVersion ||
        config?.pendingVersion === job.retiredVersion);
    if (retiredVersionIsReferenced) return false;

    if (job.retiredVersion) {
      await MongoDatasetSynonymMapping.deleteMany({
        teamId: job.teamId,
        datasetId: job.datasetId,
        fileVersion: job.retiredVersion
      });
    }
    await MongoDatasetSynonymJob.updateOne(
      { _id: job._id, cleanupPending: true },
      {
        $unset: {
          cleanupPending: '',
          retiredVersion: '',
          cleanupError: ''
        },
        $set: { updateTime: new Date() }
      }
    );
    invalidateDatasetSynonymMatcherCache({
      teamId: String(job.teamId),
      datasetId: String(job.datasetId)
    });
    return true;
  } catch (error) {
    await MongoDatasetSynonymJob.updateOne(
      { _id: job._id, cleanupPending: true },
      {
        $set: {
          cleanupError: error instanceof Error ? error.message : String(error),
          updateTime: new Date()
        }
      }
    ).catch(() => {});
    return false;
  }
};

/** 进程启动时重试上次未完成的退休资源清理。 */
export const resumeRetiredDatasetSynonymCleanup = async () => {
  let cursor: string | undefined;
  while (true) {
    const jobs = await MongoDatasetSynonymJob.find({
      status: DatasetSynonymJobStatusEnum.completed,
      cleanupPending: true,
      ...(cursor ? { _id: { $gt: cursor } } : {})
    })
      .sort({ _id: 1 })
      .limit(100)
      .select({ _id: 1 })
      .lean();
    await Promise.all(jobs.map((job) => cleanupRetiredDatasetSynonymVersion(String(job._id))));
    if (jobs.length < 100) return;
    cursor = jobs.at(-1)?._id;
  }
};

/** 在同一 fencing token 下原子提升 pendingVersion，并释放知识库写锁。 */
export const activateDatasetSynonymVersion = async (jobId: string) => {
  const job = await MongoDatasetSynonymJob.findOne({
    _id: jobId,
    status: DatasetSynonymJobStatusEnum.processing
  }).lean();
  if (!job) return;
  const teamId = String(job.teamId);
  const datasetId = String(job.datasetId);
  const ownerId = `synonym:${job._id}`;

  await mongoSessionRun(async (session) => {
    await assertDatasetMutationLock({
      teamId,
      datasetId,
      ownerId,
      fencingToken: job.fencingToken,
      session
    });
    const config = await MongoDatasetSynonym.findOne({
      _id: job.synonymFileId,
      pendingVersion: job.fileVersion
    })
      .session(session)
      .lean();
    if (!config) throw new Error('同义词 pending 配置已变化');

    const isDelete = job.type === DatasetSynonymJobTypeEnum.delete;
    const retiredVersion = config.activeVersion > 0 ? config.activeVersion : undefined;
    await MongoDatasetSynonym.updateOne(
      { _id: config._id, pendingVersion: job.fileVersion },
      {
        $set: {
          activeVersion: isDelete ? 0 : job.fileVersion,
          ...(isDelete
            ? {}
            : {
                fileName: config.pendingFileName,
                size: config.pendingSize,
                uploaderId: config.pendingUploaderId,
                uploadTime: config.pendingUploadTime
              }),
          updateTime: new Date()
        },
        $unset: {
          ...(isDelete ? { fileName: '', size: '', uploaderId: '', uploadTime: '' } : {}),
          pendingVersion: '',
          pendingFileName: '',
          pendingSize: '',
          pendingUploaderId: '',
          pendingUploadTime: ''
        }
      },
      { session }
    );
    await MongoDatasetSynonymJob.updateOne(
      { _id: job._id, status: DatasetSynonymJobStatusEnum.processing },
      {
        $set: {
          status: DatasetSynonymJobStatusEnum.completed,
          ...(retiredVersion
            ? {
                cleanupPending: true,
                retiredVersion
              }
            : {}),
          updateTime: new Date(),
          finishTime: new Date()
        },
        $unset: { isActive: '' }
      },
      { session }
    );
  });

  await releaseDatasetMutationLock({
    teamId,
    datasetId,
    ownerId,
    fencingToken: job.fencingToken
  });
  invalidateDatasetSynonymMatcherCache({ teamId, datasetId });
  await cleanupRetiredDatasetSynonymVersion(jobId);
};

/**
 * 正向任务失败后只为已经切到 pendingVersion（删除任务则为 0）的数据创建恢复任务。
 * activeVersion 从未提前切换，因此 rollback 的目标始终可从 config.activeVersion 读取。
 */
export const startDatasetSynonymRollback = async ({
  jobId,
  error
}: {
  jobId: string;
  error: unknown;
}) => {
  const job = await MongoDatasetSynonymJob.findOneAndUpdate(
    { _id: jobId, status: DatasetSynonymJobStatusEnum.processing },
    {
      $set: {
        status: DatasetSynonymJobStatusEnum.rollingBack,
        errorMsg: error instanceof Error ? error.message : String(error),
        updateTime: new Date()
      },
      $inc: { 'diffSummary.failedDataCount': 1 }
    },
    { new: true }
  ).lean();
  if (!job) return;

  await MongoDatasetTraining.deleteMany({ 'dataMetadata.synonymJobId': job._id });
  const committedVersion = job.type === DatasetSynonymJobTypeEnum.delete ? 0 : job.fileVersion;
  const dataList = await MongoDatasetData.find({
    teamId: job.teamId,
    datasetId: job.datasetId,
    synonymIndexVersion: committedVersion
  })
    .select({ _id: 1, collectionId: 1 })
    .lean();

  if (dataList.length > 0) {
    await MongoDatasetTraining.bulkWrite(
      dataList.map((data) => ({
        updateOne: {
          filter: {
            'dataMetadata.synonymJobId': job._id,
            dataId: data._id,
            mode: TrainingModeEnum.synonymRestore
          },
          update: {
            $setOnInsert: {
              teamId: job.teamId,
              tmbId: job.tmbId,
              datasetId: job.datasetId,
              collectionId: data.collectionId,
              billId: job.billId,
              mode: TrainingModeEnum.synonymRestore,
              dataId: data._id,
              q: '',
              a: '',
              chunkIndex: 0,
              weight: 0,
              indexes: [],
              retryCount: 50,
              lockTime: new Date(0),
              expireAt: new Date(),
              dataMetadata: {
                synonymJobId: job._id,
                fileVersion: job.fileVersion,
                fencingToken: job.fencingToken,
                synonymFileId: job.synonymFileId,
                affectedLogicalMappingIds: job.affectedLogicalMappingIds
              }
            }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );
  } else {
    await finishDatasetSynonymRollback(String(job._id));
  }
};

/** rollback 收敛后清理 pending 上下文，activeVersion 始终保持原值。 */
export const finishDatasetSynonymRollback = async (jobId: string) => {
  const job = await MongoDatasetSynonymJob.findOne({
    _id: jobId,
    status: DatasetSynonymJobStatusEnum.rollingBack
  }).lean();
  if (!job) return;
  const remaining = await MongoDatasetTraining.exists({
    'dataMetadata.synonymJobId': job._id
  });
  if (remaining) return;

  await mongoSessionRun(async (session) => {
    await assertDatasetMutationLock({
      teamId: String(job.teamId),
      datasetId: String(job.datasetId),
      ownerId: `synonym:${job._id}`,
      fencingToken: job.fencingToken,
      session
    });
    await MongoDatasetSynonym.updateOne(
      { _id: job.synonymFileId, pendingVersion: job.fileVersion },
      {
        $unset: {
          pendingVersion: '',
          pendingFileName: '',
          pendingSize: '',
          pendingUploaderId: '',
          pendingUploadTime: ''
        },
        $set: { updateTime: new Date() }
      },
      { session }
    );
    await MongoDatasetSynonymJob.updateOne(
      { _id: job._id, status: DatasetSynonymJobStatusEnum.rollingBack },
      {
        $set: {
          status: DatasetSynonymJobStatusEnum.failed,
          updateTime: new Date(),
          finishTime: new Date()
        },
        $unset: { isActive: '' }
      },
      { session }
    );
  });
  await releaseDatasetMutationLock({
    teamId: String(job.teamId),
    datasetId: String(job.datasetId),
    ownerId: `synonym:${job._id}`,
    fencingToken: job.fencingToken
  });
  invalidateDatasetSynonymMatcherCache({
    teamId: String(job.teamId),
    datasetId: String(job.datasetId)
  });
};

/** 获取配置和最近任务，供管理页轮询。 */
export const getDatasetSynonymDetail = async ({
  teamId,
  datasetId
}: {
  teamId: string;
  datasetId: string;
}) => {
  const [file, currentJob] = await Promise.all([
    MongoDatasetSynonym.findOne({ teamId, datasetId }).lean(),
    MongoDatasetSynonymJob.findOne({ teamId, datasetId }).sort({ createTime: -1 }).lean()
  ]);
  assertDatasetSynonymConfigMigrated(file);
  return {
    file: file?.activeVersion ? file : undefined,
    currentJob: currentJob ?? undefined
  };
};

/** 分页搜索 activeVersion mappings；关键词只用于管理检索，不参与召回语义。 */
export const searchDatasetSynonymMappings = async ({
  teamId,
  datasetId,
  search,
  pageNum,
  pageSize
}: {
  teamId: string;
  datasetId: string;
  search?: string;
  pageNum: number;
  pageSize: number;
}) => {
  const config = await MongoDatasetSynonym.findOne({ teamId, datasetId }).lean();
  assertDatasetSynonymConfigMigrated(config);
  if (!config?.activeVersion) return { total: 0, list: [] };
  const escapedSearch = search?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = {
    teamId,
    datasetId,
    fileVersion: config.activeVersion,
    ...(escapedSearch ? { allTerms: { $regex: escapedSearch, $options: 'i' } } : {})
  };
  const [total, list] = await Promise.all([
    MongoDatasetSynonymMapping.countDocuments(match),
    MongoDatasetSynonymMapping.find(match)
      .sort({ normalizedStandardizedTerm: 1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);
  return { total, list };
};
