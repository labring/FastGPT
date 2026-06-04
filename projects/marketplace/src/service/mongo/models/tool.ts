import { Schema } from 'mongoose';
import z from 'zod';
import { getMongoModel } from '..';
import {
  MarketplaceOfficialSource,
  MarketplacePkgSourceSchema
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';

export const MarketplaceToolIndexZodSchema = z.object({
  type: z.literal('tool'),
  pluginId: z.string(),
  version: z.string(),
  etag: z.string(),
  source: MarketplacePkgSourceSchema.optional(),
  filename: z.string().optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date()
});

export type MarketplaceToolIndexSchemaType = z.infer<typeof MarketplaceToolIndexZodSchema>;

export const MarketplaceToolManifestZodSchema = MarketplaceToolIndexZodSchema.extend({
  tool: z.record(z.string(), z.unknown()),
  downloadObjectKey: z.string(),
  downloadUrl: z.string(),
  readmeUrl: z.string().optional(),
  source: MarketplacePkgSourceSchema.optional().default(MarketplaceOfficialSource),
  filename: z.string(),
  size: z.number()
});

export type MarketplaceToolManifestSchemaType = z.infer<typeof MarketplaceToolManifestZodSchema>;

const marketplaceToolSchema = new Schema(
  {
    type: { type: String, required: true, enum: ['tool'] },
    pluginId: { type: String, required: true },
    version: { type: String, required: true },
    etag: { type: String, required: true },
    source: { type: String, required: true, default: MarketplaceOfficialSource },
    filename: { type: String },
    createTime: { type: Date, required: true, default: Date.now },
    updateTime: { type: Date, required: true, default: Date.now }
  },
  {
    minimize: false
  }
);

marketplaceToolSchema.index({ pluginId: 1, version: 1 }, { unique: true });
marketplaceToolSchema.index({ pluginId: 1, updateTime: -1 });
marketplaceToolSchema.index({ source: 1, pluginId: 1, updateTime: -1 });

export const MongoMarketplaceTool = getMongoModel('marketplace_tools', marketplaceToolSchema);
