import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { addDays } from 'date-fns';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  getDatasetAgentModel,
  getDatasetEmbeddingModel,
  getDatasetVlmModel
} from '@fastgpt/service/core/dataset/model';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import path from 'node:path';
import fs from 'node:fs';
import { getFileS3Key, uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import {
  InsertImagesBodySchema,
  InsertImagesResponseSchema,
  type InsertImagesResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { datasetImageCollectionFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { assertUploadRateLimit } from '@fastgpt/service/common/rateLimit/interface/upload';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

async function handler(req: ApiRequestProps): Promise<InsertImagesResponse> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveMultipleFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(datasetImageCollectionFileType)
    });
    filepaths.push(...result.fileMetadata.map((item) => item.path));
    const { collectionId } = InsertImagesBodySchema.parse(result.data);

    const { collection, teamId, tmbId } = await authDatasetCollection({
      collectionId,
      per: WritePermissionVal,
      req,
      authToken: true,
      authApiKey: true
    });
    const dataset = collection.dataset;
    const vectorModelData = getDatasetEmbeddingModel(dataset);
    const agentModelData = getDatasetAgentModel(dataset);
    const vlmModelData = getDatasetVlmModel(dataset);
    const { availableVlmModel, supportVlm, supportImageEmbedding } = getDatasetImageIndexCapability(
      {
        vectorModel: vectorModelData,
        vlmModel: vlmModelData
      }
    );

    if (!supportVlm && !supportImageEmbedding) {
      return Promise.reject(i18nT('file:Image_dataset_requires_VLM_model_to_be_configured'));
    }

    const planStatus = await getTeamPlanStatus({ teamId });
    await assertUploadRateLimit({
      identity: String(tmbId),
      limit: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
      increment: result.fileMetadata.length
    });

    const imageIds = await Promise.all(
      result.fileMetadata.map(async (file) =>
        uploadImage2S3Bucket('private', {
          buffer: await fs.promises.readFile(file.path),
          uploadKey: getFileS3Key.dataset({
            datasetId: dataset._id,
            filename: path.basename(file.filename)
          }).fileKey,
          mimetype: file.mimetype,
          filename: path.basename(file.filename),
          expiredTime: addDays(new Date(), 7)
        })
      )
    );

    await mongoSessionRun(async (session) => {
      const traingBillId = await (async () => {
        const { usageId } = await createTrainingUsage({
          teamId,
          tmbId,
          appName: collection.name,
          billSource: UsageSourceEnum.training,
          vectorModelId: vectorModelData.modelId!,
          agentModelId: agentModelData.modelId,
          vllmModelId: availableVlmModel?.modelId,
          session
        });
        return usageId;
      })();

      await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId,
        agentModel: agentModelData,
        vectorModel: vectorModelData,
        vlmModel: vlmModelData,
        mode: supportVlm ? TrainingModeEnum.imageParse : TrainingModeEnum.chunk,
        billId: traingBillId,
        data: imageIds.map((item) => ({
          imageId: item
        })),
        session
      });
    });

    return InsertImagesResponseSchema.parse(undefined);
  } catch (error) {
    return Promise.reject(error);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
