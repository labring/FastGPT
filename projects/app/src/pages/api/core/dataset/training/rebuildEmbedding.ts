import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel, getEmbeddingModel } from '@fastgpt/service/core/ai/model';
import {
  getDatasetImageIndexCapability,
  getDatasetImageTrainingMode
} from '@fastgpt/service/core/dataset/utils';
import { uniqueDatasetDataMarkdownImageUrls } from '@fastgpt/service/core/dataset/data/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  RebuildEmbeddingBodySchema,
  RebuildEmbeddingResponseSchema,
  type RebuildEmbeddingResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';

async function handler(req: ApiRequestProps): Promise<RebuildEmbeddingResponse> {
  const { datasetId, vectorModel } = parseApiInput({
    req,
    bodySchema: RebuildEmbeddingBodySchema
  }).body;

  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: OwnerPermissionVal
  });

  // check vector model
  if (!vectorModel || dataset.vectorModel === vectorModel) {
    return Promise.reject('vectorModel 不合法');
  }

  // check rebuilding or training
  const [rebuilding, training] = await Promise.all([
    MongoDatasetData.findOne({ teamId, datasetId, rebuilding: true }),
    MongoDatasetTraining.findOne({ teamId, datasetId })
  ]);

  if (rebuilding || training) {
    return Promise.reject('数据集正在训练或者重建中，请稍后再试');
  }

  const { availableVlmModel, supportVlm, supportImageIndex } = getDatasetImageIndexCapability({
    vectorModel,
    vlmModel: dataset.vlmModel
  });

  const { usageId } = await createTrainingUsage({
    teamId,
    tmbId,
    appName: '切换索引模型',
    billSource: UsageSourceEnum.training,
    vectorModel: getEmbeddingModel(vectorModel)?.name || vectorModel,
    agentModel: getLLMModel(dataset.agentModel)?.name,
    vllmModel: availableVlmModel?.name
  });

  // update vector model and dataset.data rebuild field
  await mongoSessionRun(async (session) => {
    await MongoDataset.findByIdAndUpdate(
      datasetId,
      {
        $set: {
          vectorModel,
          ...(!supportImageIndex && { 'chunkSettings.imageIndex': false })
        }
      },
      { session }
    );
    if (!supportImageIndex) {
      await MongoDatasetCollection.updateMany(
        {
          teamId,
          datasetId
        },
        {
          $set: {
            imageIndex: false
          }
        },
        { session }
      );
    }
    await MongoDatasetData.updateMany(
      {
        teamId,
        datasetId
      },
      {
        $set: {
          rebuilding: true
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

  for (let i = 0; i < arr.length; i++) {
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
          collectionId: 1,
          imageId: 1,
          q: 1,
          indexes: 1
        });

        if (data) {
          const collection = await MongoDatasetCollection.findById(data.collectionId)
            .select('imageIndex')
            .session(session);
          const hasMarkdownImages =
            !!collection?.imageIndex && uniqueDatasetDataMarkdownImageUrls([data.q]).length > 0;
          const mode = getDatasetImageTrainingMode({
            supportVlm,
            supportImageIndex,
            imageId: data.imageId,
            hasMarkdownImages
          });

          await MongoDatasetTraining.create(
            [
              {
                teamId,
                tmbId,
                datasetId,
                collectionId: data.collectionId,
                billId: usageId,
                mode,
                model:
                  (mode === TrainingModeEnum.imageParse || mode === TrainingModeEnum.image) &&
                  supportVlm &&
                  availableVlmModel
                    ? availableVlmModel.model
                    : vectorModel,
                dataId: data._id,
                ...(data.imageId && { imageId: data.imageId }),
                ...(mode === TrainingModeEnum.image && {
                  q: data.q,
                  indexes: data.indexes
                }),
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
    } catch {}
  }

  return RebuildEmbeddingResponseSchema.parse(undefined);
}

export default NextAPI(handler);
