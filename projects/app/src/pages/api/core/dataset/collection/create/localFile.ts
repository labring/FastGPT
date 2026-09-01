import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  CreateCollectionByLocalFileBodySchema,
  type CreateCollectionWithResultResponseType
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { decodeMultipartFilename } from '@fastgpt/service/common/s3/filename';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps): Promise<CreateCollectionWithResultResponseType> {
  const filepaths: string[] = [];
  let fileId: string | undefined;
  let promoted = false;

  try {
    const formData = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: parseAllowedExtensions(documentFileType)
    });
    filepaths.push(formData.fileMetadata.path);

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: formData.data.datasetId
    });

    // Check dataset limit
    await checkDatasetIndexLimit({
      teamId,
      insertLen: 1
    });

    const collectionData = CreateCollectionByLocalFileBodySchema.parse(formData.data);
    const collectionName = decodeMultipartFilename(formData.fileMetadata.originalname);

    fileId = await getS3DatasetSource().upload({
      datasetId: dataset._id,
      stream: formData.getReadStream(),
      size: formData.fileMetadata.size,
      filename: collectionName
    });

    const collectionResult = await createCollectionAndInsertData({
      dataset,
      createCollectionParams: {
        ...collectionData,
        datasetId: dataset._id,
        name: collectionName,
        teamId,
        tmbId,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        metadata: {
          ...collectionData.metadata,
          relatedImgId: fileId
        }
      }
    });
    promoted = true;
    return collectionResult;
  } catch (error) {
    if (fileId && !promoted) {
      await getS3DatasetSource()
        .cleanupPendingDatasetFile(fileId)
        .catch((cleanupError) => {
          logger.warn('Local-file pending dataset file cleanup failed', {
            fileId,
            error: cleanupError
          });
        });
    }
    return Promise.reject(error);
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default NextAPI(handler);
