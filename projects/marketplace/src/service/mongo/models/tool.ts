import { Schema } from 'mongoose';
import z from 'zod';
import { getMongoModel } from '..';

export const MarketplaceToolIndexZodSchema = z.object({
  type: z.literal('tool'),
  pluginId: z.string(),
  version: z.string(),
  etag: z.string(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date()
});

export type MarketplaceToolIndexSchemaType = z.infer<typeof MarketplaceToolIndexZodSchema>;

export const MarketplaceToolManifestZodSchema = MarketplaceToolIndexZodSchema.extend({
  tool: z.record(z.string(), z.unknown()),
  downloadObjectKey: z.string(),
  downloadUrl: z.string(),
  readmeUrl: z.string().optional(),
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
    createTime: { type: Date, required: true, default: Date.now },
    updateTime: { type: Date, required: true, default: Date.now }
  },
  {
    minimize: false
  }
);

marketplaceToolSchema.index({ pluginId: 1, version: 1 }, { unique: true });
marketplaceToolSchema.index({ pluginId: 1, updateTime: -1 });

export const MongoMarketplaceTool = getMongoModel('marketplace_tools', marketplaceToolSchema);
