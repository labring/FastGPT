export enum TrackEnum {
  login = 'login',
  dailyUserActive = 'dailyUserActive',
  createApp = 'createApp',
  useAppTemplate = 'useAppTemplate',
  createDataset = 'createDataset',
  appNodes = 'appNodes',
  runSystemTool = 'runSystemTool',
  datasetSearch = 'datasetSearch',
  readSystemAnnouncement = 'readSystemAnnouncement',
  clickOperationalAd = 'clickOperationalAd',
  closeOperationalAd = 'closeOperationalAd',
  teamChatQPM = 'teamChatQPM',
  enterpriseAuthOpen = 'enterpriseAuthOpen',
  enterpriseAuthContactBusiness = 'enterpriseAuthContactBusiness',
  enterpriseAuthStart = 'enterpriseAuthStart',
  enterpriseAuthVerifyAmount = 'enterpriseAuthVerifyAmount',
  enterpriseAuthReset = 'enterpriseAuthReset',

  // Admin cron job tracks
  subscriptionDeleted = 'subscriptionDeleted',
  freeAccountCleanup = 'freeAccountCleanup',
  auditLogCleanup = 'auditLogCleanup',
  chatHistoryCleanup = 'chatHistoryCleanup',
  sandboxArchive = 'sandboxArchive',

  // web tracks
  clientError = 'clientError',
  workflowDemoMode = 'workflowDemoMode'
}
