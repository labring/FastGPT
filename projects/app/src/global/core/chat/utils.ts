import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatHistoryItemResType,
  ChatItemMiniType,
  ToolCiteLinksType,
  ErrorTextItemType
} from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getFlatAppResponses } from '@fastgpt/global/core/chat/utils';
import { sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.toolCall;

const isSandboxToolId = (toolId?: string) =>
  !!toolId && Object.prototype.hasOwnProperty.call(sandboxToolMap, toolId);

const isSandboxChatTool = (tool?: { functionName?: string } | null) =>
  isSandboxToolId(tool?.functionName);

const hasSandboxToolInChatValue = (historyItem: ChatItemMiniType) => {
  if (historyItem.obj !== ChatRoleEnum.AI) return false;

  return historyItem.value.some((item) => {
    if (isSandboxChatTool(item.tool)) return true;

    return item.tools?.some(isSandboxChatTool) === true;
  });
};

const withUseAgentSandbox = (historyItem: ChatItemMiniType, useAgentSandbox: boolean) => {
  if (!useAgentSandbox || historyItem.useAgentSandbox === true) return historyItem;

  return {
    ...historyItem,
    useAgentSandbox
  };
};

/**
 * 从节点运行详情中提取可直接展示在聊天气泡上的错误文本。
 *
 * 部分节点失败时历史数据只写入顶层 `error`，不一定有专门用于展示的 `errorText`。
 * 这里统一兜底，避免报错卡片显示“无输出”。
 */
const getNodeErrorText = (item: ChatHistoryItemResType) => {
  // 开启错误捕获的节点会把错误交给 catch 分支继续执行，聊天气泡不应把它当最终失败展示。
  if (item.errorCaptured) return;

  return item.errorText || getErrText(item.error);
};

/**
 * 聊天列表预览只需要从 nodeResponse rows 中提取标签和错误摘要。
 *
 * 不包含 `historyPreview` 和 `error`：前者只用于详情弹窗，后者可能是大对象；列表错误展示优先
 * 使用轻量的 `errorText`，chat item 自身还有 `errorMsg` 兜底。
 */
export const chatItemResponsePreviewProjection = {
  chatItemDataId: 1,
  'data.id': 1,
  'data.parentId': 1,
  'data.moduleType': 1,
  'data.moduleName': 1,
  'data.quoteList.id': 1,
  'data.quoteList.collectionId': 1,
  'data.quoteList.datasetId': 1,
  'data.quoteList.sourceId': 1,
  'data.quoteList.sourceName': 1,
  'data.quoteList.chunkIndex': 1,
  'data.quoteList.score': 1,
  'data.toolId': 1,
  'data.toolRes.citeLinks': 1,
  'data.errorText': 1,
  'data.errorCaptured': 1
} as const;

export function transformPreviewHistories(
  histories: ChatItemMiniType[],
  responseDetail: boolean
): ChatItemMiniType[] {
  return histories.map((item) => {
    return {
      ...addStatisticalDataToHistoryItem(item),
      responseData: undefined,
      ...(responseDetail ? {} : { totalQuoteList: undefined })
    };
  });
}

const extractCitationIdsFromText = (text: string): string[] => {
  if (!text) return [];

  // Match [24-bit hexadecimal ID](CITE|QUOTE) format. Markdown rendering supports both.
  const citeRegex = /\[([a-f0-9]{24})\]\((?:CITE|QUOTE)\)/gi;
  const matches = text.match(citeRegex);

  if (!matches) return [];

  // Extract ID part (24-bit hexadecimal in brackets)
  const ids = matches
    .map((match) => {
      const idMatch = match.match(/\[([a-f0-9]{24})\]/);
      return idMatch ? idMatch[1] : null;
    })
    .filter((id): id is string => id !== null);

  // Deduplicate
  return Array.from(new Set(ids));
};

export function addStatisticalDataToHistoryItem(historyItem: ChatItemMiniType) {
  if (historyItem.obj !== ChatRoleEnum.AI) return historyItem;
  const useAgentSandbox =
    historyItem.useAgentSandbox === true || hasSandboxToolInChatValue(historyItem);
  const hasResolvedTags =
    historyItem.totalQuoteList !== undefined || historyItem.toolCiteLinks !== undefined;
  if (hasResolvedTags || !historyItem.responseData)
    return withUseAgentSandbox(historyItem, useAgentSandbox);

  // Flat children
  const flatResData = getFlatAppResponses(historyItem.responseData || []);

  // get llm module account and history preview length and total quote list and external link list and error text
  const {
    useAgentSandbox: resolvedUseAgentSandbox,
    llmModuleAccount,
    historyPreviewLength,
    totalQuoteList,
    toolCiteLinks,
    errorText
  } = flatResData.reduce(
    (acc, item) => {
      // LLM
      if (isLLMNode(item)) {
        acc.llmModuleAccount = acc.llmModuleAccount + 1;
        if (acc.historyPreviewLength === undefined) {
          acc.historyPreviewLength = item.historyPreview?.length;
        }
      }

      // Dataset search result
      if (item.moduleType === FlowNodeTypeEnum.datasetSearchNode && item.quoteList) {
        acc.totalQuoteList.push(...item.quoteList.filter(Boolean));
      }

      // Tool call
      if (item.moduleType === FlowNodeTypeEnum.tool) {
        const citeLinks = item?.toolRes?.citeLinks;
        if (citeLinks && Array.isArray(citeLinks)) {
          citeLinks.forEach(({ name = '', url = '' }: ToolCiteLinksType) => {
            if (url) {
              const key = `${name}::${url}`;
              if (!acc.linkDedupe.has(key)) {
                acc.linkDedupe.add(key);
                acc.toolCiteLinks.push({ name, url });
              }
            }
          });
        } else if (isSandboxToolId(item.toolId)) {
          acc.useAgentSandbox = true;
        }
      }

      const nodeErrorText = getNodeErrorText(item);
      if (nodeErrorText) {
        acc.errorText = {
          moduleName: item.moduleName,
          errorText: nodeErrorText
        };
      }

      return acc;
    },
    {
      useAgentSandbox,
      totalQuoteList: [] as SearchDataResponseQuoteListItemType[],
      toolCiteLinks: [] as ToolCiteLinksType[],
      linkDedupe: new Set<string>(),
      errorText: undefined as ErrorTextItemType | undefined,
      llmModuleAccount: 0,
      historyPreviewLength: undefined as number | undefined
    }
  );

  // Filter quote list to only include citations actually referenced in the response text
  const responseText = historyItem.value.map((v) => v.text?.content || '').join('');
  const citedIds = new Set(extractCitationIdsFromText(responseText));
  const quoteDedupe = new Set<string>();
  const filteredQuoteList = totalQuoteList.filter((quote) => {
    if (!quote.id || !citedIds.has(quote.id) || quoteDedupe.has(quote.id)) return false;

    quoteDedupe.add(quote.id);
    return true;
  });

  return {
    ...historyItem,
    useAgentSandbox: resolvedUseAgentSandbox,
    totalQuoteList: filteredQuoteList,
    ...(toolCiteLinks.length ? { toolCiteLinks } : {}),
    ...(errorText ? { errorText } : {}),

    /** @deprecated */
    llmModuleAccount,
    /** @deprecated */
    historyPreviewLength
  };
}
