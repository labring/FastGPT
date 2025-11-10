import { PluginToolTagSchema } from '../../../../core/plugin/type';
import { z } from 'zod';

export const GetPluginToolTagsResponseSchema = z.array(PluginToolTagSchema);
export type GetPluginTagListResponse = z.infer<typeof GetPluginToolTagsResponseSchema>;
