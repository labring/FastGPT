import { i18nT } from '@fastgpt/web/i18n/utils';

// FAQ回答模式枚举
export enum FAQAnswerModeEnum {
  Quote = 'quote',
  LLMSummary = 'llm-summary'
}

// 默认值
export const DEFAULT_VALUES = {
  FAQ_ANSWER_MODE: FAQAnswerModeEnum.Quote,
  TOKEN_LIMIT: 3000,
  WELCOME_TEXT: i18nT('app:smart_customer_service_welcome_text_placeholder')
} as const;

// 网格列配置
export const GRID_COLUMNS = {
  DATASET: 'repeat(2, minmax(0, 1fr))',
  FAQ_OPTIONS: 'repeat(2, 1fr)'
} as const;

// 尺寸配置
export const SIZES = {
  DATASET_ITEM_HEIGHT: '36px',
  FORM_LABEL_MIN_WIDTH: {
    SMALL: '80px',
    MEDIUM: '120px'
  }
} as const;
