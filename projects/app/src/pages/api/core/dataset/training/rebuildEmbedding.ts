import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { OwnerPermissionVal, ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { assertModelAvailable, authModel } from '@fastgpt/service/support/permission/model/auth';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { pushCollectionUpdateJob } from '@fastgpt/service/core/dataset/collection/mq';

async function handler(req: ApiRequestProps): Promise<RebuildEmbeddingResponse> {
  const { datasetId, vectorModelId } = RebuildEmbeddingBodySchema.parse(req.body);

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  // check vector model
  if (!vectorModelId) {
    return Promise.reject(i18nT('common:core.dataset.error.vectorModelIdInvalid'));
  }
  if (dataset.vectorModelId === vectorModelId) {
    return Promise.reject(i18nT('common:core.dataset.error.vectorModelSame'));
  }
  const { model } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: vectorModelId,
    per: ReadPermissionVal,
    resourceContext: { datasetId }
  });
  assertModelAvailable(model, { type: ModelTypeEnum.embedding });

  // check rebuilding or training
  const [rebuilding, training] = await Promise.all([
    MongoDatasetData.findOne({ teamId, datasetId, rebuilding: true }),
    MongoDatasetTraining.findOne({ teamId, datasetId, retryCount: { $gt: 0 } })
  ]);

  if (rebuilding || training) {
    return Promise.reject('数据集正在训练或者重建中，请稍后再试');
  }

  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '切换向量模型',
    billSource: UsageSourceEnum.training,
    vectorModelId: dataset.vectorModelId,
    agentModelId: dataset.agentModelId,
    vlmModelId: dataset.vlmModelId
  });

  // update vector model and dataset.data rebuild field
  await mongoSessionRun(async (session) => {
    await MongoDataset.findByIdAndUpdate(
      datasetId,
      {
        vectorModelId
      },
      { session }
    );
    await MongoDatasetData.updateMany(
      {
        teamId,
        datasetId
      },
      {
        $set: {
          rebuilding: true
        },
        $unset: {
          indexingCompleteTime: ''
        }
      },
      {
        session
      }
    );
  });

  // get 10 init dataset.data
  const max = global.systemEnv?.vectorMaxProcess || 10;
  const arr = new Array(max * 2).fill(0);

  for await (const _ of arr) {
    try {
      const hasNext = await mongoSessionRun(async (session) => {
        // get next dataset.data
        const data = await MongoDatasetData.findOneAndUpdate(
          {
            rebuilding: true,
            teamId,
            datasetId
          },
          {
            $unset: {
              rebuilding: null
            },
            updateTime: new Date()
          },
          {
            session
          }
        ).select({
          _id: 1,
          collectionId: 1
        });

        if (data) {
          await MongoDatasetTraining.create(
            [
              {
                teamId,
                tmbId,
                datasetId,
                collectionId: data.collectionId,
                billId: usageId,
                mode: TrainingModeEnum.chunk,
                dataId: data._id,
                retryCount: 50
              }
            ],
            {
              session,
              ordered: true
            }
          );
        }

        return !!data;
      });

      if (!hasNext) {
        break;
      }
    } catch (error) {}
  }

  // 触发所有受影响的 collection 的 stats 更新，使前端状态从 ready 变为 indexing
  const affectedCollections = await MongoDatasetTraining.distinct('collectionId', {
    teamId,
    datasetId
  });

  for (const collectionId of affectedCollections) {
    pushCollectionUpdateJob({
      collectionId: String(collectionId),
      datasetId,
      teamId
    });
  }

  return RebuildEmbeddingResponseSchema.parse({});
}

export default NextAPI(handler);
