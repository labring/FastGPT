import { authDatasetCollectionCreate } from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateImageCollectionFormSchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { addDays } from 'date-fns';
import fs from 'node:fs';
import path from 'node:path';
import { getFileS3Key, uploadImage2S3Bucket } from '@fastgpt/service/common/s3/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { datasetImageCollectionFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { assertUploadRateLimit } from '@fastgpt/service/common/rateLimit/interface/upload';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveMultipleFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(datasetImageCollectionFileType)
    });
    filepaths.push(...result.fileMetadata.map((item) => item.path));
    const { parentId, datasetId, collectionName } = CreateImageCollectionFormSchema.parse(
      result.data
    );

    const { dataset, teamId, tmbId } = await authDatasetCollectionCreate({
      datasetId,
      parentId,
      req,
      authToken: true,
      authApiKey: true
    });

    // Check dataset limit
    await checkDatasetIndexLimit({
      teamId,
      insertLen: 1
    });

    const planStatus = await getTeamPlanStatus({ teamId });
    await assertUploadRateLimit({
      identity: String(tmbId),
      limit: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
      increment: result.fileMetadata.length
    });

    const { supportVlm, supportImageEmbedding } = getDatasetImageIndexCapability({
      vectorModel: dataset.vectorModel,
      vlmModel: dataset.vlmModel
    });

    if (!supportVlm && !supportImageEmbedding) {
      return Promise.reject(i18nT('file:Image_dataset_requires_VLM_model_to_be_configured'));
    }

    const imageIds = await Promise.all(
      result.fileMetadata.map(async (file) => {
        const filename = path.basename(file.filename);
        const { fileKey } = getFileS3Key.dataset({ datasetId, filename });
        return uploadImage2S3Bucket('private', {
          buffer: await fs.promises.readFile(file.path),
          uploadKey: fileKey,
          mimetype: file.mimetype,
          filename,
          expiredTime: addDays(new Date(), 7)
        });
      })
    );

    return createCollectionAndInsertData({
      dataset,
      imageIds,
      createCollectionParams: {
        parentId,
        teamId,
        tmbId,
        datasetId,
        type: DatasetCollectionTypeEnum.images,
        name: collectionName,
        trainingType: supportVlm
          ? DatasetCollectionDataProcessModeEnum.imageParse
          : DatasetCollectionDataProcessModeEnum.chunk
      }
    });
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
