import { Schema } from 'mongoose';
import z from 'zod';
import { getMongoModel } from '..';

export const MarketplaceToolZodSchema = z.object({
  type: z.literal('tool'),
  pluginId: z.string(),
  version: z.string(),
  etag: z.string(),
  tool: z.record(z.string(), z.unknown()),
  downloadObjectKey: z.string(),
  downloadUrl: z.string(),
  readmeUrl: z.string().optional(),
  filename: z.string(),
  size: z.number(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date()
});

export type MarketplaceToolSchemaType = z.infer<typeof MarketplaceToolZodSchema>;

const marketplaceToolSchema = new Schema(
  {
    type: { type: String, required: true, enum: ['tool'] },
    pluginId: { type: String, required: true },
    version: { type: String, required: true },
    etag: { type: String, required: true },
    tool: { type: Object, required: true },
    downloadObjectKey: { type: String, required: true },
    downloadUrl: { type: String, required: true },
    readmeUrl: { type: String },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
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
