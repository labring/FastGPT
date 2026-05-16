import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { multer } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';
import type { CollectionTagValueType } from '@fastgpt/global/core/dataset/type.d';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
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
  parentId?: string;
  tags?: CollectionTagValueType[];
  overwriteDuplicate?: boolean;
  enableEnhance?: boolean;
  fileMd5?: string;
};
export type CustomTemplateImportResponse = {
  overwritten?: boolean; // Whether overwrite operation was performed
  deletedCollectionId?: string; // Deleted old collection ID (only returned when overwritten)
};

const SUPPORTED_EXTENSIONS = ['csv', 'xls', 'xlsx'];

// 验证模板格式
function validateTemplateFormat(csvText: string): void {
  const lines = csvText.trim().split('\n');

  if (!lines[0]) {
    throw new Error(i18nT('dataset:template_file_invalid'));
  }

  const headers = lines[0].split(',').map((h) => h.trim());

  // 至少需要2列（问题+答案）
  if (headers.length < 2) {
    throw new Error(i18nT('dataset:template_file_invalid'));
  }

  // 检查其他表头不能以 . 或 & 开头
  const customHeaders = headers.slice(2); // 跳过前两列
  for (const header of customHeaders) {
    if (header && (header.startsWith('.') || header.startsWith('&'))) {
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
    const result = await multer.resolveFormData<CustomTemplateImportBody>({
      request: req,
      maxFileSize: global.feConfigs?.uploadFileMaxSize
    });
    const file = result.fileMetadata;
    const data = result.data;
    filePaths.push(file.path);

    const { tags } = data;

    const extension = decodeURIComponent(file.originalname).split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_EXTENSIONS.includes(extension)) {
      throw new Error(
        i18nT('dataset:template_unsupported_file_type').replace(
          '{{types}}',
          SUPPORTED_EXTENSIONS.join(', ')
        )
      );
    }

    const normalizedParentId =
      data.parentId && data.parentId.trim() !== '' ? data.parentId : undefined;

    const { teamId, tmbId, dataset } = normalizedParentId
      ? await authDatasetCollection({
          req,
          authToken: true,
          authApiKey: true,
          collectionId: normalizedParentId,
          per: WritePermissionVal
        }).then((res) => {
          if (data.datasetId && String(res.collection.datasetId) !== String(data.datasetId)) {
            return Promise.reject(DatasetErrEnum.unAuthDataset);
          }
          return {
            teamId: res.teamId,
            tmbId: res.tmbId,
            dataset: res.collection.dataset
          };
        })
      : await authDataset({
          req,
          authToken: true,
          authApiKey: true,
          per: WritePermissionVal,
          datasetId: data.datasetId
        });

    // 1. 验证模板格式（CSV 只读 4096 字节头部，Excel 读全量转换后验证）
    if (extension === 'xlsx' || extension === 'xls') {
      const fileBuffer = await fs.promises.readFile(file.path);
      const csv = excelBufferToCSV(fileBuffer);
      if (!csv) {
        if (fileBuffer.length > 500 * 1024)
          throw new Error(i18nT('dataset:template_excel_too_much_data'));
        throw new Error(i18nT('dataset:template_excel_file_empty'));
      }
      validateTemplateFormat(csv.substring(0, 4096));
    } else {
      // CSV: 只读头部 4096 字节做格式验证，避免主线程读大文件
      const headerBuffer = Buffer.alloc(4096);
      const fd = await fs.promises.open(file.path, 'r');
      try {
        await fd.read(headerBuffer, 0, 4096, 0);
      } finally {
        await fd.close();
      }
      const { content: headerText } = detectAndDecodeBuffer(headerBuffer);
      validateTemplateFormat(headerText);
    }

    // 2. Handle duplicate file name (within transaction to avoid TOCTOU)
    let fileName = decodeURIComponent(file.originalname);
    let deletedCollectionId: string | undefined;
    let overwritten = false;

    await mongoSessionRun(async (session) => {
      // Build query for duplicate check - only check within the same parentId folder
      const duplicateQuery: Record<string, any> = {
        datasetId: dataset._id,
        name: fileName,
        type: DatasetCollectionTypeEnum.file
      };

      // Handle parentId query condition
      if (normalizedParentId) {
        // Valid parentId - search in specific folder
        duplicateQuery.parentId = normalizedParentId;
      } else {
        // Root directory: parentId is null or does not exist
        duplicateQuery.$or = [{ parentId: null }, { parentId: { $exists: false } }];
      }

      // Check if file with same name exists in the same folder (within transaction)
      const existingCollection = await MongoDatasetCollection.findOne(duplicateQuery, '_id', {
        session
      });

      if (existingCollection) {
        if (data.overwriteDuplicate === true) {
          // 3.1 Overwrite: delete old collection within the same transaction
          deletedCollectionId = String(existingCollection._id);

          // Find all child collections
          const collections = await findCollectionAndChild({
            teamId,
            datasetId: dataset._id,
            collectionId: deletedCollectionId,
            fields: '_id teamId datasetId fileId metadata'
          });

          // Delete collection and related data (data and training records)
          await delCollection({
            collections,
            delImg: true,
            delFile: true,
            session
          });

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

          // Build query for suffix pattern - only check within the same parentId folder
          const suffixQuery: Record<string, any> = {
            datasetId: dataset._id,
            name: { $regex: `^${escapedBase}\\(\\d+\\)${escapedExt}$` },
            type: DatasetCollectionTypeEnum.file
          };

          // Handle parentId query condition
          if (normalizedParentId) {
            suffixQuery.parentId = normalizedParentId;
          } else {
            // Root directory: parentId is null or does not exist
            suffixQuery.$or = [{ parentId: null }, { parentId: { $exists: false } }];
          }

          // Query all existing files with suffix pattern in the same folder (within transaction)
          const existingNames = await MongoDatasetCollection.find(suffixQuery, 'name', {
            session
          }).lean();

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
    });

    // 4. 使用前端计算的文件内容 MD5（SparkMD5），避免前后端计算不一致
    const fileMd5 = data.fileMd5;

    // 4.5 MD5 内容去重检查：与知识库中已有文件比对，内容完全一致的拒绝上传
    if (fileMd5) {
      const md5Duplicate = await MongoDatasetCollection.findOne(
        {
          datasetId: dataset._id,
          type: DatasetCollectionTypeEnum.file,
          fileMd5
        },
        '_id'
      ).lean();

      if (md5Duplicate) {
        return Promise.reject(DatasetErrEnum.fileContentDuplicate);
      }
    }

    // 5. 上传文件到 S3（使用处理后的文件名）
    const fileId = await getS3DatasetSource().upload({
      datasetId: data.datasetId,
      filename: fileName,
      stream: fs.createReadStream(file.path),
      contentType: file.mimetype
    });

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
      `[TemplateImport] EnhanceConfig - autoIndexes: ${enhanceConfig.autoIndexes || false}, small2bigIndexes: ${enhanceConfig.small2bigIndexes || false}`
    );

    // 6.1 If enableEnhance is false, disable all enhance config
    const finalEnhanceConfig =
      data.enableEnhance === false
        ? {
            autoIndexes: false,
            small2bigIndexes: false,
            hypeIndexes: false,
            hypeIndexPrompt: '',
            small2bigConfig: undefined,
            autoIndexesPrompt: undefined,
            imageIndexPrompt: undefined
          }
        : enhanceConfig;

    // 7. 创建集合（通过 filePath 路径，Worker 统计行数后推入后台解析队列，API 快速返回）
    const { collectionId, results: insertResults } = await createCollectionAndInsertData({
      dataset,
      filePath: file.path,
      fileExtension: extension,
      backupParse: true,
      createCollectionParams: {
        teamId,
        tmbId,
        datasetId: dataset._id,
        parentId: normalizedParentId,
        name: fileName,
        tags: tags as unknown as string[],
        type: DatasetCollectionTypeEnum.file,
        fileId,
        trainingType: DatasetCollectionDataProcessModeEnum.template,
        autoIndexes: finalEnhanceConfig.autoIndexes || false,
        small2bigIndexes: finalEnhanceConfig.small2bigIndexes || false,
        hypeIndexes: finalEnhanceConfig.hypeIndexes || false,
        hypeIndexPrompt: finalEnhanceConfig.hypeIndexPrompt || '',
        small2bigConfig: finalEnhanceConfig.small2bigConfig,
        autoIndexesPrompt: finalEnhanceConfig.autoIndexesPrompt,
        imageIndexPrompt: finalEnhanceConfig.imageIndexPrompt,
        fileMd5 // 文件内容 MD5，用于去重
      }
    });

    // 5. 删除临时文件（在 createCollectionAndInsertData 之后，因为优化路径需要读文件）
    removeFilesByPaths(filePaths);

    return {
      collectionId,
      results: insertResults,
      ...(overwritten ? { overwritten, deletedCollectionId } : {})
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
