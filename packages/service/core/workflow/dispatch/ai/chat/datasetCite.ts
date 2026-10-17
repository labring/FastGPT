import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { getQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { AiChatQuoteRoleType } from '@fastgpt/global/core/workflow/template/system/aiChat/type';
import {
  countPromptTokens,
  countPromptTokensBatch
} from '../../../../../common/string/tiktoken/index';
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
  const getValue = ({ item, index }: { item: SearchDataResponseItemType; index: number }) => {
    // 同义词关闭或分块未携带映射时，字段必须"不存在"而不是空对象：从内容模板中剥离
    // synonymMappings 片段（JSON 行内字段 / <SynonymMappings> 块两种模板形态），保证
    // DATASET_SYNONYM_ENABLED=false 时 prompt 无任何同义词残留（见 同义词兼容检索和aichat.md §2.1）。
    const effectiveTemplate =
      item.synonymMappings === undefined
        ? quoteTemplate
            .replace(/,?\s*"synonymMappings":\s*\{\{synonymMappings\}\}/, '')
            .replace(/\s*<SynonymMappings>\s*\{\{synonymMappings\}\}\s*<\/SynonymMappings>/, '')
        : quoteTemplate;
    const variables: Record<string, string | number> = {
      id: item.id,
      q: item.q,
      a: item.a || '',
      updateTime: formatTime2YMDHM(item.updateTime),
      source: item.sourceName,
      sourceId: String(item.sourceId || ''),
      index: index + 1,
      synonymMappings: JSON.stringify(item.synonymMappings ?? {})
    };
    return effectiveTemplate.replace(/\{\{([^}]+)\}\}/g, (placeholder, key: string) =>
      Object.hasOwn(variables, key) ? String(variables[key]) : placeholder
    );
  };

  // 按模型引用上限裁剪知识库引用，避免引用内容挤占对话上下文。
  const rendered = useDatasetQuote
    ? quoteQA.map((item, index) => getValue({ item, index }).trim())
    : [];
  const separator = '\n------\n';
  const tokens = rendered.length
    ? await countPromptTokensBatch(
        rendered.map((text, index) => (index === 0 ? text : separator + text))
      )
    : [];
  const selected: string[] = [];
  let totalTokens = 0;
  for (const [index, text] of rendered.entries()) {
    totalTokens += tokens[index] ?? 0;
    if (totalTokens > model.config.quoteMaxToken) break;
    selected.push(text);
  }
  let datasetQuoteText = selected.join(separator);
  while (
    selected.length &&
    (await countPromptTokens(datasetQuoteText)) > model.config.quoteMaxToken
  ) {
    selected.pop();
    datasetQuoteText = selected.join(separator);
  }

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
