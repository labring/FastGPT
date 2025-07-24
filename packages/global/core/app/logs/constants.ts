import { i18nT } from '../../../../web/i18n/utils';

export enum LogKeysEnum {
  SOURCE = 'source',
  USER = 'user',
  TITLE = 'title',
  SESSION_ID = 'sessionId',
  CREATED_TIME = 'createdTime',
  LAST_CONVERSATION_TIME = 'lastConversationTime',
  MESSAGE_COUNT = 'messageCount',
  FEEDBACK = 'feedback',
  CUSTOM_FEEDBACK = 'customFeedback',
  ANNOTATED_COUNT = 'annotatedCount',
  POINTS = 'points',
  RESPONSE_TIME = 'responseTime',
  ERROR_COUNT = 'errorCount'
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
