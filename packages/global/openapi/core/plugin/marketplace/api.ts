import z from 'zod';
import { PaginationSchema } from '../../../api';
import { PluginToolTagSchema } from '../../../../core/plugin/type';
import type { ToolListItemType } from '../../../../sdk/fastgpt-plugin';

export const MarketplaceOfficialSource = 'official';
export const MarketplacePkgSourceSchema = z.string().trim().min(1);

const formatToolDetailSchema = z.object({});
const formatToolSimpleSchema = z.object({});

// Create intersection types for extended schemas
export const MarketplaceToolListItemSchema = formatToolSimpleSchema;
export type MarketplaceToolListItemType = ToolListItemType & {
  toolId: string;
  downloadCount: number;
  downloadUrl?: string;
};

export const MarketplaceToolDetailItemSchema = formatToolDetailSchema.extend({
  readme: z.string().optional()
});
export const MarketplaceToolDetailSchema = z.object({
  tools: z.array(MarketplaceToolDetailItemSchema)
});

// List
export const GetMarketplaceToolsBodySchema = PaginationSchema.extend({
  searchKey: z.string().optional(),
  tags: z.array(z.string()).nullish()
});
export type GetMarketplaceToolsBodyType = z.infer<typeof GetMarketplaceToolsBodySchema>;

export const MarketplaceToolsResponseSchema = z.object({
  total: z.number(),
  list: z.array(MarketplaceToolListItemSchema)
});
export type MarketplaceToolsResponseType = z.infer<typeof MarketplaceToolsResponseSchema>;

// Detail
export const GetMarketplaceToolDetailQuerySchema = z.object({
  toolId: z.string(),
  version: z.string().optional()
});
export type GetMarketplaceToolDetailQueryType = z.infer<typeof GetMarketplaceToolDetailQuerySchema>;

export type GetMarketplaceToolDetailResponseType = z.infer<typeof MarketplaceToolDetailSchema>;

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
export type DeleteMarketplacePkgResponseType = z.infer<
  typeof DeleteMarketplacePkgResponseSchema
>;

// Tags
export const GetMarketplaceToolTagsResponseSchema = z.array(PluginToolTagSchema);
export type GetMarketplaceToolTagsResponseType = z.infer<
  typeof GetMarketplaceToolTagsResponseSchema
>;

// Versions
export const GetMarketplaceToolVersionsQuerySchema = z.object({
  toolId: z.string().optional()
});
export type GetMarketplaceToolVersionsQueryType = z.infer<
  typeof GetMarketplaceToolVersionsQuerySchema
>;
export const MarketplaceToolVersionSchema = z.object({
  toolId: z.string(),
  version: z.string(),
  etag: z.string().optional()
});
export type MarketplaceToolVersionType = z.infer<typeof MarketplaceToolVersionSchema>;
export const GetMarketplaceToolVersionsResponseSchema = z.array(MarketplaceToolVersionSchema);
export type GetMarketplaceToolVersionsResponseType = z.infer<
  typeof GetMarketplaceToolVersionsResponseSchema
>;
