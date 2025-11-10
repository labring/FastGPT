import { I18nStringSchema, I18nUnioStringSchema } from '../../../../core/plugin/type';
import { z } from 'zod';

/* ============ Pkg Plugin ============== */
// 1. Get Pkg Plugin Upload URL Schema
export const GetPkgPluginUploadURLQuerySchema = z.object({
  filename: z.string()
});
export type GetPkgPluginUploadURLQueryType = z.infer<typeof GetPkgPluginUploadURLQuerySchema>;
export const GetPkgPluginUploadURLResponseSchema = z.object({
  postURL: z.string(),
  formData: z.record(z.string(), z.string()),
  objectName: z.string()
});
export type GetPkgPluginUploadURLResponseType = z.infer<typeof GetPkgPluginUploadURLResponseSchema>;

// 2. Parse Uploaded Pkg Plugin Schema
export const ParseUploadedPkgPluginQuerySchema = z.object({
  objectName: z.string()
});
export type ParseUploadedPkgPluginQueryType = z.infer<typeof ParseUploadedPkgPluginQuerySchema>;
export const ParseUploadedPkgPluginResponseSchema = z.array(
  z.object({
    toolId: z.string(),
    name: I18nUnioStringSchema,
    description: I18nStringSchema,
    icon: z.string(),
    parentId: z.string().optional(),
    tags: z.array(z.string()).nullish()
  })
);
export type ParseUploadedPkgPluginResponseType = z.infer<
  typeof ParseUploadedPkgPluginResponseSchema
>;

// 3. Confirm Uploaded Pkg Plugin Schema
export const ConfirmUploadPkgPluginBodySchema = z.object({
  toolIds: z.array(z.string())
});
export type ConfirmUploadPkgPluginBodyType = z.infer<typeof ConfirmUploadPkgPluginBodySchema>;

// 4. Delete Pkg Plugin Schema
export const DeletePkgPluginQuerySchema = z.object({
  toolId: z.string()
});
export type DeletePkgPluginQueryType = z.infer<typeof DeletePkgPluginQuerySchema>;

// Install plugin from url
export const InstallPluginFromUrlBodySchema = z.object({
  downloadUrls: z.array(z.string())
});
export type InstallPluginFromUrlBodyType = z.infer<typeof InstallPluginFromUrlBodySchema>;
