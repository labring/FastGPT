import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { uploadFile } from '@fastgpt/service/common/file/gridfs/controller';
import { detectAndDecodeBuffer } from '@fastgpt/service/common/file/encoding';
import { excelBufferToCSV } from '@fastgpt/service/common/file/csv';
import fs from 'fs';

export type CustomTemplateImportQuery = {};
export type CustomTemplateImportBody = {
  datasetId: string;
};
export type CustomTemplateImportResponse = {};

const SUPPORTED_EXTENSIONS = ['csv', 'xls', 'xlsx'];

// 解析文件为CSV文本
async function parseFileToCSV(buffer: Buffer, extension: string): Promise<string> {
  if (extension === 'xlsx' || extension === 'xls') {
    // Excel文件直接解析，使用通用的 Excel 解析方法
    const csvText = excelBufferToCSV(buffer);
    if (!csvText) {
      throw new Error(i18nT('dataset:template_excel_file_empty'));
    }
    return csvText;
  } else {
    // CSV文件，使用公共方法检测编码并解码
    const { content } = detectAndDecodeBuffer(buffer);
    return content;
  }
}

// 验证模板格式
function validateTemplateFormat(csvText: string): void {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error(i18nT('dataset:template_file_invalid'));
  }

  const headerLine = lines[0];
  const headers = headerLine.split(',').map((h) => h.trim());

  // 1.1 检查是否以 q,a 开头
  if (headers.length < 3 || headers[0] !== 'q' || headers[1] !== 'a') {
    throw new Error(i18nT('dataset:template_file_invalid'));
  }

  // 1.2 检查是否包含 indexes
  if (!headers.includes('indexes')) {
    throw new Error(i18nT('dataset:template_file_invalid'));
  }

  // 1.3 检查其他表头不能以 . 或 & 开头
  const customHeaders = headers.slice(2); // 跳过 q 和 a
  for (const header of customHeaders) {
    if (header.startsWith('.') || header.startsWith('&')) {
      throw new Error(i18nT('dataset:template_file_invalid'));
    }
  }
}

async function handler(
  req: ApiRequestProps<CustomTemplateImportBody, CustomTemplateImportQuery>,
  res: ApiResponseType<CustomTemplateImportResponse>
) {
  const filePaths: string[] = [];

  try {
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });
    const { file, data } = await upload.getUploadFile<CustomTemplateImportBody>(req, res);
    filePaths.push(file.path);

    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new Error(
        i18nT('dataset:template_unsupported_file_type').replace(
          '{{types}}',
          SUPPORTED_EXTENSIONS.join(', ')
        )
      );
    }

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: data.datasetId
    });

    // 1. 读取文件并解析为CSV
    const buffer = await fs.promises.readFile(file.path);
    const rawText = await parseFileToCSV(buffer, extension);

    // 2. 验证模板格式
    validateTemplateFormat(rawText);

    // 3. 上传文件到GridFS
    const fileId = await uploadFile({
      teamId,
      uid: tmbId,
      bucketName: 'dataset',
      path: file.path,
      filename: file.originalname,
      contentType: file.mimetype
    });

    // 4. 删除临时文件
    removeFilesByPaths(filePaths);

    // 5. 获取模式配置
    const customTemplateConfig = global.systemEnv?.customTemplateImport;
    const defaultModeName = customTemplateConfig?.defaultActivateMode || 'default';

    // TODO: 实现内容探测逻辑，根据文件内容选择合适的模式
    // 当前使用默认模式
    const selectedMode = customTemplateConfig?.modes?.find(
      (mode) => mode.name === defaultModeName && mode.enabled !== false
    );

    if (!selectedMode) {
      throw new Error(
        `${i18nT('dataset:template_import_mode_not_found').replace('{{modeName}}', defaultModeName)}`
      );
    }

    const enhanceConfig = selectedMode.enhanceConfig || {};

    // 6. 创建集合并插入数据
    await createCollectionAndInsertData({
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
        autoIndexes: enhanceConfig.autoIndexes || false,
        small2bigIndexes: enhanceConfig.small2bigIndexes || false,
        syntheticIndex: enhanceConfig.syntheticIndex !== false, // 默认true
        hypeIndexes: enhanceConfig.hypeIndexes || false,
        hypeIndexPrompt: enhanceConfig.hypeIndexPrompt || '',
        small2bigConfig: enhanceConfig.small2bigConfig,
        autoIndexesPrompt: enhanceConfig.autoIndexesPrompt,
        imageIndexPrompt: enhanceConfig.imageIndexPrompt
      }
    });

    return {};
  } catch (error) {
    addLog.error(`Custom template import error: ${error}`);
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
