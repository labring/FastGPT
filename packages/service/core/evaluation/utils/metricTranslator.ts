/**
 * Built-in metric name translation utility for backend export
 */
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { LangEnum } from '@fastgpt/global/common/i18n/type';

// Built-in metric translations
const BUILTIN_METRIC_TRANSLATIONS: Record<string, Record<string, string>> = {
  // Simplified Chinese translations
  [LangEnum.zh_CN]: {
    answer_correctness: '回答准确度',
    answer_similarity: '语义相似度',
    answer_relevancy: '回答相关度',
    faithfulness: '回答忠诚度',
    context_recall: '检索匹配度',
    context_precision: '检索精确度'
  },
  // Traditional Chinese translations
  [LangEnum.zh_Hant]: {
    answer_correctness: '回答準確度',
    answer_similarity: '語義相似度',
    answer_relevancy: '回答相關度',
    faithfulness: '回答忠誠度',
    context_recall: '檢索匹配度',
    context_precision: '檢索精確度'
  },
  // English translations (default/fallback)
  [LangEnum.en]: {
    answer_correctness: 'Answer Correctness',
    answer_similarity: 'Answer Similarity',
    answer_relevancy: 'Answer Relevance',
    faithfulness: 'Faithfulness',
    context_recall: 'Context Recall',
    context_precision: 'Context Precision'
  }
};

// CSV column header translations
const CSV_COLUMN_TRANSLATIONS: Record<string, Record<string, string>> = {
  // Simplified Chinese translations
  [LangEnum.zh_CN]: {
    ItemId: '评估项ID',
    UserInput: '用户问题',
    ExpectedOutput: '参考答案',
    ActualOutput: '实际回答',
    Status: '状态',
    ErrorMessage: '异常信息'
  },
  // Traditional Chinese translations
  [LangEnum.zh_Hant]: {
    ItemId: '評估項ID',
    UserInput: '用戶問題',
    ExpectedOutput: '參考答案',
    ActualOutput: '實際回答',
    Status: '狀態',
    ErrorMessage: '異常信息'
  },
  // English translations (default/fallback)
  [LangEnum.en]: {
    ItemId: 'Item ID',
    UserInput: 'Question',
    ExpectedOutput: 'Expected Answer',
    ActualOutput: 'Actual Answer',
    Status: 'Status',
    ErrorMessage: 'Error'
  }
};

/**
 * Translate built-in metric name to specified locale
 * @param metricName - The metric name to translate
 * @param locale - Target locale (e.g., 'zh-CN', 'zh-Hant', 'en')
 * @returns Translated metric name or original name if not found
 */
export const translateBuiltinMetricName = (
  metricName: string,
  locale: localeType = LangEnum.en
): string => {
  // Get translations for the specified locale
  const translations = BUILTIN_METRIC_TRANSLATIONS[locale];

  // Return translated name or original if not found
  return translations[metricName] || metricName;
};

/**
 * Check if a metric name is a built-in metric
 * @param metricName - The metric name to check
 * @returns True if it's a built-in metric
 */
export const isBuiltinMetric = (metricName: string): boolean => {
  const englishTranslations = BUILTIN_METRIC_TRANSLATIONS[LangEnum.en];
  return metricName in englishTranslations;
};

/**
 * Translate CSV column header to specified locale
 * @param columnName - The column header name to translate
 * @param locale - Target locale (e.g., 'zh-CN', 'zh-Hant', 'en')
 * @returns Translated column name or original name if not found
 */
export const translateCsvColumnName = (
  columnName: string,
  locale: localeType = LangEnum.en
): string => {
  // Get translations for the specified locale
  const translations = CSV_COLUMN_TRANSLATIONS[locale];

  // Return translated name or original if not found
  return translations[columnName] || columnName;
};
