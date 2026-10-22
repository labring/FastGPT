/** Redis DAL 管理的业务队列名称和稳定 job namespace。 */
export enum QueueNames {
  datasetSync = 'datasetSync',
  evaluation = 'evaluation',
  s3FileDelete = 's3FileDelete',
  collectionUpdate = 'collectionUpdate',
  agentSkillCreate = 'agentSkillCreate',

  // Delete Queue
  datasetDelete = 'datasetDelete',
  appDelete = 'appDelete',
  agentSkillDelete = 'agentSkillDelete',
  teamDelete = 'teamDelete',
  accountCancellation = 'accountCancellation',

  // Publish
  wechatPoll = 'wechatPoll',
  wechatReply = 'wechatReply',

  /** @deprecated */
  websiteSync = 'websiteSync'
}
