export enum EnterpriseAuditActionEnum {
  UserLoginSuccess = 'user.login.success',
  UserLoginFailure = 'user.login.failure',
  UserLogout = 'user.logout',
  ApiKeyCreate = 'apikey.create',
  ApiKeyDelete = 'apikey.delete',
  AppCreate = 'app.create',
  AppUpdate = 'app.update',
  AppDelete = 'app.delete',
  AppPublish = 'app.publish',
  ShareLinkUpdate = 'share_link.update',
  ShareLinkDelete = 'share_link.delete',
  DatasetCreate = 'dataset.create',
  DatasetUpdate = 'dataset.update',
  DatasetDelete = 'dataset.delete',
  DatasetCollectionImport = 'dataset.collection.import',
  DatasetCollectionDelete = 'dataset.collection.delete',
  ModelConfigUpdate = 'model.config.update',
  ModelConfigDelete = 'model.config.delete',
  IdentityConfigUpdate = 'identity.config.update',
  KnowledgeSyncRun = 'knowledge_sync.run',
  SystemConfigUpdate = 'system.config.update',
  AuditExport = 'audit.export'
}

export enum EnterpriseAuditResultEnum {
  Success = 'success',
  Failure = 'failure'
}

export enum EnterpriseAuditActorTypeEnum {
  User = 'user',
  Root = 'root',
  ApiKey = 'apikey',
  System = 'system',
  Anonymous = 'anonymous'
}

export enum EnterpriseAuditResourceTypeEnum {
  User = 'user',
  Team = 'team',
  App = 'app',
  Dataset = 'dataset',
  Collection = 'collection',
  ApiKey = 'apikey',
  ShareLink = 'shareLink',
  ModelConfig = 'modelConfig',
  SystemConfig = 'systemConfig',
  AuditLog = 'auditLog'
}
