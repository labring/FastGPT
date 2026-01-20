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
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import DatasetErrorCode from '@fastgpt/global/common/error/code/dataset';
import fs from 'fs';

export type CustomTemplateImportQuery = {};
export type CustomTemplateImportBody = {
  datasetId: string;
  overwriteDuplicate?: boolean; // Optional: Whether to overwrite duplicate files (default false)
};
export type CustomTemplateImportResponse = {
  overwritten?: boolean; // Whether overwrite operation was performed
  deletedCollectionId?: string; // Deleted old collection ID (only returned when overwritten)
};

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

    // 3. 处理重名检查（在上传文件之前）
    let fileName = file.originalname;
    let deletedCollectionId: string | undefined;
    let overwritten = false;

    // Check if file with same name exists
    // Note: 不检查 parentId，在整个 dataset 范围内检查重名，确保文件名全局唯一
    const existingCollection = await MongoDatasetCollection.findOne({
      datasetId: dataset._id,
      name: fileName,
      type: DatasetCollectionTypeEnum.file
    });

    if (existingCollection) {
      if (data.overwriteDuplicate === true) {
        // 3.1 Overwrite: delete old collection first
        deletedCollectionId = String(existingCollection._id);

        // Find all child collections
        const collections = await findCollectionAndChild({
          teamId,
          datasetId: dataset._id,
          collectionId: deletedCollectionId,
          fields: '_id teamId datasetId fileId metadata'
        });

        // Delete collection and related data (data and training records)
        await mongoSessionRun((session) =>
          delCollection({
            collections,
            delImg: true,
            delFile: true,
            session
          })
        );

        overwritten = true;

        addLog.info(
          `[TemplateImport] Overwritten collection: ${deletedCollectionId}, name: ${fileName}`
        );
      } else {
        // 3.2 No overwrite: add suffix to new file name
        const lastDotIndex = fileName.lastIndexOf('.');
        const fileNameWithoutExt =
          lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
        const fileExt = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';

        // Escape special regex characters
        const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedBase = escapeRegex(fileNameWithoutExt);
        const escapedExt = escapeRegex(fileExt);

        // Query all existing files with suffix pattern in one request
        const existingNames = await MongoDatasetCollection.find({
          datasetId: dataset._id,
          name: { $regex: `^${escapedBase}\\(\\d+\\)${escapedExt}$` },
          type: DatasetCollectionTypeEnum.file
        })
          .select('name')
          .lean();

        // Find max suffix from existing names
        let maxSuffix = 0;
        const suffixRegex = new RegExp(`^${escapedBase}\\((\\d+)\\)${escapedExt}$`);
        for (const doc of existingNames) {
          const match = doc.name.match(suffixRegex);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxSuffix) maxSuffix = num;
          }
        }

        fileName = `${fileNameWithoutExt}(${maxSuffix + 1})${fileExt}`;

        addLog.info(
          `[TemplateImport] Renamed duplicate file from '${file.originalname}' to '${fileName}'`
        );
      }
    }

    // 4. 上传文件到GridFS（使用处理后的文件名）
    const fileId = await uploadFile({
      teamId,
      uid: tmbId,
      bucketName: 'dataset',
      path: file.path,
      filename: fileName,
      contentType: file.mimetype
    });

    // 5. 删除临时文件
    removeFilesByPaths(filePaths);

    // 6. 获取模式配置
    const customTemplateConfig = global.systemEnv?.customTemplateImport;
    const defaultModeName = customTemplateConfig?.defaultActivateMode || 'default';

    addLog.debug(`[TemplateImport] Using mode: ${defaultModeName}`);

    // TODO: 实现内容探测逻辑，根据文件内容选择合适的模式
    // 当前使用默认模式
    const selectedMode = customTemplateConfig?.modes?.find(
      (mode) => mode.name === defaultModeName && mode.enabled !== false
    );

    if (!selectedMode) {
      const errorObj = DatasetErrorCode[DatasetErrEnum.templateImportModeNotFound];
      return Promise.reject({
        ...errorObj,
        message: errorObj.message.replace('{{modeName}}', defaultModeName)
      });
    }

    const enhanceConfig = selectedMode.enhanceConfig || {};
    addLog.debug(`[TemplateImport] enhanceConfig details: ${JSON.stringify(enhanceConfig)}`);
    addLog.debug(
      `[TemplateImport] EnhanceConfig - autoIndexes: ${enhanceConfig.autoIndexes || false}, small2bigIndexes: ${enhanceConfig.small2bigIndexes || false}, syntheticIndex: ${enhanceConfig.syntheticIndex !== false}`
    );

    // 7. 创建集合并插入数据
    const { collectionId, insertResults } = await createCollectionAndInsertData({
      dataset,
      rawText,
      backupParse: true,
      createCollectionParams: {
        teamId,
        tmbId,
        datasetId: dataset._id,
        name: fileName,
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

    return {
      collectionId,
      results: insertResults,
      ...(overwritten && { overwritten, deletedCollectionId })
    };
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
