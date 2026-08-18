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
  deleted = 'deleted'
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
  installSource: TeamPluginInstallSourceSchema.optional(),
  status: TeamPluginPolicyStatusSchema.optional(),
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
  createTime: z.date().optional(),
  updateTime: z.date().optional(),
  installed: z.boolean().optional()
});
export type TeamInstalledPluginSchemaType = z.infer<typeof TeamInstalledPluginSchema>;
