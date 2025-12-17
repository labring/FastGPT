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
  ERROR_COUNT = 'errorCount',
  REGION = 'region',
  VERSION_NAME = 'versionName'
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
  [AppLogKeysEnum.ERROR_COUNT]: i18nT('app:logs_keys_errorCount'),
  [AppLogKeysEnum.REGION]: i18nT('app:logs_keys_region'),
  [AppLogKeysEnum.VERSION_NAME]: i18nT('app:logs_keys_versionName')
};

export const DefaultAppLogKeys = [
  { key: AppLogKeysEnum.SOURCE, enable: false },
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
  { key: AppLogKeysEnum.ERROR_COUNT, enable: false },
  { key: AppLogKeysEnum.REGION, enable: true },
  { key: AppLogKeysEnum.VERSION_NAME, enable: false }
];

export enum AppLogTimespanEnum {
  day = 'day',
  week = 'week',
  month = 'month',
  quarter = 'quarter'
}

export const offsetOptions = [
  { label: 'T+1', value: '1' },
  { label: 'T+3', value: '3' },
  { label: 'T+7', value: '7' },
  { label: 'T+14', value: '14' }
];

export const fakeChartData = {
  user: [
    {
      x: '07-30',
      xLabel: '07-30',
      userCount: 8,
      newUserCount: 5,
      retentionUserCount: 3,
      points: 100,
      sourceCountMap: {
        test: 1,
        online: 1,
        share: 1,
        api: 2,
        cronJob: 0,
        team: 1,
        feishu: 0,
        official_account: 1,
        wecom: 1,
        mcp: 0
      }
    },
    {
      x: '07-31',
      xLabel: '07-31',
      userCount: 12,
      newUserCount: 8,
      retentionUserCount: 4,
      points: 160,
      sourceCountMap: {
        test: 2,
        online: 2,
        share: 2,
        api: 3,
        cronJob: 0,
        team: 2,
        feishu: 0,
        official_account: 1,
        wecom: 1,
        mcp: 0
      }
    },
    {
      x: '08-01',
      xLabel: '08-01',
      userCount: 18,
      newUserCount: 12,
      retentionUserCount: 6,
      points: 220,
      sourceCountMap: {
        test: 2,
        online: 3,
        share: 2,
        api: 4,
        cronJob: 1,
        team: 2,
        feishu: 0,
        official_account: 1,
        wecom: 1,
        mcp: 0
      }
    },
    {
      x: '08-02',
      xLabel: '08-02',
      userCount: 15,
      newUserCount: 7,
      retentionUserCount: 8,
      points: 180,
      sourceCountMap: {
        test: 1,
        online: 2,
        share: 2,
        api: 3,
        cronJob: 1,
        team: 2,
        feishu: 1,
        official_account: 1,
        wecom: 0,
        mcp: 0
      }
    },
    {
      x: '08-03',
      xLabel: '08-03',
      userCount: 20,
      newUserCount: 15,
      retentionUserCount: 5,
      points: 250,
      sourceCountMap: {
        test: 2,
        online: 4,
        share: 2,
        api: 5,
        cronJob: 1,
        team: 2,
        feishu: 1,
        official_account: 1,
        wecom: 0,
        mcp: 0
      }
    },
    {
      x: '08-04',
      xLabel: '08-04',
      userCount: 14,
      newUserCount: 6,
      retentionUserCount: 8,
      points: 170,
      sourceCountMap: {
        test: 1,
        online: 3,
        share: 1,
        api: 4,
        cronJob: 1,
        team: 2,
        feishu: 1,
        official_account: 1,
        wecom: 0,
        mcp: 0
      }
    },
    {
      x: '08-05',
      xLabel: '08-05',
      userCount: 22,
      newUserCount: 17,
      retentionUserCount: 5,
      points: 280,
      sourceCountMap: {
        test: 2,
        online: 5,
        share: 2,
        api: 6,
        cronJob: 1,
        team: 2,
        feishu: 1,
        official_account: 1,
        wecom: 0,
        mcp: 0
      }
    }
  ],
  chat: [
    {
      x: '07-30',
      xLabel: '07-30',
      chatItemCount: 20,
      chatCount: 12,
      pointsPerChat: 5.5,
      errorCount: 2,
      errorRate: 0.1
    },
    {
      x: '07-31',
      xLabel: '07-31',
      chatItemCount: 35,
      chatCount: 20,
      pointsPerChat: 8.0,
      errorCount: 1,
      errorRate: 0.028
    },
    {
      x: '08-01',
      xLabel: '08-01',
      chatItemCount: 50,
      chatCount: 30,
      pointsPerChat: 7.3,
      errorCount: 3,
      errorRate: 0.06
    },
    {
      x: '08-02',
      xLabel: '08-02',
      chatItemCount: 28,
      chatCount: 18,
      pointsPerChat: 6.2,
      errorCount: 1,
      errorRate: 0.036
    },
    {
      x: '08-03',
      xLabel: '08-03',
      chatItemCount: 60,
      chatCount: 40,
      pointsPerChat: 7.8,
      errorCount: 4,
      errorRate: 0.067
    },
    {
      x: '08-04',
      xLabel: '08-04',
      chatItemCount: 32,
      chatCount: 22,
      pointsPerChat: 6.5,
      errorCount: 2,
      errorRate: 0.062
    },
    {
      x: '08-05',
      xLabel: '08-05',
      chatItemCount: 55,
      chatCount: 35,
      pointsPerChat: 8.1,
      errorCount: 1,
      errorRate: 0.018
    }
  ],
  app: [
    {
      x: '07-30',
      xLabel: '07-30',
      goodFeedBackCount: 2,
      badFeedBackCount: 1,
      avgDuration: 2.5
    },
    {
      x: '07-31',
      xLabel: '07-31',
      goodFeedBackCount: 5,
      badFeedBackCount: 2,
      avgDuration: 2.1
    },
    {
      x: '08-01',
      xLabel: '08-01',
      goodFeedBackCount: 3,
      badFeedBackCount: 1,
      avgDuration: 2.8
    },
    {
      x: '08-02',
      xLabel: '08-02',
      goodFeedBackCount: 6,
      badFeedBackCount: 3,
      avgDuration: 2.0
    },
    {
      x: '08-03',
      xLabel: '08-03',
      goodFeedBackCount: 4,
      badFeedBackCount: 2,
      avgDuration: 2.7
    },
    {
      x: '08-04',
      xLabel: '08-04',
      goodFeedBackCount: 7,
      badFeedBackCount: 1,
      avgDuration: 2.3
    },
    {
      x: '08-05',
      xLabel: '08-05',
      goodFeedBackCount: 3,
      badFeedBackCount: 2,
      avgDuration: 2.9
    }
  ],
  cumulative: {
    userCount: 109,
    points: 1360,
    chatItemCount: 280,
    chatCount: 177,
    pointsPerChat: 7.2,
    errorCount: 14,
    errorRate: 0.053,
    goodFeedBackCount: 30,
    badFeedBackCount: 12,
    avgDuration: 2.47
  }
};
