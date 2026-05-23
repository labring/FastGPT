import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

const datasetSearchModuleLogo = 'core/workflow/template/datasetSearch';

const createDatasetSearchChildNodeResponse = ({
  requestIds,
  usage,
  moduleName,
  seconds,
  textOutput
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  moduleName: string;
  seconds?: number;
  textOutput?: string;
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
    model: usage.model,
    llmRequestIds: requestIds,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalPoints: usage.totalPoints,
    textOutput
  };
};

/**
 * 创建知识库搜索里的 query extension 子 nodeResponse。
 * 这里记录的是扩展查询的 LLM 请求本身，embedding 选词消耗仍走父知识库搜索 usage 汇总。
 */
export const createQueryExtensionChildNodeResponse = ({
  requestIds,
  usage,
  seconds,
  query
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  seconds?: number;
  query: string;
}) =>
  createDatasetSearchChildNodeResponse({
    requestIds,
    usage,
    seconds,
    moduleName: i18nT('common:core.module.template.Query extension'),
    textOutput: query
  });

/**
 * 创建知识库搜索里的图片解析子 nodeResponse。
 * 一次图搜可能解析多张图片，所以这里保留所有 caption LLM requestIds。
 */
export const createImageCaptionChildNodeResponse = ({
  requestIds,
  usage,
  seconds,
  queries
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  seconds?: number;
  queries: string[];
}) =>
  createDatasetSearchChildNodeResponse({
    requestIds,
    usage,
    seconds,
    moduleName: i18nT('account_usage:image_parse'),
    textOutput: queries.join('\n')
  });

/**
 * 创建知识库搜索里的 chunk selection 子 nodeResponse。
 * Agent 知识库工具会在搜索结果过长时触发该 LLM 裁切请求，requestIds 只挂在这个子节点上。
 */
export const createChunkSelectionChildNodeResponse = ({
  requestIds,
  usage,
  seconds,
  selectedChunkIds
}: {
  requestIds: string[];
  usage: ChatNodeUsageType;
  seconds?: number;
  selectedChunkIds: string[];
}) =>
  createDatasetSearchChildNodeResponse({
    requestIds,
    usage,
    seconds,
    moduleName: i18nT('account_usage:dataset_chunk_selection'),
    textOutput: selectedChunkIds.join('\n')
  });
