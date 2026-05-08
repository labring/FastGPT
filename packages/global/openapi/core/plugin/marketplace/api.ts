import z from 'zod';
import { PaginationSchema } from '../../../api';
import { PluginToolTagSchema } from '../../../../core/plugin/type';
import type { ToolListItemType } from '../../../../sdk/fastgpt-plugin';

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
  file: z.any()
});

export const UploadMarketplacePkgResponseSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  etag: z.string(),
  downloadUrl: z.string(),
  tool: z.record(z.string(), z.unknown())
});
export type UploadMarketplacePkgResponseType = z.infer<typeof UploadMarketplacePkgResponseSchema>;

// Tags
export const GetMarketplaceToolTagsResponseSchema = z.array(PluginToolTagSchema);
export type GetMarketplaceToolTagsResponseType = z.infer<
  typeof GetMarketplaceToolTagsResponseSchema
>;

// Versions
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
