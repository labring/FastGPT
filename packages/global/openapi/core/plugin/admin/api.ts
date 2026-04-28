import { z } from 'zod';

// 3. Confirm Uploaded Pkg Plugin Schema
export const ConfirmUploadPkgPluginBodySchema = z.object({
  toolIds: z.array(
    z.object({
      pluginId: z.string(),
      version: z.string(),
      etag: z.string()
    })
  )
});
export type ConfirmUploadPkgPluginBodyType = z.infer<typeof ConfirmUploadPkgPluginBodySchema>;

// Install plugin from url
export const InstallPluginFromUrlBodySchema = z.object({
  downloadUrls: z.array(z.string())
});
export type InstallPluginFromUrlBodyType = z.infer<typeof InstallPluginFromUrlBodySchema>;
