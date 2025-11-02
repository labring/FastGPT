import z from 'zod';

export const TeamInstalledPluginSchema = z.object({
  _id: z.string(),
  teamId: z.string(),
  pluginId: z.string(),
  installed: z.boolean()
});
export type TeamInstalledPluginSchemaType = z.infer<typeof TeamInstalledPluginSchema>;
