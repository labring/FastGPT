/** 客户端上报白名单；公共 API 和前端调用共用，服务端事件不能加入这里。 */
export const ClientTrackEnum = {
  useAppTemplate: 'useAppTemplate',
  readSystemAnnouncement: 'readSystemAnnouncement',
  clickOperationalAd: 'clickOperationalAd',
  closeOperationalAd: 'closeOperationalAd',
  clientError: 'clientError',
  workflowDemoMode: 'workflowDemoMode',
  workflowBuilderClick: 'app.workflow.builder.click'
} as const;

/** 完整事件集合；新事件按“业务.子业务.子业务.事件”命名，最多四级。 */
export const TrackEnum = {
  ...ClientTrackEnum,
  login: 'login',
  dailyUserActive: 'dailyUserActive',
  createApp: 'createApp',
  createDataset: 'createDataset',
  appNodes: 'appNodes',
  runSystemTool: 'runSystemTool',
  datasetSearch: 'datasetSearch',
  teamChatQPM: 'teamChatQPM',
  enterpriseAuthStart: 'enterpriseAuthStart',
  enterpriseAuthBenefitGrant: 'enterpriseAuthBenefitGrant',
  accountCancellationSubmitSuccess: 'account_cancellation_submit_success',
  accountCancellationCancelSuccess: 'account_cancellation_cancel_success',
  accountCancellationFinalizeSuccess: 'account_cancellation_finalize_success',

  // Admin cron job tracks
  subscriptionDeleted: 'subscriptionDeleted',
  freeAccountCleanup: 'freeAccountCleanup',
  auditLogCleanup: 'auditLogCleanup',
  chatHistoryCleanup: 'chatHistoryCleanup',
  /** @deprecated Legacy Sandbox archive event. Use userSandboxMigration instead. */
  sandboxArchive: 'sandboxArchive',
  userSandboxMigration: 'userSandboxMigration',

  // Workflow Builder 服务端链路事件，不接受客户端上报。
  workflowBuilderMessageAccepted: 'app.workflow.builder.start',
  workflowBuilderPreviewGenerated: 'app.workflow.builder.preview_generated',
  workflowBuilderPreviewConfirm: 'app.workflow.builder.confirm',
  workflowBuilderPreviewRevise: 'app.workflow.builder.revise',
  workflowBuilderPreviewCancel: 'app.workflow.builder.cancel',
  workflowBuilderResultReady: 'app.workflow.builder.ready',
  workflowBuilderBuildFailed: 'app.workflow.builder.build_failed',
  workflowBuilderApplyRequested: 'app.workflow.builder.apply_requested',
  workflowBuilderApplyFailed: 'app.workflow.builder.apply_failed',
  workflowBuilderApplySucceeded: 'app.workflow.builder.apply_succeeded'
} as const;
export type TrackEnum = (typeof TrackEnum)[keyof typeof TrackEnum];
