import z from 'zod';

export const FeatureConfigSchema = z.strictObject({
  hideChatCopyrightSetting: z.boolean().default(false),
  multipleDataToBase64: z.boolean().default(false),
  datasetSynonymEnabled: z.boolean().default(false),
  agentEngine: z.enum(['fastAgent', 'piAgent']).default('fastAgent'),
  disableCache: z.boolean().default(false),
  showEmptyChat: z.boolean().default(true),
  showGit: z.boolean().default(true),
  enableTeamPluginUpload: z.boolean().default(false),
  // 业务入口可见性开关（决定各接入渠道在前端是否可见）
  showDatasetFeishu: z.boolean().default(true),
  showDatasetYuque: z.boolean().default(true),
  showDatasetDingtalk: z.boolean().default(true),
  showPublishFeishu: z.boolean().default(true),
  showPublishDingtalk: z.boolean().default(true),
  showPublishWecom: z.boolean().default(false),
  showPublishOffiaccount: z.boolean().default(true),
  showPublishWechat: z.boolean().default(true),
  showComplianceCopywriting: z.boolean().default(false)
});
