import z from 'zod';
import {
  UploadPkgPluginResponseSchema,
  UploadPkgPluginResponseItemSchema
} from '../../admin/api';
import { TeamPluginEmptyResponseSchema } from '../common';

/* ============================================================================
 * API: 上传团队插件包
 * Route: POST /api/core/plugin/team/pkg/upload
 * Method: POST
 * Description: 上传 .pkg 或 .zip 并解析待安装插件，确认前不写入团队插件库
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const UploadTeamPkgPluginBodySchema = z.object({
  file: z.any().meta({
    description:
      'multipart/form-data file 字段，可重复传入，支持 .pkg 文件或包含多个 .pkg 的 .zip 文件'
  })
});
export const UploadTeamPkgPluginResponseSchema = UploadPkgPluginResponseSchema;
export type UploadTeamPkgPluginResponseType = z.infer<typeof UploadTeamPkgPluginResponseSchema>;

const TeamInstallPluginMetaSchema = UploadPkgPluginResponseItemSchema.pick({
  pluginId: true,
  version: true,
  etag: true,
  permission: true
}).extend({
  marketplaceToolId: z.string().optional().meta({
    example: 'weather',
    description: 'Marketplace 工具 ID'
  }),
  marketplaceSource: z.string().optional().meta({
    example: 'official',
    description: 'Marketplace 来源'
  })
});

export type TeamInstallPluginMetaType = z.infer<typeof TeamInstallPluginMetaSchema>;

const TeamTagIdsBodySchema = z.array(z.string()).optional().meta({
  example: ['tag_xxx'],
  description: '安装后绑定的团队插件标签 ID'
});

/* ============================================================================
 * API: 确认团队上传插件安装
 * Route: POST /api/core/plugin/team/pkg/confirm
 * Method: POST
 * Description: 确认上传解析结果，把插件安装到当前团队 source 并写入团队账本
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const ConfirmTeamUploadPkgPluginBodySchema = z.object({
  toolIds: z.array(TeamInstallPluginMetaSchema).min(1).meta({
    example: [{ pluginId: 'systemTool-weather', version: '1.0.0', etag: 'sha256:xxx' }],
    description: '待确认安装的插件唯一标识'
  }),
  teamTagIds: TeamTagIdsBodySchema
});
export type ConfirmTeamUploadPkgPluginBodyType = z.infer<
  typeof ConfirmTeamUploadPkgPluginBodySchema
>;

/* ============================================================================
 * API: 从 Marketplace 安装团队插件
 * Route: POST /api/core/plugin/team/pkg/installWithUrl
 * Method: POST
 * Description: 从下载 URL 安装插件到当前团队 source，并写入团队账本
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const InstallTeamPluginFromUrlBodySchema = z
  .object({
    downloadUrls: z.array(z.string().min(1)).min(1).meta({
      example: ['https://marketplace.fastgpt.io/plugin/weather.pkg'],
      description: 'Marketplace 插件下载 URL 列表'
    }),
    plugins: z.array(TeamInstallPluginMetaSchema).min(1).meta({
      example: [{ pluginId: 'weather', version: '1.0.0', etag: 'sha256:xxx' }],
      description: '与下载 URL 对应的插件元信息，用于写入团队账本'
    }),
    teamTagIds: TeamTagIdsBodySchema
  })
  .refine((data) => data.downloadUrls.length === data.plugins.length, {
    message: 'downloadUrls length must match plugins length'
  });
export type InstallTeamPluginFromUrlBodyType = z.infer<
  typeof InstallTeamPluginFromUrlBodySchema
>;

export const TeamPkgEmptyResponseSchema = TeamPluginEmptyResponseSchema;
export type TeamPkgEmptyResponseType = z.infer<typeof TeamPkgEmptyResponseSchema>;
