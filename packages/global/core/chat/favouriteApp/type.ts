import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';

export const ChatFavouriteTagSchema = z.object({
  id: z.string().meta({ example: 'ptqn6v4I', description: '精选应用标签 ID' }),
  name: z.string().meta({ example: '效率', description: '精选应用标签名称' })
});
export type ChatFavouriteTagType = z.infer<typeof ChatFavouriteTagSchema>;

export const ChatFavouriteAppModelSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  appId: ObjectIdSchema,
  favouriteTags: z
    .array(z.string())
    .meta({ example: ['ptqn6v4I', 'jHLWiqff'], description: '精选应用标签' }),
  order: z.number().meta({ example: 1, description: '排序' })
});
export type ChatFavouriteAppModelType = z.infer<typeof ChatFavouriteAppModelSchema>;

export const ChatFavouriteAppSchema = z.object({
  ...ChatFavouriteAppModelSchema.shape,
  name: z.string().meta({ example: 'Jina 网页阅读', description: '精选应用名称' }),
  intro: z.string().optional().meta({ example: '', description: '精选应用简介' }),
  avatar: z.string().optional().meta({
    example: '/api/system/img/avatar/68ad85a7463006c963799a05/79183cf9face95d336816f492409ed29',
    description: '精选应用头像'
  })
});
export type ChatFavouriteAppType = z.infer<typeof ChatFavouriteAppSchema>;
