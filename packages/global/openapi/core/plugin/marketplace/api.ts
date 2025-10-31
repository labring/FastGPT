import { z } from 'zod';
import { ToolDetailSchema, ToolSimpleSchema } from '@fastgpt-sdk/plugin';
import { PaginationPropsSchema } from '../../../api';
import { PluginToolTagSchema } from '../../../../core/plugin/type';

// Create intersection types for extended schemas
export const MarketplaceToolListItemSchema = ToolSimpleSchema.extend({
  downloadUrl: z.string()
});

export type MarketplaceToolListItemType = z.infer<typeof MarketplaceToolListItemSchema>;

export const MarketplaceToolDetailItemSchema = ToolDetailSchema.extend({
  readme: z.string().optional()
});

export const MarketplaceToolDetailSchema = z.object({
  tools: z.array(MarketplaceToolDetailItemSchema),
  downloadUrl: z.string()
});

// List
export const GetMarketplaceToolsBodySchema = PaginationPropsSchema(
  z.object({
    searchKey: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
);
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
