import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
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
import type { CustomLinkImportModeType } from '@fastgpt/global/common/system/types/index';
import type { CollectionTagValueType } from '@fastgpt/global/core/dataset/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';

export type CustomWebsiteImportBody = {
  datasetId: string;
  parentId?: string;
  urls: string[];
  autoSync?: boolean;
  tags?: CollectionTagValueType[];
};

export type CustomWebsiteImportResponse = {
  collectionIds: string[];
};

/**
 * 获取链接导入模式配置（使用 config 中的默认模式）
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
 * 从 URL 提取集合名称
 */
function extractNameFromUrl(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    return u.pathname.replace(/\/$/, '').split('/').pop() || u.hostname;
  } catch {
    return pageUrl;
  }
}

async function handler(
  req: ApiRequestProps<CustomWebsiteImportBody>
): Promise<CustomWebsiteImportResponse> {
  const { datasetId, parentId, urls, tags } = req.body;

  if (!datasetId || !Array.isArray(urls) || urls.length === 0) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const pageUrls = urls.slice(0, 10);
  for (const u of pageUrls) {
    try {
      new URL(u);
    } catch {
      return Promise.reject(new Error(`Invalid URL: ${u}`));
    }
  }

  const { teamId, tmbId, dataset } = parentId
    ? await authDatasetCollection({
        req,
        authToken: true,
        authApiKey: true,
        collectionId: parentId,
        per: WritePermissionVal
      }).then((res) => {
        if (datasetId && String(res.collection.datasetId) !== String(datasetId)) {
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
        datasetId,
        per: WritePermissionVal
      });

  const importMode = getLinkImportMode();
  const collectionIds: string[] = [];

  await Promise.allSettled(
    pageUrls.map(async (pageUrl) => {
      try {
        const { adjustedEnhanceConfig, adjustments } = adaptiveAdjustConfig({
          dataset,
          modeConfig: importMode
        });
        logAdaptiveAdjustments(datasetId, adjustments);

        const { collectionId } = await createCollectionAndInsertData({
          dataset,
          createCollectionParams: {
            teamId,
            tmbId,
            datasetId,
            parentId,
            name: extractNameFromUrl(pageUrl),
            tags,
            type: DatasetCollectionTypeEnum.link,
            rawLink: pageUrl,
            customPdfParse: false,
            metadata: {
              relatedImgId: pageUrl,
              webPageSelector: importMode.parseConfig?.webPageSelector || ''
            },
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
            autoIndexes: adjustedEnhanceConfig.autoIndexes ?? false,
            hypeIndexes: adjustedEnhanceConfig.hypeIndexes ?? false,
            imageIndex: adjustedEnhanceConfig.imageIndex ?? false,
            syntheticIndex: adjustedEnhanceConfig.syntheticIndex,
            autoIndexesPrompt: importMode.promptConfig?.autoIndexesPrompt || '',
            hypeIndexPrompt: importMode.promptConfig?.hypeIndexPrompt || ''
          }
        });

        collectionIds.push(collectionId);
      } catch (err) {
        console.error(`Failed to create collection for ${pageUrl}:`, err);
      }
    })
  );

  return { collectionIds };
}

export default NextAPI(handler);
