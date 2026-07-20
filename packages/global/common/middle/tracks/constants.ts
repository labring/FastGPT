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
  enterpriseAuthStart = 'enterpriseAuthStart',
  enterpriseAuthBenefitGrant = 'enterpriseAuthBenefitGrant',
  accountCancellationSubmitSuccess = 'account_cancellation_submit_success',
  accountCancellationCancelSuccess = 'account_cancellation_cancel_success',
  accountCancellationFinalizeSuccess = 'account_cancellation_finalize_success',

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
