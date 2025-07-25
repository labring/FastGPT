import { AppLogKeysEnum } from '@fastgpt/global/core/app/logs/constants';

// 表格配置常量
export const TABLE_CONFIG = {
  pageSize: 20,
  maxTitleWidth: '250px',
  maxSessionIdWidth: '200px',
  feedbackCellWidth: '100px'
} as const;

// 反馈样式常量
export const FEEDBACK_STYLES = {
  good: {
    bg: 'green.100',
    color: 'green.600',
    icon: 'core/chat/feedback/goodLight'
  },
  bad: {
    bg: '#FFF2EC',
    color: '#C96330',
    icon: 'core/chat/feedback/badLight'
  }
} as const;

// 日期范围默认值
export const DEFAULT_DATE_RANGE_DAYS = 6;
