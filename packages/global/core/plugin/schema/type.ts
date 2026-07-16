import z from 'zod';

export enum TeamPluginRegistrySourceEnum {
  system = 'system',
  team = 'team'
}

export enum TeamPluginInstallSourceEnum {
  marketplace = 'marketplace',
  upload = 'upload'
}

export enum TeamPluginPolicyStatusEnum {
  installed = 'installed',
  deleted = 'deleted',
  hidden = 'hidden'
}

export const TeamPluginRegistrySourceSchema = z.enum(TeamPluginRegistrySourceEnum);
export const TeamPluginInstallSourceSchema = z.enum(TeamPluginInstallSourceEnum);
export const TeamPluginPolicyStatusSchema = z.enum(TeamPluginPolicyStatusEnum);

export const TeamInstalledPluginSchema = z.object({
  _id: z.string(),
  teamId: z.string(),
  pluginType: z.literal('tool').default('tool'),
  pluginId: z.string(),
  version: z.string().optional(),
  etag: z.string().optional(),
  registrySource: TeamPluginRegistrySourceSchema.default(TeamPluginRegistrySourceEnum.team),
  installSource: TeamPluginInstallSourceSchema.optional(),
  status: TeamPluginPolicyStatusSchema.optional(),
  hidden: z.boolean().optional(),
  teamTagIds: z.array(z.string()).optional(),
  packageSource: z
    .object({
      marketplaceToolId: z.string().optional(),
      marketplaceSource: z.string().optional(),
      downloadUrlHash: z.string().optional(),
      uploadedFileName: z.string().optional()
    })
    .optional(),
  confirmedPermissions: z.array(z.string()).optional(),
  permissionsConfirmedAt: z.date().optional(),
  installedByTmbId: z.string().optional(),
  installedAt: z.date().optional(),
  updatedByTmbId: z.string().optional(),
  updatedAt: z.date().optional(),
  deletedByTmbId: z.string().optional(),
  deletedAt: z.date().optional(),
  hiddenByTmbId: z.string().optional(),
  hiddenAt: z.date().optional(),
  createTime: z.date().optional(),
  updateTime: z.date().optional(),
  installed: z.boolean().optional()
});
export type TeamInstalledPluginSchemaType = z.infer<typeof TeamInstalledPluginSchema>;

export const TeamPluginTagSchema = z.object({
  _id: z.string(),
  teamId: z.string(),
  tagId: z.string(),
  tagName: z.string(),
  tagOrder: z.number(),
  color: z.string().optional(),
  createTime: z.date().optional(),
  updateTime: z.date().optional()
});
export type TeamPluginTagSchemaType = z.infer<typeof TeamPluginTagSchema>;
