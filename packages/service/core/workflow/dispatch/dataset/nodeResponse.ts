import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

const datasetSearchModuleLogo = 'core/workflow/template/datasetSearch';

const createDatasetSearchChildNodeResponse = ({
  requestIds,
  usage,
  modelName,
  moduleName,
  seconds,
  textOutput,
  embeddingTokens
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  modelName: string;
  moduleName: string;
  seconds?: number;
  textOutput?: string;
  embeddingTokens?: number;
}): ChatHistoryItemResType => {
  const [id] = requestIds;
  if (!id) {
    throw new Error('Dataset search child node response requires requestIds');
  }

  return {
    id,
    nodeId: id,
    moduleType: FlowNodeTypeEnum.datasetSearchNode,
    moduleName,
    moduleLogo: datasetSearchModuleLogo,
    runningTime: seconds,
    modelId: usage.modelId,
    model: modelName,
    llmRequestIds: requestIds,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(embeddingTokens ? { embeddingTokens } : {}),
    totalPoints: usage.totalPoints,
    textOutput
  };
};

/**
 * 创建知识库搜索里的 query extension 子 nodeResponse。
 *
 * 扩展查询的 LLM 消耗记在 usage 上；扩展选词还会额外做一次 embedding，那次 embedding
 * 没有独立 row，只能挂在子 response 的 embeddingTokens 上，否则 app chat log 会少统计
 * 这块 token（账单侧是有的，两页会对不上）。
 */
export const createQueryExtensionChildNodeResponse = ({
  requestIds,
  usage,
  modelName,
  seconds,
  query,
  embeddingTokens
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  modelName: string;
  seconds?: number;
  query: string;
  embeddingTokens?: number;
}) =>
  createDatasetSearchChildNodeResponse({
    requestIds,
    usage,
    modelName,
    seconds,
    moduleName: i18nT('common:core.module.template.Query extension'),
    textOutput: query,
    embeddingTokens
  });

/**
 * 创建知识库搜索里的图片解析子 nodeResponse。
 * 一次图搜可能解析多张图片，所以这里保留所有 caption LLM requestIds。
 */
export const createImageCaptionChildNodeResponse = ({
  requestIds,
  usage,
  modelName,
  seconds,
  queries
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  modelName: string;
  seconds?: number;
  queries: string[];
}) =>
  createDatasetSearchChildNodeResponse({
    requestIds,
    usage,
    modelName,
    seconds,
    moduleName: i18nT('chat:image_parse'),
    textOutput: queries.join('\n')
  });

/**
 * 创建知识库搜索里的 chunk selection 子 nodeResponse。
 * Agent 知识库工具会在搜索结果过长时触发该 LLM 裁切请求，requestIds 只挂在这个子节点上。
 */
export const createChunkSelectionChildNodeResponse = ({
  requestIds,
  usage,
  modelName,
  seconds,
  selectedChunkIds
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  modelName: string;
  seconds?: number;
  selectedChunkIds: string[];
}) =>
  createDatasetSearchChildNodeResponse({
    requestIds,
    usage,
    modelName,
    seconds,
    moduleName: i18nT('account_usage:dataset_chunk_selection'),
    textOutput: selectedChunkIds.join('\n')
  });
