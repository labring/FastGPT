import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

export const GetChatFavouriteListParamsSchema = z.object({
  name: z.string().optional().meta({ example: '测试应用', description: '精选应用名称' }),
  tag: z.string().optional().meta({ example: '效率', description: '精选应用标签' })
});
export type GetChatFavouriteListParamsType = z.infer<typeof GetChatFavouriteListParamsSchema>;

export const UpdateFavouriteAppTagsParamsSchema = z.object({
  id: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '精选应用 ID' }),
  tags: z.array(z.string()).meta({ example: ['效率', '工具'], description: '精选应用标签' })
});

export const UpdateFavouriteAppParamsSchema = z.object({
  appId: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '精选应用 ID' }),
  order: z.number().meta({ example: 1, description: '排序' })
});
export type UpdateFavouriteAppParamsType = z.infer<typeof UpdateFavouriteAppParamsSchema>;
