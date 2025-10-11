import { z } from 'zod';
import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { ObjectIdSchema } from '../../../common/type';

extendZodWithOpenApi(z);

export const ChatFavouriteTagSchema = z.object({
  id: z.string().openapi({ example: 'i7Ege2W2' }),
  name: z.string().openapi({ example: '游戏' })
});
export type ChatFavouriteTagType = z.infer<typeof ChatFavouriteTagSchema>;

export const ChatFavouriteAppSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  appId: ObjectIdSchema,
  favouriteTags: z.array(z.string()).openapi({ example: ['i7Ege2W2', 'i7Ege2W3'] }),
  order: z.number().openapi({ example: 1 })
});
export type ChatFavouriteAppType = z.infer<typeof ChatFavouriteAppSchema>;

export const ChatFavouriteAppResponseItemSchema = z.object({
  ...ChatFavouriteAppSchema.shape,
  name: z.string().openapi({ example: 'FastGPT' }),
  intro: z.string().openapi({ example: 'FastGPT' }),
  avatar: z.string().openapi({ example: 'https://fastgpt.com/avatar.png' })
});

export type ChatFavouriteAppResponseItemType = z.infer<typeof ChatFavouriteAppResponseItemSchema>;
