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
  getEmbeddingModelById,
  getLLMModelById,
  getVlmModelById
} from '@fastgpt/service/core/ai/model';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';
import { createDataDrafts } from '@fastgpt/service/core/dataset/data/controller';
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
          vectorModelId: getEmbeddingModelById(dataset.vectorModelId)?.id,
          agentModelId: getLLMModelById(dataset.agentModelId)?.id,
          vlmModelId: getVlmModelById(dataset.vlmModelId)?.id,
          session
        });
        return usageId;
      })();

      // Pre-create Data drafts for each image so Training records carry dataId.
      // imageParseTraining will VLM-parse the images and sync q/DataText back to these drafts.
      const draftResults = await createDataDrafts({
        items: imageIds.map((imageId, index) => ({
          q: '',
          a: '',
          imageId,
          chunkIndex: index
        })),
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId,
        session
      });
      const dataWithDrafts = draftResults.map((result, i) => ({
        imageId: imageIds[i],
        id: String(result._id)
      }));

      await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId: dataset._id,
        collectionId,
        agentModelId: dataset.agentModelId,
        vectorModelId: dataset.vectorModelId,
        vlmModelId: dataset.vlmModelId,
        mode: TrainingModeEnum.imageParse,
        billId: traingBillId,
        data: dataWithDrafts,
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
