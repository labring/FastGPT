import { Schema } from 'mongoose';
import z from 'zod';
import { defineIndex, getMongoModel } from '..';

export const pluginTypeEnum = z.enum(['tool']);

export const PluginZodSchema = z.object({
  type: z.literal('tool'),
  toolId: z.string(),
  downloadCount: z.number(),
  time: z.coerce.date()
});

export type MongoPluginSchemaType = z.infer<typeof PluginZodSchema>;

const downloadCountSchema = new Schema({
  toolId: { type: String, required: true },
  type: { type: String, required: true, enum: Object.values(pluginTypeEnum.enum) },
  downloadCount: { type: Number, required: true, default: 0 },
  time: { type: Date, required: true }
});

// 复合索引：type + toolId + time
defineIndex(downloadCountSchema, {
  key: { type: 1, toolId: 1, time: 1 },
  options: { unique: true }
});

export const MongoDownloadCount = getMongoModel('plugin_download_counts', downloadCountSchema);
