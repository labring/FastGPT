import z from 'zod';
import { IntSchema } from '../../../../common/zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { I18nStringSchema, PluginToolTagSchema } from '../../../../core/plugin/type';
import { PluginPermissionListSchema } from '../../../../sdk/fastgpt-plugin';

export const MarketplaceOfficialSource = 'official';
export const MarketplaceCommunitySource = 'community';
export const MarketplacePkgSourceSchema = z.string().trim().min(1);
export const MarketplaceSourceFilterSchema = z
  .enum([MarketplaceOfficialSource, MarketplaceCommunitySource])
  .meta({
    example: MarketplaceOfficialSource,
    description: '插件市场来源筛选条件'
  });
export type MarketplaceSourceFilterType = z.infer<typeof MarketplaceSourceFilterSchema>;

export const MarketplaceToolChildSchema = z.object({
  id: z.string().meta({ example: 'search', description: '子工具 ID' }),
  name: I18nStringSchema.meta({
    example: { en: 'Web Search', 'zh-CN': '网页搜索' },
    description: '子工具名称'
  }),
  description: I18nStringSchema.optional().meta({
    example: { en: 'Search the web', 'zh-CN': '搜索互联网内容' },
    description: '子工具简介'
  }),
  toolDescription: z.string().meta({
    example: 'Search current information from the web',
    description: '提供给模型的子工具说明'
  })
});
export type MarketplaceToolChildType = z.infer<typeof MarketplaceToolChildSchema>;

export const MarketplaceToolDetailChildSchema = MarketplaceToolChildSchema.extend({
  icon: z.string().meta({
    example: 'https://example.com/icon.svg',
    description: '子工具图标'
  }),
  inputSchema: z.unknown().meta({
    example: { type: 'object', properties: { query: { type: 'string' } } },
    description: '子工具 JSON Schema 入参定义'
  }),
  outputSchema: z.unknown().meta({
    example: { type: 'object', properties: { result: { type: 'string' } } },
    description: '子工具 JSON Schema 出参定义'
  })
});
export type MarketplaceToolDetailChildType = z.infer<typeof MarketplaceToolDetailChildSchema>;

export const MarketplaceToolBaseSchema = z.object({
  type: z.literal('tool').meta({ example: 'tool', description: '插件类型' }),
  id: z.string().meta({ example: 'fastgpt-web-search', description: '市场工具记录 ID' }),
  toolId: z.string().meta({ example: 'fastgpt-web-search', description: '市场工具 ID' }),
  pluginId: z.string().meta({ example: 'fastgpt-web-search', description: '插件 ID' }),
  parentId: z.string().optional().meta({
    example: 'fastgpt-toolset',
    description: '所属工具集 ID，顶层工具为空'
  }),
  version: z.string().meta({ example: '1.0.0', description: '插件版本' }),
  etag: z.string().meta({ example: 'sha256:abc123', description: '插件包内容标识' }),
  source: z.string().optional().meta({
    example: MarketplaceOfficialSource,
    description: '插件来源；旧版市场数据可能为空'
  }),
  isToolset: z.boolean().meta({ example: false, description: '是否为工具集' }),
  name: I18nStringSchema.meta({
    example: { en: 'Web Search', 'zh-CN': '网页搜索' },
    description: '工具名称'
  }),
  description: I18nStringSchema.meta({
    example: { en: 'Search the web', 'zh-CN': '搜索互联网内容' },
    description: '工具简介'
  }),
  icon: z.string().meta({ example: 'https://example.com/icon.svg', description: '工具图标' }),
  author: z.string().optional().meta({ example: 'FastGPT', description: '插件作者' }),
  repoUrl: z.string().optional().meta({
    example: 'https://github.com/labring/FastGPT',
    description: '插件源码仓库地址'
  }),
  tutorialUrl: z.string().optional().meta({
    example: 'https://doc.fastgpt.io/docs/plugin',
    description: '插件教程地址'
  }),
  readmeUrl: z.string().optional().meta({
    example: 'https://example.com/readme.md',
    description: '插件 README 地址'
  }),
  tags: z
    .array(z.string())
    .optional()
    .meta({
      example: ['search', 'productivity'],
      description: '工具标签 ID 列表'
    }),
  toolDescription: z.string().meta({
    example: 'Search current information from the web',
    description: '提供给模型的工具说明'
  }),
  downloadCount: IntSchema.meta({ example: 128, description: '累计下载次数' }),
  downloadUrl: z.string().optional().meta({
    example: 'https://example.com/fastgpt-web-search.pkg',
    description: '插件包下载地址'
  }),
  children: z.array(MarketplaceToolChildSchema).optional().meta({
    example: [],
    description: '工具集子工具列表'
  })
});
export type MarketplaceToolBaseType = z.infer<typeof MarketplaceToolBaseSchema>;

export const MarketplaceToolListItemSchema = MarketplaceToolBaseSchema.extend({
  hasSecret: z.boolean().meta({ example: true, description: '是否需要配置密钥' }),
  downloadUrl: z.string().meta({
    example: 'https://example.com/fastgpt-web-search.pkg',
    description: '插件包下载地址'
  })
});
export type MarketplaceToolListItemType = z.infer<typeof MarketplaceToolListItemSchema>;

export const MarketplaceToolDetailItemSchema = MarketplaceToolBaseSchema.extend({
  isLatestVersion: z.boolean().meta({ example: true, description: '是否为最新版本' }),
  children: z.array(MarketplaceToolDetailChildSchema).optional().meta({
    example: [],
    description: '工具集子工具详情列表'
  }),
  inputSchema: z
    .unknown()
    .optional()
    .meta({
      example: { type: 'object', properties: { query: { type: 'string' } } },
      description: '工具 JSON Schema 入参定义'
    }),
  outputSchema: z
    .unknown()
    .optional()
    .meta({
      example: { type: 'object', properties: { result: { type: 'string' } } },
      description: '工具 JSON Schema 出参定义'
    }),
  secretSchema: z
    .unknown()
    .optional()
    .meta({
      example: { type: 'object', properties: { apiKey: { type: 'string' } } },
      description: '工具密钥 JSON Schema 定义'
    }),
  versionDescription: I18nStringSchema.optional().meta({
    example: { en: 'Initial release', 'zh-CN': '首次发布' },
    description: '版本更新说明'
  }),
  permission: PluginPermissionListSchema.optional().meta({
    example: ['userInfo:read'],
    description: '工具运行所需的 FastGPT 权限'
  }),
  readme: z.string().meta({
    example: 'https://example.com/readme.md',
    description: 'README 内容或地址'
  })
});
export type MarketplaceToolDetailItemType = z.infer<typeof MarketplaceToolDetailItemSchema>;

export const MarketplaceToolDetailSchema = z.object({
  tools: z.array(MarketplaceToolDetailItemSchema).meta({
    example: [],
    description: '工具及子工具详情列表'
  }),
  downloadCount: IntSchema.meta({ example: 128, description: '顶层插件累计下载次数' }),
  downloadUrl: z.string().meta({
    example: 'https://example.com/fastgpt-web-search.pkg',
    description: '插件包下载地址'
  })
});

/* ============================================================================
 * API: 获取 Marketplace 工具列表
 * Route: POST /marketplace/api/tool/list
 * Method: POST
 * Description: 分页查询 FastGPT 插件市场中的系统工具
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetMarketplaceToolsBodySchema = PaginationSchema.extend({
  searchKey: z.string().optional().meta({
    example: 'search',
    description: '按工具名称、简介或 ID 搜索'
  }),
  tags: z
    .array(z.string())
    .nullish()
    .meta({
      example: ['search'],
      description: '工具标签 ID 列表，命中任一标签即可'
    }),
  source: MarketplaceSourceFilterSchema.optional()
});
export type GetMarketplaceToolsBodyType = z.infer<typeof GetMarketplaceToolsBodySchema>;

export const MarketplaceToolsResponseSchema = PaginationResponseSchema(
  MarketplaceToolListItemSchema
);
export type MarketplaceToolsResponseType = z.infer<typeof MarketplaceToolsResponseSchema>;

/* ============================================================================
 * API: 获取 Marketplace 工具详情
 * Route: GET /marketplace/api/tool/detail
 * Method: GET
 * Description: 获取指定工具或工具集子工具详情
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetMarketplaceToolDetailQuerySchema = z.object({
  toolId: z.string().trim().min(1).meta({
    example: 'fastgpt-web-search',
    description: '工具 ID，支持工具集子工具 ID'
  }),
  version: z.string().trim().min(1).optional().meta({
    example: '1.0.0',
    description: '指定插件版本；为空时使用最新版本'
  })
});
export type GetMarketplaceToolDetailQueryType = z.infer<typeof GetMarketplaceToolDetailQuerySchema>;

export type GetMarketplaceToolDetailResponseType = z.infer<typeof MarketplaceToolDetailSchema>;

/* ============================================================================
 * API: 获取单个 Marketplace 工具下载地址
 * Route: GET /marketplace/api/tool/getDownloadUrl
 * Method: GET
 * Description: 获取指定工具版本的插件包下载地址
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetMarketplaceDownloadUrlQuerySchema = GetMarketplaceToolDetailQuerySchema.pick({
  toolId: true,
  version: true
});
export type GetMarketplaceDownloadUrlQueryType = z.infer<
  typeof GetMarketplaceDownloadUrlQuerySchema
>;

export const GetMarketplaceDownloadUrlResponseSchema = z.string().min(1).meta({
  example: 'https://example.com/fastgpt-web-search.pkg',
  description: '插件包下载地址'
});
export type GetMarketplaceDownloadUrlResponseType = z.infer<
  typeof GetMarketplaceDownloadUrlResponseSchema
>;

/* ============================================================================
 * API: 批量获取 Marketplace 工具下载地址
 * Route: POST /marketplace/api/tool/getDownloadUrl
 * Method: POST
 * Description: 批量获取工具插件包下载地址
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetMarketplaceDownloadUrlsBodySchema = z.object({
  toolIds: z
    .array(z.string().trim().min(1))
    .min(1)
    .meta({
      example: ['fastgpt-web-search', 'fastgpt-image-tool'],
      description: '需要下载的工具 ID 列表'
    })
});
export type GetMarketplaceDownloadUrlsBodyType = z.infer<
  typeof GetMarketplaceDownloadUrlsBodySchema
>;

export const GetMarketplaceDownloadUrlsResponseSchema = z.array(
  z.string().min(1).meta({
    example: 'https://example.com/fastgpt-web-search.pkg',
    description: '插件包下载地址'
  })
);
export type GetMarketplaceDownloadUrlsResponseType = z.infer<
  typeof GetMarketplaceDownloadUrlsResponseSchema
>;

// Upload marketplace pkg
export const UploadMarketplacePkgBodySchema = z.object({
  file: z.any(),
  source: MarketplacePkgSourceSchema.optional().default(MarketplaceOfficialSource)
});
export const UploadMarketplacePkgDataSchema = z.object({
  source: MarketplacePkgSourceSchema.optional().default(MarketplaceOfficialSource)
});
export type UploadMarketplacePkgDataType = z.infer<typeof UploadMarketplacePkgDataSchema>;

export const UploadMarketplacePkgResponseSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  etag: z.string(),
  source: MarketplacePkgSourceSchema,
  downloadUrl: z.string(),
  tool: z.record(z.string(), z.unknown())
});
export type UploadMarketplacePkgResponseType = z.infer<typeof UploadMarketplacePkgResponseSchema>;

/* ============================================================================
 * API: 删除 marketplace 插件
 * Route: POST /marketplace/api/admin/pkg/delete
 * Method: POST
 * Description: 手动删除指定来源下某个插件版本的 marketplace 记录及存储文件
 * Tags: ['Plugin', 'Marketplace', 'Admin', 'Delete']
 * ============================================================================ */

export const DeleteMarketplacePkgBodySchema = z.object({
  pluginId: z.string().trim().min(1).meta({
    example: 'fastgpt-tool',
    description: '插件 ID'
  }),
  version: z.string().trim().min(1).meta({
    example: '1.0.0',
    description: '插件版本'
  }),
  source: MarketplacePkgSourceSchema.optional().default(MarketplaceOfficialSource).meta({
    example: MarketplaceOfficialSource,
    description: '插件来源, 默认 official'
  })
});
export type DeleteMarketplacePkgBodyType = z.infer<typeof DeleteMarketplacePkgBodySchema>;

export const DeleteMarketplacePkgResponseSchema = z.object({
  pluginId: z.string().meta({ example: 'fastgpt-tool', description: '插件 ID' }),
  version: z.string().meta({ example: '1.0.0', description: '插件版本' }),
  source: MarketplacePkgSourceSchema.meta({
    example: MarketplaceOfficialSource,
    description: '插件来源'
  })
});
export type DeleteMarketplacePkgResponseType = z.infer<typeof DeleteMarketplacePkgResponseSchema>;

/* ============================================================================
 * API: 获取 Marketplace 工具标签
 * Route: GET /marketplace/api/tool/tags
 * Method: GET
 * Description: 获取插件市场用于筛选系统工具的内置标签
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetMarketplaceToolTagsResponseSchema = z.array(PluginToolTagSchema).meta({
  example: [
    {
      tagId: 'search',
      tagName: { en: 'Search', 'zh-CN': '搜索' },
      tagOrder: 0,
      isSystem: true
    }
  ],
  description: '插件市场工具标签列表'
});
export type GetMarketplaceToolTagsResponseType = z.infer<
  typeof GetMarketplaceToolTagsResponseSchema
>;

/* ============================================================================
 * API: 获取 Marketplace 工具版本列表
 * Route: GET /marketplace/api/tool/versions
 * Method: GET
 * Description: 获取全部市场工具版本，或按工具 ID 筛选版本
 * Tags: ['系统工具', 'Read']
 * ============================================================================ */

export const GetMarketplaceToolVersionsQuerySchema = z.object({
  toolId: z.string().trim().min(1).optional().meta({
    example: 'fastgpt-web-search',
    description: '工具 ID；为空时返回全部工具版本'
  })
});
export type GetMarketplaceToolVersionsQueryType = z.infer<
  typeof GetMarketplaceToolVersionsQuerySchema
>;
export const MarketplaceToolVersionSchema = z.object({
  toolId: z.string().meta({ example: 'fastgpt-web-search', description: '工具 ID' }),
  version: z.string().meta({ example: '1.0.0', description: '插件版本' }),
  etag: z.string().optional().meta({
    example: 'sha256:abc123',
    description: '插件包内容标识'
  })
});
export type MarketplaceToolVersionType = z.infer<typeof MarketplaceToolVersionSchema>;
export const GetMarketplaceToolVersionsResponseSchema = z.array(MarketplaceToolVersionSchema).meta({
  example: [{ toolId: 'fastgpt-web-search', version: '1.0.0', etag: 'sha256:abc123' }],
  description: '市场工具版本列表'
});
export type GetMarketplaceToolVersionsResponseType = z.infer<
  typeof GetMarketplaceToolVersionsResponseSchema
>;
