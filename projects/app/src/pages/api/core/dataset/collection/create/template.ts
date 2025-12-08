import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
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
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import type { small2bigConfigType } from '@fastgpt/global/core/dataset/type';
import type { CreateCollectionResponse } from '@/global/core/dataset/api';

export type TemplateImportQuery = {};
export type EnhanceConfig = {
  autoIndexes?: boolean;
  hypeIndexes?: boolean;
  small2bigIndexes?: boolean;
  hypeIndexPrompt?: string;
  smll2bigConfig?: small2bigConfigType;
  autoIndexesPrompt?: string;
};
export type TemplateImportBody = { datasetId: string; enhanceConfig: EnhanceConfig };

export type TemplateImportResponse = CreateCollectionResponse;

async function handler(
  req: ApiRequestProps<TemplateImportBody, TemplateImportQuery>,
  res: ApiResponseType<any>
) {
  const filePaths: string[] = [];

  try {
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    const { file, data } = await upload.getUploadFile<TemplateImportBody>(req, res);
    filePaths.push(file.path);

    if (file.mimetype !== 'text/csv') {
      throw new Error('File must be a CSV file');
    }

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: data.datasetId
    });

    // 1. Read
    const { rawText } = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: file.path,
      encoding: file.encoding,
      getFormatText: false
    });
    const headerLine = rawText.trim().split('\n')[0];
    const headers = headerLine.split(',').map((h) => h.trim());

    // 1.1 检查是否以 q,a 开头
    if (headers.length < 3 || headers[0] !== 'q' || headers[1] !== 'a') {
      return Promise.reject(i18nT('dataset:template_file_invalid'));
    }
    // 1.2 检查是否包含 indexes
    if (!headers.includes('indexes')) {
      return Promise.reject(i18nT('dataset:template_file_invalid'));
    }
    // 1.3 检查其他表头不能以 .$ 开头
    const customHeaders = headers.slice(2); // 跳过 q 和 a
    for (const header of customHeaders) {
      if (header.startsWith('.') || header.startsWith('&')) {
        return Promise.reject(i18nT('dataset:template_file_invalid'));
      }
    }

    // 2. Upload file
    const fileId = await uploadFile({
      teamId,
      uid: tmbId,
      bucketName: 'dataset',
      path: file.path,
      filename: file.originalname,
      contentType: file.mimetype
    });

    // 3. delete tmp file
    removeFilesByPaths(filePaths);

    // 4. Create collection
    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      rawText,
      backupParse: true,
      createCollectionParams: {
        teamId,
        tmbId,
        datasetId: dataset._id,
        name: file.originalname,
        type: DatasetCollectionTypeEnum.file,
        fileId,
        trainingType: DatasetCollectionDataProcessModeEnum.template,
        ...data.enhanceConfig
      }
    });

    return { collectionId, results: insertResults };
  } catch (error) {
    addLog.error(`Backup dataset collection create error: ${error}`);
    removeFilesByPaths(filePaths);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
