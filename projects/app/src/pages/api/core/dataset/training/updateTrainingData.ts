import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  getDatasetIndexTrainingMode,
  retryFailedTrainingTasks
} from '@fastgpt/service/core/dataset/training/service';
import {
  UpdateTrainingDataBodySchema,
  UpdateTrainingDataResponseSchema,
  type UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getTrainingDataIndexStatuses,
  getTrainingTaskReadyUpdate
} from '@fastgpt/service/core/dataset/training/utils';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { finalErrorTrainingMatch } from '@fastgpt/service/core/dataset/training/query';
import { addAuditLog, failAuditLogByTaskId } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { randomUUID } from 'node:crypto';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET);

/** 重试训练任务；首次训练允许编辑正文，rebuild 只重试已存索引。 */
async function handler(req: ApiRequestProps): Promise<UpdateTrainingDataResponse> {
  const body = parseApiInput({ req, bodySchema: UpdateTrainingDataBodySchema }).body;

  // 不传 dataId 时是批量重试：collectionId 和 datasetId 分别限定不同的重试范围。
  if (!body.dataId) {
    const retryMatch = await (async () => {
      if (body.collectionId) {
        const { collection, teamId, tmbId } = await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: body.collectionId,
          per: WritePermissionVal
        });

        return {
          teamId,
          tmbId,
          datasetId: collection.datasetId,
          collectionId: collection._id,
          datasetName: collection.dataset.name,
          collectionName: collection.name
        };
      }

      const { teamId, tmbId, dataset } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        datasetId: body.datasetId!,
        per: WritePermissionVal
      });

      return {
        teamId,
        tmbId,
        datasetId: dataset._id,
        datasetName: dataset.name,
        collectionName: undefined
      };
    })();

    const auditTaskId = randomUUID();
    const retryCount = await MongoDatasetTraining.countDocuments({
      teamId: retryMatch.teamId,
      datasetId: retryMatch.datasetId,
      ...(retryMatch.collectionId ? { collectionId: retryMatch.collectionId } : {}),
      ...finalErrorTrainingMatch
    });

    await addAuditLog({
      teamId: retryMatch.teamId,
      tmbId: retryMatch.tmbId,
      event: AuditEventEnum.RETRY_TRAINING,
      params: {
        datasetId: String(retryMatch.datasetId),
        datasetName: retryMatch.datasetName,
        ...(retryMatch.collectionName ? { collectionName: retryMatch.collectionName } : {}),
        count: String(retryCount),
        taskId: auditTaskId,
        result: retryCount === 0 ? 'success' : 'processing'
      }
    });

    try {
      await retryFailedTrainingTasks({
        teamId: retryMatch.teamId,
        datasetId: retryMatch.datasetId,
        ...(retryMatch.collectionId ? { collectionId: retryMatch.collectionId } : {}),
        auditTaskId
      });
      await refreshTrainingAuditTask(auditTaskId);
    } catch (error) {
      await failAuditLogByTaskId({
        teamId: retryMatch.teamId,
        taskId: auditTaskId,
        scope: 'member',
        event: AuditEventEnum.RETRY_TRAINING,
        failureReason: getErrText(error)
      }).catch((auditError) => {
        logger.error('Batch training retry audit failure update failed', {
          error: auditError,
          teamId: retryMatch.teamId,
          auditTaskId
        });
      });
      throw error;
    }

    return UpdateTrainingDataResponseSchema.parse(undefined);
  }

  const { q, a, chunkIndex } = body;
  // 单条重试只信任 dataId 找到的训练记录，再用记录所属 collection 做权限校验。
  const data = await MongoDatasetTraining.findById(body.dataId);

  if (!data) {
    return Promise.reject('data not found');
  }

  const { collection, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: data.collectionId,
    per: WritePermissionVal
  });

  if (
    String(collection.teamId) !== String(data.teamId) ||
    String(collection.datasetId) !== String(data.datasetId) ||
    String(collection._id) !== String(data.collectionId)
  ) {
    return Promise.reject('data not found');
  }

  if (
    [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(data.mode) &&
    (q !== undefined || a !== undefined || chunkIndex !== undefined)
  ) {
    return Promise.reject('重建任务不支持编辑正文');
  }

  const trainingMatch = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    _id: data._id
  };

  // 只有补充图片解析结果才跳过当前阶段；重试 index 必须保留其原阶段。
  const nextMode =
    data.mode === TrainingModeEnum.imageParse && data.imageId && q
      ? await getDatasetIndexTrainingMode(data)
      : undefined;

  const auditTaskId = randomUUID();

  await addAuditLog({
    teamId: String(collection.teamId),
    tmbId,
    event: AuditEventEnum.RETRY_TRAINING,
    params: {
      datasetId: String(collection.datasetId),
      datasetName: collection.dataset.name,
      collectionName: collection.name,
      count: '1',
      taskId: auditTaskId,
      result: 'processing',
      details: [
        {
          resourceId: String(data._id),
          resourceName: collection.name,
          resourceType: 'training_record',
          action: 'retry',
          result: 'processing'
        }
      ]
    }
  });

  const readyUpdate = getTrainingTaskReadyUpdate();
  try {
    await mongoSessionRun(async (session) => {
      if (data.dataId) {
        await MongoDatasetData.updateOne(
          {
            _id: data.dataId,
            teamId: data.teamId,
            datasetId: data.datasetId,
            collectionId: data.collectionId,
            indexStatus: getTrainingDataIndexStatuses(data.mode).failed
          },
          {
            $set: {
              indexStatus: getTrainingDataIndexStatuses(data.mode).running
            },
            $unset: { indexErrorMsg: '' }
          },
          { session }
        );
      }

      await MongoDatasetTraining.updateOne(
        trainingMatch,
        {
          ...readyUpdate,
          $set: {
            ...readyUpdate.$set,
            ...(nextMode && { mode: nextMode }),
            ...(q !== undefined && { q }),
            ...(a !== undefined && { a }),
            ...(chunkIndex !== undefined && { chunkIndex }),
            auditTaskId
          }
        },
        { session }
      );
    });
    await refreshTrainingAuditTask(auditTaskId);
  } catch (error) {
    await failAuditLogByTaskId({
      teamId: String(collection.teamId),
      taskId: auditTaskId,
      scope: 'member',
      event: AuditEventEnum.RETRY_TRAINING,
      failureReason: getErrText(error)
    }).catch((auditError) => {
      logger.error('Training retry audit failure update failed', {
        error: auditError,
        teamId: String(collection.teamId),
        auditTaskId
      });
    });
    throw error;
  }

  return UpdateTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);

export { handler };
