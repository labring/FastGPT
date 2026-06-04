import { z } from 'zod';
import { I18nStringSchema } from '../../../../common/i18n/type';

/* ============================================================================
 * API: 上传系统插件包
 * Route: POST /api/core/plugin/admin/pkg/upload
 * Method: POST
 * Description: 批量上传系统插件 .pkg 文件或包含多个 .pkg 的 .zip 文件，并返回解析后的插件信息
 * Tags: ['Plugin', 'Admin', 'Write']
 * ============================================================================ */

export const UploadPkgPluginBodySchema = z.object({
  file: z.any().meta({
    description:
      'multipart/form-data file 字段，可重复传入，支持 .pkg 文件或包含多个 .pkg 的 .zip 文件'
  })
});

export const UploadPkgPluginResponseItemSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  etag: z.string(),
  type: z.string(),
  author: z.string().optional(),
  name: I18nStringSchema,
  icon: z.string(),
  tutorialUrl: z.string().url().optional(),
  readmeUrl: z.string().url().optional(),
  repoUrl: z.string().url().optional(),
  permission: z.array(z.string()).optional(),
  description: I18nStringSchema.optional(),
  tags: z.array(z.string()).optional(),
  versionDescription: I18nStringSchema.optional()
});

export const UploadPkgPluginFailureSchema = z.object({
  fileName: z.string().optional(),
  reason: I18nStringSchema
});

export const UploadPkgPluginResponseSchema = z.object({
  plugins: z.array(UploadPkgPluginResponseItemSchema),
  failed: z.array(UploadPkgPluginFailureSchema).optional()
});
export type UploadPkgPluginResponseType = z.infer<typeof UploadPkgPluginResponseSchema>;

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
