import { i18nT } from '../../../../web/i18n/utils';

export enum LogKeysEnum {
  SOURCE = 'source', // 来源
  USER = 'user', // 用户
  TITLE = 'title', // 标题
  SESSION_ID = 'sessionId', // 会话 ID
  CREATED_TIME = 'createdTime', // 创建时间
  LAST_CONVERSATION_TIME = 'lastConversationTime', // 上次对话时间
  MESSAGE_COUNT = 'messageCount', // 消息总数
  FEEDBACK = 'feedback', // 用户反馈
  CUSTOM_FEEDBACK = 'customFeedback', // 自定义反馈
  ANNOTATED_COUNT = 'annotatedCount', // 标注答案数量
  POINTS = 'points', // 积分消耗
  RESPONSE_TIME = 'responseTime', // 平均响应时长
  ERROR_COUNT = 'errorCount' // 报错数量
}

export const LogKeysEnumMap = {
  [LogKeysEnum.SOURCE]: i18nT('app:logs_keys_source'),
  [LogKeysEnum.USER]: i18nT('app:logs_keys_user'),
  [LogKeysEnum.TITLE]: i18nT('app:logs_keys_title'),
  [LogKeysEnum.SESSION_ID]: i18nT('app:logs_keys_sessionId'),
  [LogKeysEnum.CREATED_TIME]: i18nT('app:logs_keys_createdTime'),
  [LogKeysEnum.LAST_CONVERSATION_TIME]: i18nT('app:logs_keys_lastConversationTime'),
  [LogKeysEnum.MESSAGE_COUNT]: i18nT('app:logs_keys_messageCount'),
  [LogKeysEnum.FEEDBACK]: i18nT('app:logs_keys_feedback'),
  [LogKeysEnum.CUSTOM_FEEDBACK]: i18nT('app:logs_keys_customFeedback'),
  [LogKeysEnum.ANNOTATED_COUNT]: i18nT('app:logs_keys_annotatedCount'),
  [LogKeysEnum.POINTS]: i18nT('app:logs_keys_points'),
  [LogKeysEnum.RESPONSE_TIME]: i18nT('app:logs_keys_responseTime'),
  [LogKeysEnum.ERROR_COUNT]: i18nT('app:logs_keys_errorCount')
};

export const DefaultLogKeys = [
  { key: LogKeysEnum.SOURCE, enable: true },
  { key: LogKeysEnum.USER, enable: true },
  { key: LogKeysEnum.TITLE, enable: true },
  { key: LogKeysEnum.SESSION_ID, enable: false },
  { key: LogKeysEnum.CREATED_TIME, enable: false },
  { key: LogKeysEnum.LAST_CONVERSATION_TIME, enable: true },
  { key: LogKeysEnum.MESSAGE_COUNT, enable: true },
  { key: LogKeysEnum.FEEDBACK, enable: true },
  { key: LogKeysEnum.CUSTOM_FEEDBACK, enable: false },
  { key: LogKeysEnum.ANNOTATED_COUNT, enable: false },
  { key: LogKeysEnum.POINTS, enable: false },
  { key: LogKeysEnum.RESPONSE_TIME, enable: false },
  { key: LogKeysEnum.ERROR_COUNT, enable: false }
];
