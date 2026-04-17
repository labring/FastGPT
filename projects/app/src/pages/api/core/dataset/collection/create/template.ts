import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read/utils';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { isCSVFile } from '@fastgpt/global/common/file/utils';
import { multer } from '@fastgpt/service/common/file/multer';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import type { small2bigConfigType } from '@fastgpt/global/core/dataset/type';
import type { CreateCollectionResponse } from '@/global/core/dataset/api';
import { CreateTemplateCollectionFormSchema } from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { z } from 'zod';

export type TemplateImportQuery = {};
export type EnhanceConfig = {
  autoIndexes?: boolean;
  hypeIndexes?: boolean;
  small2bigIndexes?: boolean;
  syntheticIndex?: boolean;
  hypeIndexPrompt?: string;
  smll2bigConfig?: small2bigConfigType;
  autoIndexesPrompt?: string;
};
export type TemplateImportBody = { datasetId: string; enhanceConfig: EnhanceConfig };

export type TemplateImportResponse = CreateCollectionResponse;

const logger = getLogger(LogCategories.MODULE.DATASET.COLLECTION);

async function handler(req: ApiRequestProps) {
  const filepaths: string[] = [];

  try {
    const result = await multer.resolveFormData({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize
    });
    filepaths.push(result.fileMetadata.path);
    const filename = decodeURIComponent(result.fileMetadata.originalname);
    const { datasetId, parentId, enhanceConfig: rawEnhanceConfig } =
      CreateTemplateCollectionFormSchema.extend({
        enhanceConfig: z.any().optional()
      }).parse(result.data);
    const enhanceConfig: EnhanceConfig =
      typeof rawEnhanceConfig === 'string'
        ? JSON.parse(rawEnhanceConfig)
        : rawEnhanceConfig || {};

    if (!isCSVFile(filename)) {
      return Promise.reject('File must be a CSV file');
    }

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId
    });

    const { rawText } = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: result.fileMetadata.path,
      encoding: result.fileMetadata.encoding,
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
    const fileId = await getS3DatasetSource().upload({
      datasetId: dataset._id,
      stream: result.getReadStream(),
      size: result.fileMetadata.size,
      filename: filename
    });

    // 3. Create collection
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
        trainingType: DatasetCollectionDataProcessModeEnum.template,
        ...enhanceConfig
      }
    });
  } catch (error) {
    logger.error(`Backup dataset collection create error: ${error}`);
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
