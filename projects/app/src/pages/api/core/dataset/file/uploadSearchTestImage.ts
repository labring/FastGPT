import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addHours, addSeconds } from 'date-fns';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import fs from 'node:fs';
import path from 'node:path';
import {
  getFileS3Key,
  jwtSignS3DownloadToken,
  uploadImage2S3Bucket
} from '@fastgpt/service/common/s3/utils';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import {
  UploadSearchTestImageBodySchema,
  UploadSearchTestImageResponseSchema,
  type UploadSearchTestImageResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

async function handler(req: ApiRequestProps): Promise<UploadSearchTestImageResponse> {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveMultipleFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(imageFileType)
    });
    filepaths.push(...result.fileMetadata.map((item) => item.path));

    const file = result.fileMetadata[0];
    if (!file) {
      return Promise.reject(new Error('file is required'));
    }

    const { datasetId } = UploadSearchTestImageBodySchema.parse({
      ...result.data,
      datasetId: result.data.datasetId || req.body?.datasetId
    });
    const { teamId, userId } = await authDataset({
      datasetId,
      per: ReadPermissionVal,
      req,
      authToken: true,
      authApiKey: true
    });

    const planStatus = await getTeamPlanStatus({ teamId });
    const maxUploadFileSize =
      (planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize) * 1024 * 1024;
    if (file.size > maxUploadFileSize) {
      return Promise.reject(
        new Error(`File too large. Maximum size allowed is ${formatFileSize(maxUploadFileSize)}.`)
      );
    }

    await authFrequencyLimit({
      eventId: `${userId}-uploadfile`,
      maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
      expiredTime: addSeconds(new Date(), 30),
      num: 1
    });

    const filename = path.basename(file.filename);
    const expiredTime = addHours(new Date(), 3);
    const { fileKey } = getFileS3Key.temp({ teamId, filename });
    const key = await uploadImage2S3Bucket('private', {
      base64Img: (await fs.promises.readFile(file.path)).toString('base64'),
      uploadKey: fileKey,
      mimetype: file.mimetype,
      filename,
      expiredTime
    });

    return UploadSearchTestImageResponseSchema.parse({
      key,
      previewUrl: jwtSignS3DownloadToken({
        objectKey: key,
        bucketName: S3Buckets.private,
        expiredTime
      })
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
