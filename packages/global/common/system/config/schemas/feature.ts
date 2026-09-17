import z from 'zod';

export const FeatureConfigSchema = z.strictObject({
  hideChatCopyrightSetting: z.boolean().default(false),
  multipleDataToBase64: z.boolean().default(false),
  datasetSynonymEnabled: z.boolean().default(false),
  agentEngine: z.enum(['fastAgent', 'piAgent']).default('fastAgent'),
  disableCache: z.boolean().default(false),
  showEmptyChat: z.boolean().default(true),
  showGit: z.boolean().default(true),
  enableTeamPluginUpload: z.boolean().default(false)
});
