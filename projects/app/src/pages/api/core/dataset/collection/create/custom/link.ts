import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { createCollectionAndInsertData } from '@fastgpt/service/core/dataset/collection/controller';
import {
  DatasetCollectionTypeEnum,
  DatasetCollectionDataProcessModeEnum,
  ChunkTriggerConfigTypeEnum,
  ChunkSettingModeEnum,
  DataChunkSplitModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  adaptiveAdjustConfig,
  logAdaptiveAdjustments
} from '@fastgpt/service/core/dataset/collection/adaptiveConfig';
import type { CustomLinkImportModeType } from '@fastgpt/global/common/system/types/index.d';

// Request body type
export type CustomLinkImportBody = {
  datasetId: string; // Required: Dataset ID
  link: string; // Required: Web page link
  parentId?: string; // Optional: Parent directory ID
  name?: string; // Optional: Custom name (defaults to extracted from link)
  tags?: string[]; // Optional: Tags
  enableEnhance?: boolean; // Optional: Whether to enable enhance config (default true)
};

// Response type
export type CustomLinkImportResponse = {
  collectionId: string;
  insertLen: number;
  configAdjustments?: Array<{
    field: string;
    originalValue: any;
    adjustedValue: any;
    reason: string;
  }>;
};

/**
 * Get link import mode configuration (use default mode from config)
 */
function getLinkImportMode(): CustomLinkImportModeType {
  const config = global.systemEnv?.customLinkImport;
  const targetMode = config?.defaultActivateMode || 'default';

  const mode = config?.modes?.find((m) => m.name === targetMode && m.enabled !== false);

  if (!mode) {
    throw new Error(`Import mode not found or disabled: ${targetMode}`);
  }

  return mode;
}

/**
 * Validate link format
 */
function validateLink(link: string): void {
  try {
    new URL(link);
  } catch {
    throw new Error(`Invalid link format: ${link}`);
  }
}

/**
 * Extract name from link
 */
function extractNameFromLink(link: string): string {
  try {
    const url = new URL(link);
    const pathname = decodeURIComponent(url.pathname);
    const filename = pathname.split('/').pop() || url.hostname;
    return filename;
  } catch {
    return link.substring(0, 50);
  }
}

async function handler(
  req: ApiRequestProps<CustomLinkImportBody>
): Promise<CustomLinkImportResponse> {
  const { datasetId, link, parentId, name, tags, enableEnhance } = req.body;

  // 1. Auth
  const { teamId, tmbId, dataset } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: WritePermissionVal
  });

  // 2. Validate link
  validateLink(link);

  // 3. Get configuration mode (use default mode from config)
  const importMode = getLinkImportMode();

  // 4. Adaptive adjust configuration based on model availability
  const { adjustedEnhanceConfig, adjustments } = adaptiveAdjustConfig({
    dataset,
    modeConfig: importMode
  });

  // 4.1 If enableEnhance is false, disable all enhance config
  const finalEnhanceConfig =
    enableEnhance === false
      ? {
          autoIndexes: false,
          hypeIndexes: false,
          imageIndex: false,
          syntheticIndex: false
        }
      : adjustedEnhanceConfig;

  // 5. Log adjustments for debugging
  logAdaptiveAdjustments(datasetId, adjustments);

  // 6. Assemble complete parameters and call original logic
  const { collectionId, insertResults } = await createCollectionAndInsertData({
    dataset,
    createCollectionParams: {
      teamId,
      tmbId,
      datasetId,
      parentId,
      name: name || extractNameFromLink(link),
      tags,
      type: DatasetCollectionTypeEnum.link,
      rawLink: link,
      metadata: {
        relatedImgId: link,
        webPageSelector: importMode.parseConfig?.webPageSelector || ''
      },

      // Link import doesn't need PDF parsing
      customPdfParse: false,

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
      chunkSize: importMode.chunkConfig?.chunkSize || 1000,
      indexSize: importMode.chunkConfig?.indexSize || 1024,

      // Enhance config (with adaptive adjustment)
      autoIndexes: finalEnhanceConfig.autoIndexes ?? false,
      hypeIndexes: finalEnhanceConfig.hypeIndexes ?? false,
      imageIndex: finalEnhanceConfig.imageIndex ?? false,
      syntheticIndex: finalEnhanceConfig.syntheticIndex,

      // Prompt config
      autoIndexesPrompt: importMode.promptConfig?.autoIndexesPrompt || '',
      hypeIndexPrompt: importMode.promptConfig?.hypeIndexPrompt || ''
    }
  });

  return {
    collectionId,
    insertLen: insertResults?.insertLen ?? 0,
    configAdjustments: adjustments.length > 0 ? adjustments : undefined
  };
}

export default NextAPI(handler);
