import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { getQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import { serviceEnv } from '../../../../../env';
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
  model: LLMModelDataType;
  quoteTemplate: string;

  userChatInput: string;
  aiChatQuoteRole: AiChatQuoteRoleType;
  datasetQuotePrompt?: string;
  version?: string;
  useDatasetQuote: boolean;
}) => {
  // 缺少可靠映射时省略标准内容模板的映射字段；不回退已保存的模板及其静态说明。
  const strippedQuoteTemplate = quoteTemplate
    .replace(/,?\s*"synonymMappings":\s*\{\{synonymMappings\}\}/, '')
    .replace(/\s*<SynonymMappings>\s*\{\{synonymMappings\}\}\s*<\/SynonymMappings>/, '');

  const getValue = ({ item, index }: { item: SearchDataResponseItemType; index: number }) => {
    const synonymMappings = serviceEnv.DATASET_SYNONYM_ENABLED ? item.synonymMappings : undefined;
    const effectiveTemplate = synonymMappings === undefined ? strippedQuoteTemplate : quoteTemplate;
    const variables: Record<string, string | number> = {
      id: item.id,
      q: item.q,
      a: item.a || '',
      updateTime: formatTime2YMDHM(item.updateTime),
      source: item.sourceName,
      sourceId: String(item.sourceId || ''),
      index: index + 1,
      synonymMappings: JSON.stringify(synonymMappings ?? {})
    };
    return effectiveTemplate.replace(/\{\{([^}]+)\}\}/g, (placeholder, key: string) =>
      Object.hasOwn(variables, key) ? String(variables[key]) : placeholder
    );
  };

  // 按模型引用上限裁剪知识库引用，避免引用内容挤占对话上下文。
  const filterQuoteQA = useDatasetQuote
    ? await filterSearchResultsByMaxChars(quoteQA, model.config.quoteMaxToken)
    : [];

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
      ? datasetQuotePromptTemplate.replace(/\{\{(quote|question)\}\}/g, (_, key: string) =>
          key === 'quote' ? datasetQuoteText : userChatInput
        )
      : userChatInput;

  const systemPrompt =
    useDatasetQuote && quoteRole === 'system'
      ? datasetQuotePromptTemplate.replace(/\{\{quote\}\}/g, () => datasetQuoteText)
      : '';

  return {
    userInput: replaceInputValue,
    systemPrompt
  };
};
