import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { getQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { replaceVariable } from '../../../../../common/string/replaceVariable';
import { filterSearchResultsByMaxChars } from '../../../utils';
import type { ChatProps } from './type';

/**
 * 根据知识库引用配置生成用户问题和系统提示中的引用上下文。
 */
export const getDatasetCiteData = async ({
  quoteQA = [],
  model,
  quoteTemplate,
  aiChatQuoteRole,
  datasetQuotePrompt = '',
  userChatInput,
  version,
  useDatasetQuote
}: {
  quoteQA: ChatProps['params']['quoteQA'];
  model: LLMModelItemType;
  quoteTemplate: string;

  userChatInput: string;
  aiChatQuoteRole: AiChatQuoteRoleType;
  datasetQuotePrompt?: string;
  version?: string;
  useDatasetQuote: boolean;
}) => {
  const getValue = ({ item, index }: { item: SearchDataResponseItemType; index: number }) => {
    return replaceVariable(quoteTemplate, {
      id: item.id,
      q: item.q,
      a: item.a || '',
      updateTime: formatTime2YMDHM(item.updateTime),
      source: item.sourceName,
      sourceId: String(item.sourceId || ''),
      index: index + 1
    });
  };

  // 按模型引用上限裁剪知识库引用，避免引用内容挤占对话上下文。
  const filterQuoteQA = await filterSearchResultsByMaxChars(quoteQA, model.quoteMaxToken);

  const datasetQuoteText =
    filterQuoteQA.length > 0
      ? `${filterQuoteQA.map((item, index) => getValue({ item, index }).trim()).join('\n------\n')}`
      : '';

  // Prompt 显式包含问题时必须放到 user role，避免 system prompt 无法承载用户问题变量。
  const quoteRole =
    aiChatQuoteRole === 'user' || datasetQuotePrompt.includes('{{question}}') ? 'user' : 'system';

  const defaultQuotePrompt = getQuotePrompt(version, quoteRole);

  const datasetQuotePromptTemplate = datasetQuotePrompt || defaultQuotePrompt;

  const replaceInputValue =
    useDatasetQuote && quoteRole === 'user'
      ? replaceVariable(datasetQuotePromptTemplate, {
          quote: datasetQuoteText,
          question: userChatInput
        })
      : userChatInput;

  const systemPrompt =
    useDatasetQuote && quoteRole === 'system'
      ? replaceVariable(datasetQuotePromptTemplate, {
          quote: datasetQuoteText
        })
      : '';

  return {
    userInput: replaceInputValue,
    systemPrompt
  };
};
