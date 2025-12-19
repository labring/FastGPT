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

  // Admin cron job tracks
  subscriptionDeleted = 'subscriptionDeleted',
  freeAccountCleanup = 'freeAccountCleanup',
  auditLogCleanup = 'auditLogCleanup',
  chatHistoryCleanup = 'chatHistoryCleanup',

  // web tracks
  clientError = 'clientError'
}
