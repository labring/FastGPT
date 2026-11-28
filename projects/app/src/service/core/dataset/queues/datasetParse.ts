import { isProVersion } from '@fastgpt/service/common/system/constants';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';

/* Dataset collection source parse, not max size. */

import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import {
  DatasetCollectionDataProcessModeEnum,
  DatasetCollectionTypeEnum,
  DatasetSourceReadTypeEnum,
  ParagraphChunkAIModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';
import type {
  DatasetCollectionSchemaType,
  DatasetSchemaType
} from '@fastgpt/global/core/dataset/type';
import { predictDataLimitLength } from '@fastgpt/global/core/dataset/utils';
import { UsageItemTypeEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getTrainingModeByCollection } from '@fastgpt/service/core/dataset/collection/utils';
import { rawText2Chunks, readDatasetSourceRawText } from '@fastgpt/service/core/dataset/read';
import { getDatasetImageIndexCapability } from '@fastgpt/service/core/dataset/utils';
import { checkDatasetIndexLimit } from '@fastgpt/service/support/permission/teamLimit';
import type { pushLLMTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { postCreateParagraphTitle } from '@fastgpt/service/thirdProvider/fastgptPro/api';
import { getDatasetIultmzhFileParseConfig } from '@fastgpt/service/thirdProvider/sangfor/parseConfig';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE_PARSE);

/** 自动 AI 分段失败回退原文；强制模式的错误由解析任务重试，成功用量由调用方记账。 */
const requestLLMPargraph = async ({
  rawText,
  modelId,
  teamId,
  billId,
  paragraphChunkAIMode
}: {
  rawText: string;
  modelId?: string;
  teamId: string;
  billId: string;
  paragraphChunkAIMode?: ParagraphChunkAIModeEnum;
}) => {
  if (
    !isProVersion() ||
    !paragraphChunkAIMode ||
    paragraphChunkAIMode === ParagraphChunkAIModeEnum.forbid
  ) {
    return {
      resultText: rawText,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0
    };
  }

  if (paragraphChunkAIMode === ParagraphChunkAIModeEnum.auto) {
    // Check if the text contains Markdown header structure
    const hasMarkdownHeaders = /^(#+)\s/m.test(rawText);
    const hasMultipleHeaders = (rawText.match(/^(#+)\s/gm) || []).length > 1;

    const isMarkdown = hasMarkdownHeaders && hasMultipleHeaders;

    if (isMarkdown) {
      return {
        resultText: rawText,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      };
    }
  }

  try {
    return await postCreateParagraphTitle({ rawText, modelId, teamId, billId });
  } catch (error) {
    if (paragraphChunkAIMode !== ParagraphChunkAIModeEnum.auto) throw error;
    // 自动分段只是增强能力，失败时保留原文，不伪造成功用量。
    logger.warn('Automatic AI paragraph skipped after failure', { teamId, modelId, billId, error });
    return {
      resultText: rawText,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0
    };
  }
};

/**
 * 识别会让解析任务必须暂停的团队额度错误，返回值供调用方区分日志级别与提示文案。
 *
 * 枚举值收敛在函数内部，调用方不需要（也不应该）自己传错误码。
 * 同时兼容两种抛出形态：`checkDatasetIndexLimit` 直接 `Promise.reject(枚举值)`，
 * 经上层包装后则可能是 `Error.message`。
 */
export const getDatasetParseQuotaErrorCode = (err: unknown): TeamErrEnum | undefined => {
  const code = err instanceof Error ? err.message : err;

  if (code === TeamErrEnum.datasetSizeNotEnough) return TeamErrEnum.datasetSizeNotEnough;
  if (code === TeamErrEnum.aiPointsNotEnough) return TeamErrEnum.aiPointsNotEnough;
  return undefined;
};

/**
 * 读取集合来源并分块，返回需要在提交后记账的增强用量。
 */
export const prepareDatasetCollectionParse = async ({
  collection,
  dataset,
  teamId,
  tmbId,
  usageId
}: {
  collection: DatasetCollectionSchemaType;
  dataset: DatasetSchemaType;
  teamId: string;
  tmbId: string;
  usageId: string;
}) => {
  // 解析阶段只严格校验向量模型；辅助模型仅取分块元数据，不校验启用或可调用状态。
  const modelHandle = await getTeamModelHandle({ teamId });
  const embeddingModelData = modelHandle.getModelData(
    getDatasetModelReference(dataset, 'embedding'),
    { type: 'embedding' }
  );
  const agentModelData = modelHandle.findModelData(getDatasetModelReference(dataset, 'agent'), {
    type: 'llm'
  });
  const vlmModelData = modelHandle.findModelData(getDatasetModelReference(dataset, 'vlm'), {
    type: 'llm',
    vision: true
  });
  const vlmModelConfigured = !isEmptyModelValue(
    getModelReferenceValue({ modelId: dataset.vlmModelId, model: dataset.vlmModel })
  );
  const trainingMode = getTrainingModeByCollection({
    trainingType: collection.trainingType ?? DatasetCollectionDataProcessModeEnum.chunk,
    autoIndexes: collection.autoIndexes,
    imageIndex: collection.imageIndex,
    supportImageIndex:
      vlmModelConfigured ||
      getDatasetImageIndexCapability({ vectorModel: embeddingModelData }).supportImageIndex
  });

  // 1. Parse rawtext
  const sourceReadType = await (async () => {
    if (collection.type === DatasetCollectionTypeEnum.link) {
      if (!collection.rawLink) return Promise.reject('rawLink is missing');
      return {
        type: DatasetSourceReadTypeEnum.link,
        sourceId: collection.rawLink,
        selector: collection.metadata?.webPageSelector
      };
    }
    if (collection.type === DatasetCollectionTypeEnum.file) {
      if (!collection.fileId) return Promise.reject('fileId is missing');
      return {
        type: DatasetSourceReadTypeEnum.fileLocal,
        sourceId: String(collection.fileId)
      };
    }
    if (collection.type === DatasetCollectionTypeEnum.apiFile) {
      if (!collection.apiFileId) return Promise.reject('apiFileId is missing');
      return {
        type: DatasetSourceReadTypeEnum.apiFile,
        sourceId: collection.apiFileId,
        apiDatasetServer: dataset.apiDatasetServer
      };
    }
    if (collection.type === DatasetCollectionTypeEnum.externalFile) {
      if (!collection.externalFileUrl) return Promise.reject('externalFileId is missing');
      return {
        type: DatasetSourceReadTypeEnum.externalFile,
        sourceId: collection.externalFileUrl,
        externalFileId: collection.externalFileId
      };
    }

    return null;
  })();

  if (!sourceReadType) return null;

  // 模板与备份同为 CSV 结构化导入（逐行 q/a/index/metadata），重解析必须走行解析器，
  // 且必须读取原始 CSV——默认的 formatText 是 Markdown 表格，行解析器识别不出表头。
  const csvStructured =
    collection.trainingType === DatasetCollectionDataProcessModeEnum.backup ||
    collection.trainingType === DatasetCollectionDataProcessModeEnum.template;

  const { title, rawText } = await readDatasetSourceRawText({
    teamId,
    tmbId,
    customPdfParse: collection.customPdfParse,
    getFormatText: !csvStructured,
    // 解析开关仅对外部解析路径生效;非 customPdfParse 时传 undefined,rawText 缓存沿用旧 key
    sangforFileParseConfig: collection.customPdfParse
      ? getDatasetIultmzhFileParseConfig(dataset)
      : undefined,
    usageId,
    datasetId: String(dataset._id),
    ...sourceReadType
  });

  // 3. LLM Pargraph
  const { resultText, totalInputTokens, totalOutputTokens, cacheReadTokens, cacheCreationTokens } =
    await requestLLMPargraph({
      rawText,
      modelId: agentModelData?.modelId ?? dataset.agentModelId,
      teamId,
      billId: usageId,
      paragraphChunkAIMode: collection.paragraphChunkAIMode
    });
  // 跳过 AI 分段时没有用量，不要求文本模型存在；实际消耗不能在缺少计费元数据时静默漏记。
  let paragraphUsage: Parameters<typeof pushLLMTrainingUsage>[0] | undefined;
  if (
    totalInputTokens > 0 ||
    totalOutputTokens > 0 ||
    (cacheReadTokens ?? 0) > 0 ||
    (cacheCreationTokens ?? 0) > 0
  ) {
    if (!agentModelData) throw new Error('AI paragraph model metadata unavailable for billing');
    paragraphUsage = {
      teamId,
      model: agentModelData,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      usageId,
      type: UsageItemTypeEnum.training_paragraph
    };
  }

  // 4. Chunk split
  const chunks = await rawText2Chunks({
    rawText: resultText,
    chunkTriggerType: collection.chunkTriggerType,
    chunkTriggerMinSize: collection.chunkTriggerMinSize,
    chunkSize: collection.chunkSize,
    paragraphChunkDeep: collection.paragraphChunkDeep,
    paragraphChunkMinSize: collection.paragraphChunkMinSize,
    maxSize: getLLMMaxChunkSize(agentModelData),
    overlapRatio: collection.trainingType === DatasetCollectionDataProcessModeEnum.chunk ? 0.2 : 0,
    customReg: collection.chunkSplitter ? [collection.chunkSplitter] : [],
    chunkSettingMode: collection.chunkSettingMode,
    trainingType: collection.trainingType,
    backupParse: csvStructured
  });

  // Check dataset limit
  await checkDatasetIndexLimit({
    teamId,
    insertLen: Math.round(predictDataLimitLength(trainingMode, chunks) * 0.7)
  });

  const trainingData = chunks.map((item, index) => ({
    ...item,
    indexes: item.indexes?.map((text) => ({
      type: DatasetDataIndexTypeEnum.custom,
      text
    })),
    chunkIndex: index
  }));

  return {
    collectionUpdate: {
      ...(title && { name: title }),
      rawTextLength: resultText.length,
      hashRawText: hashStr(resultText)
    },
    trainingMode,
    trainingData,
    agentModelData,
    embeddingModelData,
    vlmModelData,
    vlmModelConfigured,
    paragraphUsage
  };
};
