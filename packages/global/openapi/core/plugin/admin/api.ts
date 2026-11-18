import { z } from 'zod';
import { I18nStringSchema } from '../../../../common/i18n/type';
import { PluginTextSchema } from '../../../../core/plugin/type';

/* ============================================================================
 * API: 上传系统插件包
 * Route: POST /api/core/plugin/admin/pkg/upload
 * Method: POST
 * Description: 批量上传系统插件 .pkg 文件或包含多个 .pkg 的 .zip 文件，并返回解析后的插件信息
 * Tags: ['Plugin', 'Admin', 'Write']
 * ============================================================================ */

export const UploadPkgPluginBodySchema = z.object({
  file: z.string().meta({
    format: 'binary',
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
  name: PluginTextSchema,
  icon: z.string(),
  tutorialUrl: z.string().url().optional(),
  readmeUrl: z.string().url().optional(),
  repoUrl: z.string().url().optional(),
  permission: z.array(z.string()).optional(),
  description: PluginTextSchema.optional(),
  tags: z.array(z.string()).optional(),
  versionDescription: PluginTextSchema.optional()
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

/* ============================================================================
 * API: 确认上传系统插件包
 * Route: POST /api/core/plugin/admin/pkg/confirm
 * Method: POST
 * Description: 确认已上传的系统插件包，并将插件同步到插件服务
 * Tags: ['插件管理', 'Write']
 * ============================================================================ */

export const ConfirmUploadPkgPluginBodySchema = z.object({
  toolIds: z
    .array(
      z.object({
        pluginId: z.string().meta({
          example: 'systemTool-example',
          description: '插件 ID'
        }),
        version: z.string().meta({
          example: '1.0.0',
          description: '插件版本'
        }),
        etag: z.string().meta({
          example: 'plugin-package-etag',
          description: '插件包内容标识'
        })
      })
    )
    .min(1)
    .meta({ description: '需要确认的插件包列表' })
});
export type ConfirmUploadPkgPluginBodyType = z.infer<typeof ConfirmUploadPkgPluginBodySchema>;

/* ============================================================================
 * API: 从 URL 安装系统插件
 * Route: POST /api/core/plugin/admin/installWithUrl
 * Method: POST
 * Description: 从下载 URL 安装或更新系统插件，全量失败时抛出业务异常，部分成功时返回失败明细
 * Tags: ['插件管理', 'Write']
 * ============================================================================ */

export const InstallPluginFromUrlBodySchema = z.object({
  downloadUrls: z.array(z.string()).meta({
    example: ['https://marketplace.fastgpt.io/plugin/weather.pkg'],
    description: '待安装的插件包下载 URL 列表'
  })
});
export type InstallPluginFromUrlBodyType = z.infer<typeof InstallPluginFromUrlBodySchema>;

export const InstallPluginFromUrlFailureSchema = z
  .object({
    url: z.string().meta({
      example: 'https://marketplace.fastgpt.io/plugin/search.pkg',
      description: '安装失败的插件包下载 URL'
    }),
    reason: I18nStringSchema.meta({
      example: { en: 'Download failed', 'zh-CN': '下载失败' },
      description: '安装失败的多语言原因说明'
    })
  })
  .meta({
    description: '单个插件包安装失败明细'
  });

export const InstallPluginFromUrlInstalledItemSchema = z
  .object({
    pluginId: z.string().meta({
      example: 'systemTool-weather',
      description: '成功安装的插件 ID'
    }),
    version: z.string().optional().meta({
      example: '1.0.0',
      description: '成功安装的插件版本'
    }),
    etag: z.string().optional().meta({
      example: 'sha256:abc123',
      description: '成功安装的插件包内容标识'
    })
  })
  .meta({
    description: '单个插件包安装成功标识'
  });

export const InstallPluginFromUrlResponseSchema = z
  .object({
    installed: z
      .array(InstallPluginFromUrlInstalledItemSchema)
      .optional()
      .meta({
        example: [{ pluginId: 'systemTool-weather', version: '1.0.0', etag: 'sha256:abc123' }],
        description:
          '本次成功安装的插件列表；空数组表示全量未成功，缺省时按兼容旧版插件服务处理（仅当 failed 少于请求数时视为部分成功）'
      }),
    failed: z
      .array(InstallPluginFromUrlFailureSchema)
      .optional()
      .meta({
        example: [
          {
            url: 'https://marketplace.fastgpt.io/plugin/search.pkg',
            reason: { en: 'Download failed', 'zh-CN': '下载失败' }
          }
        ],
        description: '批量安装中部分失败的插件明细列表；全量失败时接口直接抛出 HTTP 500 业务异常'
      })
  })
  .meta({
    example: {
      installed: [{ pluginId: 'systemTool-weather', version: '1.0.0', etag: 'sha256:abc123' }],
      failed: [
        {
          url: 'https://marketplace.fastgpt.io/plugin/search.pkg',
          reason: { en: 'Download failed', 'zh-CN': '下载失败' }
        }
      ]
    },
    description:
      '从 URL 安装插件结果（全量成功时 failed 为空或省略，部分成功时返回成功项与 failed 明细）'
  });
export type InstallPluginFromUrlResponseType = z.infer<typeof InstallPluginFromUrlResponseSchema>;
