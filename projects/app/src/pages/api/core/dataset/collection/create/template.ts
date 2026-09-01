import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { CreateTemplateCollectionFormSchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import { parseDatasetImportFile } from '@fastgpt/service/core/dataset/importFile';
import { decodeMultipartFilename } from '@fastgpt/service/common/s3/filename';
const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps) {
  const filepaths: string[] = [];
  let fileId: string | undefined;
  let promoted = false;

  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize
    });
    filepaths.push(result.fileMetadata.path);
    const filename = decodeMultipartFilename(result.fileMetadata.originalname);
    const { datasetId, parentId } = CreateTemplateCollectionFormSchema.parse(result.data);

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId
    });

    // Check dataset limit
    await checkDatasetIndexLimit({
      teamId,
      insertLen: 1
    });

    const datasetSource = getS3DatasetSource();
    fileId = await datasetSource.upload({
      datasetId: dataset._id,
      stream: result.getReadStream(),
      size: result.fileMetadata.size,
      filename: filename
    });
    // 上传完成后解析只依赖 S3 source，本地临时文件不进入等待队列。
    multer.clearDiskTempFiles([...filepaths]);
    filepaths.length = 0;

    const source = await datasetSource.getDatasetFileSource({
      fileId,
      datasetId: String(dataset._id)
    });
    const rawText = await parseDatasetImportFile({
      teamId,
      tmbId,
      source,
      filename
    }).catch((error) => {
      logger.warn('Template dataset import file parse failed', { filename, error });
      return Promise.reject(i18nT('dataset:template_file_invalid'));
    });

    await createCollectionAndInsertData({
      dataset,
      rawText,
      backupParse: true,
      createCollectionParams: {
        teamId,
        tmbId,
        datasetId: dataset._id,
        parentId,
        name: filename,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        trainingType: DatasetCollectionDataProcessModeEnum.template
      }
    });
    promoted = true;

    return {};
  } catch (error) {
    if (fileId && !promoted) {
      await getS3DatasetSource()
        .cleanupPendingDatasetFile(fileId)
        .catch((cleanupError) => {
          logger.warn('Template pending dataset file cleanup failed', {
            fileId,
            error: cleanupError
          });
        });
    }
    logger.error(`Template dataset collection create error: ${error}`);
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
