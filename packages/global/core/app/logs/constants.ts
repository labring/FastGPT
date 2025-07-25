import { i18nT } from '../../../../web/i18n/utils';

export enum AppLogKeysEnum {
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

export const AppLogKeysEnumMap = {
  [AppLogKeysEnum.SOURCE]: i18nT('app:logs_keys_source'),
  [AppLogKeysEnum.USER]: i18nT('app:logs_keys_user'),
  [AppLogKeysEnum.TITLE]: i18nT('app:logs_keys_title'),
  [AppLogKeysEnum.SESSION_ID]: i18nT('app:logs_keys_sessionId'),
  [AppLogKeysEnum.CREATED_TIME]: i18nT('app:logs_keys_createdTime'),
  [AppLogKeysEnum.LAST_CONVERSATION_TIME]: i18nT('app:logs_keys_lastConversationTime'),
  [AppLogKeysEnum.MESSAGE_COUNT]: i18nT('app:logs_keys_messageCount'),
  [AppLogKeysEnum.FEEDBACK]: i18nT('app:logs_keys_feedback'),
  [AppLogKeysEnum.CUSTOM_FEEDBACK]: i18nT('app:logs_keys_customFeedback'),
  [AppLogKeysEnum.ANNOTATED_COUNT]: i18nT('app:logs_keys_annotatedCount'),
  [AppLogKeysEnum.POINTS]: i18nT('app:logs_keys_points'),
  [AppLogKeysEnum.RESPONSE_TIME]: i18nT('app:logs_keys_responseTime'),
  [AppLogKeysEnum.ERROR_COUNT]: i18nT('app:logs_keys_errorCount')
};

export const DefaultAppLogKeys = [
  { key: AppLogKeysEnum.SOURCE, enable: true },
  { key: AppLogKeysEnum.USER, enable: true },
  { key: AppLogKeysEnum.TITLE, enable: true },
  { key: AppLogKeysEnum.SESSION_ID, enable: false },
  { key: AppLogKeysEnum.CREATED_TIME, enable: false },
  { key: AppLogKeysEnum.LAST_CONVERSATION_TIME, enable: true },
  { key: AppLogKeysEnum.MESSAGE_COUNT, enable: true },
  { key: AppLogKeysEnum.FEEDBACK, enable: true },
  { key: AppLogKeysEnum.CUSTOM_FEEDBACK, enable: false },
  { key: AppLogKeysEnum.ANNOTATED_COUNT, enable: false },
  { key: AppLogKeysEnum.POINTS, enable: false },
  { key: AppLogKeysEnum.RESPONSE_TIME, enable: false },
  { key: AppLogKeysEnum.ERROR_COUNT, enable: false }
];
