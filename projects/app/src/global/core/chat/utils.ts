import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatHistoryItemResType,
  ChatItemMiniType,
  ToolCiteLinksType,
  ErrorTextItemType
} from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  filterNodeResponseTreeData,
  filterPublicNodeResponseData,
  findFailedResponseNode,
  getFlatAppResponses
} from '@fastgpt/global/core/chat/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.toolCall;

// Workflow CLI 通过 Workflow Builder 的共享 Sandbox 执行，也应沿用通用 Sandbox 入口展示规则。
const workflowBuilderSandboxToolIds = new Set([
  'workflow_cli_query',
  'workflow_cli_stage',
  'workflow_cli_commit'
]);

const isSandboxToolId = (toolId?: string) =>
  !!toolId &&
  (Object.prototype.hasOwnProperty.call(sandboxToolMap, toolId) ||
    workflowBuilderSandboxToolIds.has(toolId));

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
 * 按历史记录加载口径提取聊天气泡错误。
 *
 * 统一复用 findFailedResponseNode：
 * 忽略工具执行响应以及已被捕获的错误；优先提取根节点错误，孤儿异常错误兜底。
 */
export const getChatItemErrorText = (
  responseData: ChatHistoryItemResType[] = []
): ErrorTextItemType | undefined => {
  const failedNode = findFailedResponseNode(responseData);
  if (!failedNode) return undefined;

  const nodeErrorText = failedNode.errorText || getErrText(failedNode.error);
  if (!nodeErrorText) return undefined;

  return {
    moduleName: failedNode.moduleName,
    errorText: nodeErrorText
  };
};

const PUBLIC_CHAT_ITEM_ERROR_TEXT = i18nT('common:core.chat.error.Chat error');

/**
 * 分享/公开历史边界的错误摘要提取。
 *
 * 先基于完整父子关系判定整轮是否真实失败（避免先裁剪非公开父节点后将已捕获循环内的子节点误判为孤儿），
 * 再校验失败节点是否属于公开节点白名单并脱敏为通用错误文案；非公开内部节点返回 `undefined`。
 */
export const getPublicChatItemErrorText = (
  responseData: ChatHistoryItemResType[] = []
): ErrorTextItemType | undefined => {
  const failedNode = findFailedResponseNode(responseData);
  if (!failedNode) return undefined;

  const isPublicNode = filterNodeResponseTreeData({ nodeResponses: [failedNode] }).length > 0;
  if (!isPublicNode) return undefined;

  return {
    moduleName: failedNode.moduleName,
    errorText: PUBLIC_CHAT_ITEM_ERROR_TEXT
  };
};

/**
 * 匿名分享历史记录的公开裁剪边界（纯函数，供列表接口与完成态恢复共用）。
 *
 * 先按完整响应关系提取并脱敏公开错误摘要，再执行 `filterPublicNodeResponseData` 裁剪节点详情，
 * 返回新记录对象而不修改入参。
 */
export const sanitizeOutLinkChatHistoryItem = <T extends ChatItemMiniType>(
  item: T,
  showCite: boolean
): T => {
  if (item.obj !== ChatRoleEnum.AI) return item;

  const publicErrorText = getPublicChatItemErrorText(item.responseData);
  return {
    ...item,
    errorText:
      publicErrorText ??
      (item.errorText
        ? {
            moduleName: item.errorText.moduleName,
            errorText: PUBLIC_CHAT_ITEM_ERROR_TEXT
          }
        : undefined),
    responseData: filterPublicNodeResponseData({
      nodeRespones: item.responseData,
      responseDetail: showCite
    })
  };
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
  'data.errorCaptured': 1,
  'data.isToolCall': 1
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
  // 预览记录（已清除 responseData）可直接复用预计算标签；
  // 交互续跑或恢复写入新 responseData 后需保留已有引用/外链，仅增量合并新响应并提取最新 errorText。
  if ((hasResolvedTags && !historyItem.responseData?.length) || !historyItem.responseData)
    return withUseAgentSandbox(historyItem, useAgentSandbox);

  const existingQuoteList = historyItem.totalQuoteList ?? [];
  const existingToolCiteLinks = historyItem.toolCiteLinks ?? [];
  const initialLinkDedupe = new Set(
    existingToolCiteLinks.map(({ name = '', url = '' }) => `${name}::${url}`)
  );

  // Flat children
  const flatResData = getFlatAppResponses(historyItem.responseData || []);

  // get llm module account and history preview length and total quote list and external link list and error text
  const {
    useAgentSandbox: resolvedUseAgentSandbox,
    llmModuleAccount,
    historyPreviewLength,
    totalQuoteList,
    toolCiteLinks
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

      return acc;
    },
    {
      useAgentSandbox,
      totalQuoteList: [] as SearchDataResponseQuoteListItemType[],
      toolCiteLinks: [...existingToolCiteLinks] as ToolCiteLinksType[],
      linkDedupe: initialLinkDedupe,
      llmModuleAccount: 0,
      historyPreviewLength: undefined as number | undefined
    }
  );
  const errorText = getChatItemErrorText(historyItem.responseData) ?? historyItem.errorText;

  // Filter new quote list to only include citations actually referenced in the response text,
  // while preserving previously resolved quotes (e.g. from pre-pause history previews).
  const responseText = historyItem.value.map((v) => v.text?.content || '').join('');
  const citedIds = new Set(extractCitationIdsFromText(responseText));
  const quoteDedupe = new Set<string>();
  const filteredQuoteList: SearchDataResponseQuoteListItemType[] = [];
  existingQuoteList.forEach((quote) => {
    if (quote.id) {
      if (quoteDedupe.has(quote.id)) return;
      quoteDedupe.add(quote.id);
    }
    filteredQuoteList.push(quote);
  });
  totalQuoteList.forEach((quote) => {
    if (!quote.id || !citedIds.has(quote.id) || quoteDedupe.has(quote.id)) return;

    quoteDedupe.add(quote.id);
    filteredQuoteList.push(quote);
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
