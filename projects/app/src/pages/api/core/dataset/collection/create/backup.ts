import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read/utils';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { isCSVFile } from '@fastgpt/global/common/file/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';

export type backupQuery = {};

export type backupBody = {};

export type backupResponse = {};

async function handler(req: ApiRequestProps<backupBody, backupQuery>) {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs?.uploadFileMaxSize
    });
    filepaths.push(result.fileMetadata.path);
    const filename = decodeURIComponent(result.fileMetadata.originalname);

    if (!isCSVFile(filename)) {
      return Promise.reject('File must be a CSV file');
    }

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: result.data.datasetId
    });

    const { rawText } = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: result.fileMetadata.path,
      encoding: result.fileMetadata.encoding,
      getFormatText: false
    });

    if (!rawText.trim().startsWith('q,a,indexes')) {
      return Promise.reject(i18nT('dataset:backup_template_invalid'));
    }

    const fileId = await getS3DatasetSource().upload({
      datasetId: dataset._id,
      stream: result.getReadStream(),
      size: result.fileMetadata.size,
      filename: filename
    });

    await createCollectionAndInsertData({
      dataset,
      rawText,
      backupParse: true,
      createCollectionParams: {
        teamId,
        tmbId,
        datasetId: dataset._id,
        name: filename,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        trainingType: DatasetCollectionDataProcessModeEnum.backup
      }
    });

    return {};
  } catch (error) {
    addLog.error(`Backup dataset collection create error: ${error}`);
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
