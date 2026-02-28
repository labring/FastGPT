import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { getFileById, updateGridFSFilename } from '@fastgpt/service/common/file/gridfs/controller';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum,
  ParagraphChunkAIModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { deleteRawTextBuffer } from '@fastgpt/service/common/buffer/rawText/controller';
import {
  adaptiveAdjustConfig,
  logAdaptiveAdjustments
} from '@fastgpt/service/core/dataset/collection/adaptiveConfig';
import type { CustomFileImportModeType } from '@fastgpt/global/common/system/types/index.d';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delCollection } from '@fastgpt/service/core/dataset/collection/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { addLog } from '@fastgpt/service/common/system/log';

// Request body type
export type CustomFileIdImportBody = {
  datasetId: string; // Required: Dataset ID
  fileId: string; // Required: Uploaded file ID
  parentId?: string; // Optional: Parent directory ID
  name?: string; // Optional: Custom name (defaults to filename)
  tags?: string[]; // Optional: Tags
  overwriteDuplicate?: boolean; // Optional: Whether to overwrite duplicate files (default false)
  enableEnhance?: boolean; // Optional: Whether to enable enhance config (default true)
};

// Response type
export type CustomFileIdImportResponse = {
  collectionId: string;
  insertLen: number;
  overwritten?: boolean; // Whether overwrite operation was performed
  deletedCollectionId?: string; // Deleted old collection ID (only returned when overwritten)
  configAdjustments?: Array<{
    field: string;
    originalValue: any;
    adjustedValue: any;
    reason: string;
  }>;
};

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['txt', 'md', 'html', 'pdf', 'docx', 'pptx', 'xlsx', 'csv'];
const EXTERNAL_REQUIRED_EXTENSIONS = ['doc', 'ppt'];

/**
 * Get import mode configuration (use default mode from config)
 */
function getImportMode(): CustomFileImportModeType {
  const config = global.systemEnv?.customFileImport;
  const targetMode = config?.defaultActivateMode || 'default';

  addLog.debug('[FileImport] Getting import mode configuration', {
    targetMode,
    availableModes: config?.modes?.map((m) => ({ name: m.name, enabled: m.enabled }))
  });

  const mode = config?.modes?.find((m) => m.name === targetMode && m.enabled !== false);

  if (!mode) {
    addLog.error('[FileImport] Import mode not found or disabled', { targetMode });
    throw new Error(`Import mode not found or disabled: ${targetMode}`);
  }

  addLog.debug('[FileImport] Selected import mode configuration', {
    modeName: mode.name,
    chunkConfig: mode.chunkConfig,
    enhanceConfig: mode.enhanceConfig,
    parseConfig: mode.parseConfig,
    promptConfig: mode.promptConfig
  });

  return mode;
}

/**
 * Validate file extension
 */
function validateFileExtension(extension: string): void {
  const ext = extension.toLowerCase();

  if (EXTERNAL_REQUIRED_EXTENSIONS.includes(ext)) {
    if (!global.systemEnv?.customPdfParse?.url) {
      throw new Error(
        `File type .${ext} requires external parsing service. Please configure customPdfParse.url`
      );
    }
    return;
  }

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file type: .${ext}. Supported types: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
  }
}

async function handler(
  req: ApiRequestProps<CustomFileIdImportBody>
): Promise<CustomFileIdImportResponse> {
  const { datasetId, fileId, parentId, name, tags, overwriteDuplicate, enableEnhance } = req.body;

  // 1. Auth
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal,
    datasetId
  });

  // 2. Get file info
  const file = await getFileById({
    bucketName: BucketNameEnum.dataset,
    fileId
  });

  if (!file) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const filename = file.filename;
  const extension = filename?.split('.').pop()?.toLowerCase() || '';
  let fileName = name || filename;

  // 3. Validate file type
  validateFileExtension(extension);

  // 4. Handle duplicate file name (within transaction to avoid TOCTOU)
  let deletedCollectionId: string | undefined;
  let overwritten = false;

  // Normalize parentId: convert empty string to undefined
  const normalizedParentId = parentId && parentId.trim() !== '' ? parentId : undefined;

  await mongoSessionRun(async (session) => {
    // Build query for duplicate check - only check within the same parentId folder
    const duplicateQuery: Record<string, any> = {
      datasetId,
      name: fileName,
      type: DatasetCollectionTypeEnum.file
    };

    // Handle parentId query condition
    if (normalizedParentId) {
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
      if (overwriteDuplicate === true) {
        // 4.1 Overwrite: delete old collection within the same transaction
        deletedCollectionId = String(existingCollection._id);

        // Find all child collections
        const collections = await findCollectionAndChild({
          teamId,
          datasetId,
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
          `[FileImport] Overwritten collection: ${deletedCollectionId}, name: ${fileName}`
        );
      } else {
        // 4.2 No overwrite: add suffix to new file name
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
          datasetId,
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
          `[FileImport] Renamed duplicate file from '${name || filename}' to '${fileName}'`
        );
      }
    }
  });

  // Update GridFS filename if name was changed (outside transaction as it's a separate operation)
  if (fileName !== (name || filename)) {
    await updateGridFSFilename({
      bucketName: BucketNameEnum.dataset,
      fileId,
      newFilename: fileName
    });
  }

  // 5. Get configuration mode (use default mode from config)
  const importMode = getImportMode();

  // 6. Adaptive adjust configuration based on model availability
  const { adjustedEnhanceConfig, adjustedParseConfig, adjustments } = adaptiveAdjustConfig({
    dataset,
    modeConfig: importMode
  });

  // 6.1 If enableEnhance is false, disable all enhance config
  const finalEnhanceConfig =
    enableEnhance === false
      ? {
          dataEnhanceCollectionName: false,
          imageIndex: false,
          autoIndexes: false,
          hypeIndexes: false,
          indexPrefixTitle: false,
          small2bigIndexes: false,
          syntheticIndex: false,
          small2bigConfig: undefined
        }
      : adjustedEnhanceConfig;

  // 7. Log adjustments for debugging
  logAdaptiveAdjustments(datasetId, adjustments);

  // 8. Assemble complete parameters
  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      teamId,
      tmbId,
      datasetId,
      parentId: normalizedParentId,
      name: fileName,
      tags,
      type: DatasetCollectionTypeEnum.file,
      fileId,
      metadata: {
        relatedImgId: fileId
      },

      // Parse config (with adaptive adjustment)
      customPdfParse:
        adjustedParseConfig.customPdfParse ?? importMode.parseConfig?.customPdfParse ?? true,

      // Chunk config - use enum values
      trainingType:
        importMode.chunkConfig?.trainingType === 'qa'
          ? DatasetCollectionDataProcessModeEnum.qa
          : DatasetCollectionDataProcessModeEnum.chunk,
      chunkTriggerType:
        (importMode.chunkConfig?.chunkTriggerType as ChunkTriggerConfigTypeEnum) ||
        ChunkTriggerConfigTypeEnum.minSize,
      chunkTriggerMinSize: importMode.chunkConfig?.chunkTriggerMinSize || 1000,
      chunkSettingMode:
        (importMode.chunkConfig?.chunkSettingMode as ChunkSettingModeEnum) ||
        ChunkSettingModeEnum.auto,
      chunkSplitMode:
        (importMode.chunkConfig?.chunkSplitMode as DataChunkSplitModeEnum) ||
        DataChunkSplitModeEnum.paragraph,
      paragraphChunkAIMode:
        (importMode.chunkConfig?.paragraphChunkAIMode as ParagraphChunkAIModeEnum) ||
        ParagraphChunkAIModeEnum.forbid,
      paragraphChunkDeep: importMode.chunkConfig?.paragraphChunkDeep || 5,
      paragraphChunkMinSize: importMode.chunkConfig?.paragraphChunkMinSize || 100,
      chunkSize: importMode.chunkConfig?.chunkSize || 1000,
      chunkSplitter: importMode.chunkConfig?.chunkSplitter || '',
      indexSize: importMode.chunkConfig?.indexSize || 1024,

      // Enhance config (with adaptive adjustment)
      dataEnhanceCollectionName: finalEnhanceConfig.dataEnhanceCollectionName ?? false,
      imageIndex: finalEnhanceConfig.imageIndex ?? false,
      autoIndexes: finalEnhanceConfig.autoIndexes ?? false,
      hypeIndexes: finalEnhanceConfig.hypeIndexes ?? false,
      indexPrefixTitle: finalEnhanceConfig.indexPrefixTitle ?? false,
      small2bigIndexes: finalEnhanceConfig.small2bigIndexes ?? false,
      syntheticIndex: finalEnhanceConfig.syntheticIndex,
      small2bigConfig: finalEnhanceConfig.small2bigConfig,

      // Prompt config
      autoIndexesPrompt: importMode.promptConfig?.autoIndexesPrompt || '',
      hypeIndexPrompt: importMode.promptConfig?.hypeIndexPrompt || '',
      imageIndexPrompt: importMode.promptConfig?.imageIndexPrompt || '',
      qaPrompt: importMode.promptConfig?.qaPrompt || ''
    }
  });

  // 9. Remove buffer
  await deleteRawTextBuffer(fileId);

  return {
    collectionId,
    insertLen: insertResults?.insertLen ?? 0,
    ...(overwritten ? { overwritten, deletedCollectionId } : {}),
    configAdjustments: adjustments.length > 0 ? adjustments : undefined
  };
}

export default NextAPI(handler);
