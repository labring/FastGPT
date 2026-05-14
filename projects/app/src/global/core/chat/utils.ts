import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatHistoryItemResType,
  ChatItemMiniType,
  ToolCiteLinksType,
  ErrorTextItemType
} from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getFlatAppResponses } from '@fastgpt/global/core/chat/utils';
import { SANDBOX_FILE_DISPLAY_TOOLS } from '@fastgpt/global/core/ai/sandbox/constants';

export const isLLMNode = (item: ChatHistoryItemResType) =>
  item.moduleType === FlowNodeTypeEnum.chatNode || item.moduleType === FlowNodeTypeEnum.toolCall;

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

  // Match [24-bit hexadecimal ID](CITE) format
  const citeRegex = /\[([a-f0-9]{24})\]\(CITE\)/gi;
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
  if (historyItem.totalQuoteList !== undefined || historyItem.toolCiteLinks !== undefined)
    return historyItem;
  if (!historyItem.responseData) return historyItem;

  // Flat children
  const flatResData = getFlatAppResponses(historyItem.responseData || []);

  // get llm module account and history preview length and total quote list and external link list and error text
  const {
    useSandboxFileDisplay,
    llmModuleAccount,
    historyPreviewLength,
    quoteList,
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
        acc.quoteList.push(...item.quoteList.filter(Boolean));
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
        } else if (item.toolId && SANDBOX_FILE_DISPLAY_TOOLS.has(item.toolId)) {
          acc.useSandboxFileDisplay = true;
        }
      }

      if (item.errorText && !acc.errorText) {
        acc.errorText = {
          moduleName: item.moduleName,
          errorText: item.errorText
        };
      }

      return acc;
    },
    {
      useSandboxFileDisplay: false,
      llmModuleAccount: 0,
      historyPreviewLength: undefined as number | undefined,
      quoteList: [] as SearchDataResponseItemType[],
      toolCiteLinks: [] as ToolCiteLinksType[],
      linkDedupe: new Set<string>(),
      errorText: undefined as ErrorTextItemType | undefined
    }
  );

  // Filter quote list to only include citations actually referenced in the response text
  const responseText = historyItem.value.map((v) => v.text?.content || '').join('');
  const citedIds = extractCitationIdsFromText(responseText);
  const filteredQuoteList = quoteList.filter((quote) => citedIds.includes(quote.id));

  return {
    ...historyItem,
    useSandboxFileDisplay,
    quoteList, // 原始未过滤的引用列表，用于判断是否有知识库搜索结果
    totalQuoteList: filteredQuoteList, // 过滤后的引用列表，只包含实际被引用的
    ...(toolCiteLinks.length ? { toolCiteLinks } : {}),
    ...(errorText ? { errorText } : {}),

    /** @deprecated */
    llmModuleAccount,
    /** @deprecated */
    historyPreviewLength
  };
}

export function isCorrectionRecord(id?: string) {
  return Boolean(id && id.startsWith('correction_'));
}
