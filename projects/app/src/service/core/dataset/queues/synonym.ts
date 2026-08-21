import { addMinutes } from 'date-fns';
import { DatasetTrainingSynonymMetadataSchema } from '@fastgpt/global/core/dataset/type';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  DatasetSynonymJobStatusEnum,
  DatasetSynonymOperationStatusEnum
} from '@fastgpt/global/core/dataset/synonym';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  MongoDatasetSynonymJob,
  MongoDatasetSynonymOperation
} from '@fastgpt/service/core/dataset/synonym/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  assertDatasetMutationLock,
  renewDatasetMutationLock
} from '@fastgpt/service/core/dataset/mutationLock/service';
import {
  activateDatasetSynonymVersion,
  finishDatasetSynonymRollback,
  startDatasetSynonymRollback
} from '@fastgpt/service/core/dataset/synonym/controller';
import { updateDatasetDataByIndexes } from '@/service/core/dataset/data/data';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import { getMaxIndexSize } from '@fastgpt/global/core/dataset/training/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { checkTeamAiPointsAndLock } from '../queues/utils';
import { getDatasetSynonymConfig } from '@fastgpt/service/core/dataset/synonym/entity';
import { deleteDatasetDataVector } from '@fastgpt/service/common/vectorDB/controller';
import { isSynonymOperationMongoCommitted } from '@fastgpt/service/core/dataset/synonym/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.EMBEDDING);
const synonymLeaseMs = 5 * 60_000;
let synonymQueueRunning = false;

/**
 * 对账已失去训练任务的 operation。rollback 会删除正向训练任务，但已发生的 embedding
 * 仍需计费，且 Mongo 提交前后的新/旧孤儿向量都必须继续补偿清理。
 */
export const reconcileOrphanDatasetSynonymOperations = async () => {
  const operations = await MongoDatasetSynonymOperation.find({
    status: {
      $in: [
        DatasetSynonymOperationStatusEnum.prepared,
        DatasetSynonymOperationStatusEnum.vectorsPrepared,
        DatasetSynonymOperationStatusEnum.mongoCommitted
      ]
    }
  })
    .sort({ updateTime: 1 })
    .limit(100)
    .lean();

  for (const operation of operations) {
    if (await MongoDatasetTraining.exists({ _id: operation.trainingId })) continue;

    try {
      const [job, dataset, data] = await Promise.all([
        MongoDatasetSynonymJob.findById(operation.jobId).lean(),
        MongoDataset.findById(operation.datasetId).lean(),
        MongoDatasetData.findById(operation.dataId).lean()
      ]);
      if (!job || !dataset) throw new Error('同义词补偿上下文不存在');

      const mongoCommitted =
        operation.status === DatasetSynonymOperationStatusEnum.mongoCommitted ||
        (operation.status === DatasetSynonymOperationStatusEnum.vectorsPrepared &&
          !!data &&
          isSynonymOperationMongoCommitted({
            currentVersion: data.synonymIndexVersion ?? 0,
            targetVersion: operation.targetVersion,
            currentVectorIds: data.indexes.map((index) => index.dataId),
            insertedVectorIds: operation.insertedVectorIds
          }));
      const cleanupVectorIds = mongoCommitted
        ? operation.obsoleteVectorIds
        : operation.insertedVectorIds;

      if (operation.inputTokens > 0) {
        const { success } = await pushGenerateVectorUsage({
          teamId: String(operation.teamId),
          tmbId: String(job.tmbId),
          inputTokens: operation.inputTokens,
          model: dataset.vectorModel,
          usageId: String(job.billId),
          operationId: `${operation.operationId}:embedding:${operation.attempt}`
        });
        if (!success) throw new Error('同义词 embedding 补偿计费提交失败');
      }

      await deleteDatasetDataVector({
        teamId: String(operation.teamId),
        idList: cleanupVectorIds
      });
      await MongoDatasetSynonymOperation.updateOne(
        {
          _id: operation._id,
          status: operation.status
        },
        {
          $set: {
            status: DatasetSynonymOperationStatusEnum.completed,
            updateTime: new Date()
          },
          $unset: { errorMsg: '' }
        }
      );
    } catch (error) {
      await MongoDatasetSynonymOperation.updateOne(
        { _id: operation._id, status: operation.status },
        {
          $set: {
            errorMsg: getErrText(error, 'unknown error'),
            updateTime: new Date()
          }
        }
      );
      logger.error('Orphan synonym operation reconciliation failed', {
        error,
        operationId: operation.operationId
      });
    }
  }
};

/**
 * 顺序消费同义词训练任务。单 worker 降低同一 job 完成态竞争；跨进程仍依靠 training
 * claim、job 状态和 fencing token 保证幂等。
 */
export const generateSynonymIndexes = async () => {
  if (synonymQueueRunning) return;
  synonymQueueRunning = true;
  try {
    await reconcileOrphanDatasetSynonymOperations();
    while (true) {
      const task = await MongoDatasetTraining.findOneAndUpdate(
        {
          mode: {
            $in: [TrainingModeEnum.synonymStandardize, TrainingModeEnum.synonymRestore]
          },
          retryCount: { $gt: 0 },
          lockTime: { $lte: addMinutes(new Date(), -10) }
        },
        { $set: { lockTime: new Date() }, $inc: { retryCount: -1 } },
        { new: true }
      ).lean();
      if (!task) {
        await reconcileOrphanDatasetSynonymOperations();
        return;
      }

      const metadataResult = DatasetTrainingSynonymMetadataSchema.safeParse(task.dataMetadata);
      if (!metadataResult.success || !task.dataId) {
        await MongoDatasetTraining.deleteOne({ _id: task._id });
        continue;
      }
      const metadata = metadataResult.data;
      const job = await MongoDatasetSynonymJob.findById(metadata.synonymJobId).lean();
      const expectedStatus =
        task.mode === TrainingModeEnum.synonymRestore &&
        job?.status === DatasetSynonymJobStatusEnum.rollingBack
          ? DatasetSynonymJobStatusEnum.rollingBack
          : DatasetSynonymJobStatusEnum.processing;
      if (
        !job ||
        job.status !== expectedStatus ||
        job.fileVersion !== metadata.fileVersion ||
        job.fencingToken !== metadata.fencingToken
      ) {
        await MongoDatasetTraining.deleteOne({ _id: task._id });
        continue;
      }

      const ownerId = `synonym:${job._id}`;
      const teamId = String(job.teamId);
      const datasetId = String(job.datasetId);
      try {
        await renewDatasetMutationLock({
          teamId,
          datasetId,
          ownerId,
          fencingToken: job.fencingToken,
          leaseMs: synonymLeaseMs
        });
        if (!(await checkTeamAiPointsAndLock(teamId, String(task._id)))) continue;

        const [data, dataset, collection] = await Promise.all([
          MongoDatasetData.findById(task.dataId).lean(),
          MongoDataset.findById(datasetId).lean(),
          MongoDatasetCollection.findById(task.collectionId).lean()
        ]);
        if (!data || !dataset || !collection) {
          await MongoDatasetTraining.deleteOne({ _id: task._id });
          continue;
        }

        const config = await getDatasetSynonymConfig({ teamId, datasetId });
        const targetVersion =
          expectedStatus === DatasetSynonymJobStatusEnum.rollingBack
            ? (config?.activeVersion ?? 0)
            : task.mode === TrainingModeEnum.synonymRestore
              ? 0
              : job.fileVersion;
        const operationId = `${job._id}:${task.dataId}:${targetVersion}`;
        let operation = await MongoDatasetSynonymOperation.findOneAndUpdate(
          { operationId },
          {
            $setOnInsert: {
              operationId,
              teamId,
              datasetId,
              jobId: job._id,
              trainingId: task._id,
              dataId: task.dataId,
              targetVersion,
              status: DatasetSynonymOperationStatusEnum.prepared,
              attempt: 1,
              createTime: new Date(),
              updateTime: new Date()
            }
          },
          { new: true, upsert: true }
        ).lean();

        const commitUsage = async () => {
          if (!operation.inputTokens) return;
          const { success } = await pushGenerateVectorUsage({
            teamId,
            tmbId: String(job.tmbId),
            inputTokens: operation.inputTokens,
            model: dataset.vectorModel,
            usageId: String(job.billId),
            operationId: `${operationId}:embedding:${operation.attempt}`
          });
          if (!success) throw new Error('同义词 embedding 计费提交失败');
        };

        if (operation.status === DatasetSynonymOperationStatusEnum.vectorsPrepared) {
          const mongoAlreadyCommitted = isSynonymOperationMongoCommitted({
            currentVersion: data.synonymIndexVersion ?? 0,
            targetVersion,
            currentVectorIds: data.indexes.map((index) => index.dataId),
            insertedVectorIds: operation.insertedVectorIds
          });
          if (mongoAlreadyCommitted) {
            operation.status = DatasetSynonymOperationStatusEnum.mongoCommitted;
            await MongoDatasetSynonymOperation.updateOne(
              { operationId, status: DatasetSynonymOperationStatusEnum.vectorsPrepared },
              {
                $set: {
                  status: DatasetSynonymOperationStatusEnum.mongoCommitted,
                  updateTime: new Date()
                }
              }
            );
          } else {
            await commitUsage();
            await deleteDatasetDataVector({ teamId, idList: operation.insertedVectorIds });
            const resetOperation = await MongoDatasetSynonymOperation.findOneAndUpdate(
              { operationId, status: DatasetSynonymOperationStatusEnum.vectorsPrepared },
              {
                $set: {
                  status: DatasetSynonymOperationStatusEnum.prepared,
                  inputTokens: 0,
                  insertedVectorIds: [],
                  obsoleteVectorIds: [],
                  updateTime: new Date()
                },
                $inc: { attempt: 1 }
              },
              { new: true }
            ).lean();
            if (resetOperation) operation = resetOperation;
          }
        }

        if (operation.status === DatasetSynonymOperationStatusEnum.mongoCommitted) {
          await deleteDatasetDataVector({ teamId, idList: operation.obsoleteVectorIds });
          await commitUsage();
        } else if (operation.status !== DatasetSynonymOperationStatusEnum.completed) {
          const { tokens } = await updateDatasetDataByIndexes({
            dataId: String(data._id),
            q: data.q,
            a: data.a,
            imageId: data.imageId,
            indexes: data.indexes,
            model: dataset.vectorModel,
            indexSize: getMaxIndexSize(getEmbeddingModel(dataset.vectorModel)),
            indexPrefix: collection.indexPrefixTitle ? `# ${collection.name}` : undefined,
            imageIndex: !!collection.imageIndex,
            forceRebuild: false,
            synonymFileVersion: targetVersion,
            beforeCommit: async (session) => {
              await assertDatasetMutationLock({
                teamId,
                datasetId,
                ownerId,
                fencingToken: job.fencingToken,
                session
              });
            },
            onVectorsPrepared: async ({ tokens, insertedVectorIds, obsoleteVectorIds }) => {
              operation.inputTokens = tokens;
              operation.insertedVectorIds = insertedVectorIds;
              operation.obsoleteVectorIds = obsoleteVectorIds;
              await MongoDatasetSynonymOperation.updateOne(
                { operationId },
                {
                  $set: {
                    status: DatasetSynonymOperationStatusEnum.vectorsPrepared,
                    inputTokens: tokens,
                    insertedVectorIds,
                    obsoleteVectorIds,
                    updateTime: new Date()
                  }
                }
              );
            },
            onMongoCommitted: async () => {
              await MongoDatasetSynonymOperation.updateOne(
                { operationId },
                {
                  $set: {
                    status: DatasetSynonymOperationStatusEnum.mongoCommitted,
                    updateTime: new Date()
                  }
                }
              );
            }
          });
          operation.inputTokens = tokens;
          await commitUsage();
        }

        await MongoDatasetSynonymOperation.updateOne(
          { operationId },
          { $set: { status: DatasetSynonymOperationStatusEnum.completed, updateTime: new Date() } }
        );
        const deletedTask = await MongoDatasetTraining.deleteOne({ _id: task._id });
        if (deletedTask.deletedCount === 1) {
          await MongoDatasetSynonymJob.updateOne(
            { _id: job._id, status: expectedStatus },
            {
              $inc: { 'diffSummary.completedDataCount': 1 },
              $set: { updateTime: new Date() }
            }
          );
        }

        const remaining = await MongoDatasetTraining.exists({
          'dataMetadata.synonymJobId': job._id
        });
        if (!remaining) {
          if (expectedStatus === DatasetSynonymJobStatusEnum.rollingBack) {
            await finishDatasetSynonymRollback(String(job._id));
          } else {
            await activateDatasetSynonymVersion(String(job._id));
          }
        }
      } catch (error) {
        logger.error('Synonym index task failed', { error, taskId: task._id, jobId: job._id });
        await MongoDatasetTraining.updateOne(
          { _id: task._id },
          { $set: { errorMsg: getErrText(error, 'unknown error') } }
        );
        if (task.retryCount <= 0 && expectedStatus === DatasetSynonymJobStatusEnum.processing) {
          await startDatasetSynonymRollback({ jobId: String(job._id), error });
        }
      }
    }
  } finally {
    synonymQueueRunning = false;
  }
};
