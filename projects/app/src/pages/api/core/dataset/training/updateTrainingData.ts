import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  UpdateTrainingDataBodySchema,
  UpdateTrainingDataResponseSchema,
  type UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { finalErrorTrainingMatch } from '@fastgpt/service/core/dataset/training/query';
import { addAuditLog, failAuditLogByTaskId } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { randomUUID } from 'node:crypto';
import { refreshTrainingAuditTask } from '@fastgpt/service/core/dataset/training/audit';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET);

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
        datasetId: dataset._id,
        tmbId,
        datasetName: dataset.name,
        collectionName: undefined
      };
    })();

    const trainingMatch = {
      teamId: retryMatch.teamId,
      datasetId: retryMatch.datasetId,
      ...(retryMatch.collectionId ? { collectionId: retryMatch.collectionId } : {}),
      ...finalErrorTrainingMatch
    };
    const auditTaskId = randomUUID();
    // 只统计重试范围，不把全量失败训练记录物化到内存；失败项由收口逻辑按需追加到 details
    const retryCount = await MongoDatasetTraining.countDocuments(trainingMatch);

    // 先建立主审计记录，再释放训练任务；worker 可能在释放后立即完成并收口。
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
    }).catch((error) => {
      logger.warn('Batch training retry audit create failed', {
        error,
        teamId: retryMatch.teamId,
        auditTaskId
      });
    });

    try {
      await MongoDatasetTraining.updateMany(trainingMatch, {
        $unset: { errorMsg: '' },
        $set: { auditTaskId },
        retryCount: 3,
        lockTime: new Date('2000')
      });

      if (retryCount > 0) {
        await refreshTrainingAuditTask(auditTaskId);
      }
    } catch (error) {
      // 训练任务释放失败时，收口已创建的审计，避免零条重试的 success 或 processing 悬挂。
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

  const trainingMatch = {
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    _id: data._id
  };

  const auditTaskId = randomUUID();

  // 先建立主审计记录，再释放训练任务；worker 可能在释放后立即完成并收口。
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
  }).catch((error) => {
    logger.warn('Training retry audit create failed', {
      error,
      teamId: String(collection.teamId),
      auditTaskId
    });
  });

  try {
    // Add to chunk
    if (data.imageId && q) {
      await MongoDatasetTraining.updateOne(trainingMatch, {
        $unset: { errorMsg: '' },
        retryCount: 3,
        mode: TrainingModeEnum.chunk,
        ...(q !== undefined && { q }),
        ...(a !== undefined && { a }),
        ...(chunkIndex !== undefined && { chunkIndex }),
        lockTime: new Date('2000'),
        auditTaskId
      });
    } else {
      await MongoDatasetTraining.updateOne(trainingMatch, {
        $unset: { errorMsg: '' },
        retryCount: 3,
        ...(q !== undefined && { q }),
        ...(a !== undefined && { a }),
        ...(chunkIndex !== undefined && { chunkIndex }),
        lockTime: new Date('2000'),
        auditTaskId
      });
    }

    await refreshTrainingAuditTask(auditTaskId);
  } catch (error) {
    // 训练任务释放失败时，收口已创建的审计，避免单条 processing 悬挂。
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
