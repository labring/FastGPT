import { z } from 'zod';
import { type ToolSimpleType } from '../../../../sdk/fastgpt-plugin';
import { PaginationSchema } from '../../../api';
import { PluginToolTagSchema } from '../../../../core/plugin/type';

const formatToolDetailSchema = z.object({});
const formatToolSimpleSchema = z.object({});

// Create intersection types for extended schemas
export const MarketplaceToolListItemSchema = formatToolSimpleSchema;
export type MarketplaceToolListItemType = ToolSimpleType & {
  downloadCount: number;
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
  toolId: z.string()
});
export type GetMarketplaceToolDetailQueryType = z.infer<typeof GetMarketplaceToolDetailQuerySchema>;

export type GetMarketplaceToolDetailResponseType = z.infer<typeof MarketplaceToolDetailSchema>;

// Tags
export const GetMarketplaceToolTagsResponseSchema = z.array(PluginToolTagSchema);
export type GetMarketplaceToolTagsResponseType = z.infer<
  typeof GetMarketplaceToolTagsResponseSchema
>;

// Get installed plugins
export const GetSystemInstalledPluginsQuerySchema = z.object({
  type: z.enum(['tool']).optional()
});
export type GetSystemInstalledPluginsQueryType = z.infer<
  typeof GetSystemInstalledPluginsQuerySchema
>;
export const GetSystemInstalledPluginsResponseSchema = z.object({
  list: z.array(
    z.object({
      id: z.string(),
      version: z.string()
    })
  )
});
export type GetSystemInstalledPluginsResponseType = z.infer<
  typeof GetSystemInstalledPluginsResponseSchema
>;
