import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addDays, addSeconds } from 'date-fns';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import {
  getEmbeddingModel,
  getLLMModel,
  getVlmModel,
  isImageEmbeddingModel
} from '@fastgpt/service/core/ai/model';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import path from 'node:path';
import fs from 'node:fs';
import { getFileS3Key, uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import {
  InsertImagesBodySchema,
  type InsertImagesResponse
} from '@fastgpt/global/openapi/core/dataset/data/api';
import { datasetImageCollectionFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { ensureDatasetVlmModel } from '@fastgpt/service/core/dataset/utils';

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
    const dataset = await ensureDatasetVlmModel(collection.dataset);
    if (!dataset.vlmModel && !isImageEmbeddingModel(dataset.vectorModel)) {
      return Promise.reject(i18nT('file:Image_dataset_requires_VLM_model_to_be_configured'));
    }

    const planStatus = await getTeamPlanStatus({ teamId });
    await authFrequencyLimit({
      eventId: `${tmbId}-uploadfile`,
      maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
      expiredTime: addSeconds(new Date(), 30), // 30s
      num: result.fileMetadata.length
    });

    const imageIds = await Promise.all(
      result.fileMetadata.map(async (file) =>
        uploadImage2S3Bucket('private', {
          base64Img: (await fs.promises.readFile(file.path)).toString('base64'),
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
          vectorModel: getEmbeddingModel(dataset.vectorModel)?.name,
          agentModel: getLLMModel(dataset.agentModel)?.name,
          vllmModel: dataset.vlmModel ? getVlmModel(dataset.vlmModel)?.name : undefined,
          session
        });
        return usageId;
      })();

      await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId,
        agentModel: dataset.agentModel,
        vectorModel: dataset.vectorModel,
        vlmModel: dataset.vlmModel,
        mode:
          dataset.vlmModel || !isImageEmbeddingModel(dataset.vectorModel)
            ? TrainingModeEnum.imageParse
            : TrainingModeEnum.chunk,
        billId: traingBillId,
        data: imageIds.map((item, index) => ({
          imageId: item
        })),
        session
      });
    });

    return {};
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
