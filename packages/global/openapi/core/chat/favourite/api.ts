import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { ChatFavouriteAppSchema } from '../../../../core/chat/favouriteApp/type';

export const GetChatFavouriteListParamsSchema = z.object({
  name: z.string().optional().meta({ example: '测试应用', description: '精选应用名称' }),
  tag: z.string().optional().meta({ example: '效率', description: '精选应用标签' })
});
export type GetChatFavouriteListParamsType = z.infer<typeof GetChatFavouriteListParamsSchema>;

export const GetChatFavouriteListResponseSchema = z.array(ChatFavouriteAppSchema);
export type GetChatFavouriteListResponse = z.infer<typeof GetChatFavouriteListResponseSchema>;

export const UpdateFavouriteAppTagsParamsSchema = z.object({
  id: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '精选应用 ID' }),
  tags: z.array(z.string()).meta({ example: ['效率', '工具'], description: '精选应用标签' })
});

export const UpdateFavouriteAppTagsBodySchema = z.array(UpdateFavouriteAppTagsParamsSchema);
export type UpdateFavouriteAppTagsBody = z.infer<typeof UpdateFavouriteAppTagsBodySchema>;

export const UpdateFavouriteAppParamsSchema = z.object({
  appId: ObjectIdSchema.meta({ example: '68ad85a7463006c963799a05', description: '精选应用 ID' }),
  order: z.number().meta({ example: 1, description: '排序' })
});
export type UpdateFavouriteAppParamsType = z.infer<typeof UpdateFavouriteAppParamsSchema>;

export const UpdateFavouriteAppsBodySchema = z.array(UpdateFavouriteAppParamsSchema);
export type UpdateFavouriteAppsBody = z.infer<typeof UpdateFavouriteAppsBodySchema>;

export const ReorderFavouriteAppParamsSchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '精选应用 ID'
  }),
  order: z.number().meta({ example: 1, description: '排序' })
});

export const ReorderFavouriteAppsBodySchema = z.array(ReorderFavouriteAppParamsSchema);
export type ReorderFavouriteAppsBody = z.infer<typeof ReorderFavouriteAppsBodySchema>;

export const DeleteFavouriteAppQuerySchema = z.object({
  id: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '精选应用 ID'
  })
});
export type DeleteFavouriteAppQuery = z.infer<typeof DeleteFavouriteAppQuerySchema>;
