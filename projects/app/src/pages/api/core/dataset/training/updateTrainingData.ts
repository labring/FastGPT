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
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';

/** 重试训练任务；首次训练允许编辑正文，rebuild 只重试已存索引。 */
async function handler(req: ApiRequestProps): Promise<UpdateTrainingDataResponse> {
  const body = parseApiInput({ req, bodySchema: UpdateTrainingDataBodySchema }).body;

  // 不传 dataId 时是批量重试：collectionId 和 datasetId 分别限定不同的重试范围。
  if (!body.dataId) {
    const { retryMatch, retryTeamId, tmbId, datasetName, collectionName } = await (async () => {
      if (body.collectionId) {
        const { collection, teamId, tmbId } = await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: body.collectionId,
          per: WritePermissionVal
        });

        return {
          retryMatch: {
            teamId: collection.teamId,
            datasetId: collection.datasetId,
            collectionId: collection._id
          },
          retryTeamId: String(teamId),
          tmbId,
          datasetName: collection.dataset.name,
          collectionName: collection.name as string | undefined
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
        retryMatch: {
          teamId,
          datasetId: dataset._id
        },
        retryTeamId: String(teamId),
        tmbId,
        datasetName: dataset.name,
        collectionName: undefined
      };
    })();

    await retryFailedTrainingTasks(retryMatch);

    // 审计只记录已发起的重试操作，不统计实际命中条数（需改造重试函数返回值，超出审计范围）。
    // 重试粒度由请求参数决定：带 collectionId 是集合级，否则是知识库级。
    if (body.collectionId) {
      addAuditLog({
        tmbId,
        teamId: retryTeamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TRAINING_RETRY,
        params: {
          datasetName,
          collectionName: collectionName!
        }
      });
    } else {
      addAuditLog({
        tmbId,
        teamId: retryTeamId,
        event: DatasetAuditEventEnum.DATASET_TRAINING_RETRY,
        params: {
          datasetName
        }
      });
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

  const readyUpdate = getTrainingTaskReadyUpdate();
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
          ...(chunkIndex !== undefined && { chunkIndex })
        }
      },
      { session }
    );
  });

  // 单条重试写入独立事件：它只影响一个分块，与批量重试分开统计。
  addAuditLog({
    tmbId,
    teamId: String(collection.teamId),
    event: DatasetAuditEventEnum.DATASET_TRAINING_TASK_RETRY,
    params: {
      datasetName: collection.dataset?.name ?? '',
      collectionName: collection.name
    }
  });

  return UpdateTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);

export { handler };
