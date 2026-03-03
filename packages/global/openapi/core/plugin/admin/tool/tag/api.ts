import { PluginToolTagSchema } from '../../../../../../core/plugin/type';
import { z } from 'zod';

export const CreatePluginToolTagBodySchema = z.object({
  tagName: z.string()
});
export type CreatePluginToolTagBody = z.infer<typeof CreatePluginToolTagBodySchema>;

export const DeletePluginToolTagQuerySchema = z.object({
  tagId: z.string()
});
export type DeletePluginToolTagQuery = z.infer<typeof DeletePluginToolTagQuerySchema>;

export const UpdatePluginToolTagBodySchema = z.object({
  tagId: z.string(),
  tagName: z.string()
});
export type UpdatePluginToolTagBody = z.infer<typeof UpdatePluginToolTagBodySchema>;

export const UpdatePluginToolTagOrderBodySchema = z.object({
  tags: z.array(PluginToolTagSchema)
});
export type UpdatePluginToolTagOrderBody = z.infer<typeof UpdatePluginToolTagOrderBodySchema>;
