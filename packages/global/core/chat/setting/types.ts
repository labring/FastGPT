import { z } from 'zod';
import { extendZodWithOpenApi } from '@anatine/zod-openapi';
import { ObjectIdSchema } from '../../../common/tsRest/types';
import { ChatFavouriteTagSchema } from '../favouriteApp/types';

extendZodWithOpenApi(z);

export const ChatQuickAppSchema = z.object({
  _id: ObjectIdSchema,
  name: z.string().openapi({ example: 'FastGPT' }),
  avatar: z.string().openapi({ example: 'https://fastgpt.com/avatar.png' })
});
export type ChatQuickAppType = z.infer<typeof ChatQuickAppSchema>;

export const ChatSelectedToolSchema = z.object({
  pluginId: z.string().openapi({ example: 'systemTool-getTime' }),
  inputs: z.record(z.string(), z.any()).optional(),
  name: z.string().openapi({ example: 'FastGPT' }),
  avatar: z.string().openapi({ example: 'https://fastgpt.com/avatar.png' })
});
export type ChatSelectedToolType = z.infer<typeof ChatSelectedToolSchema>;

export const ChatSettingSchema = z.object({
  _id: ObjectIdSchema,
  appId: ObjectIdSchema,
  teamId: ObjectIdSchema,
  slogan: z.string().openapi({ example: '你好👋，我是 FastGPT ! 请问有什么可以帮你？' }),
  dialogTips: z.string().openapi({ example: '你可以问我任何问题' }),
  enableHome: z.boolean().openapi({ example: true }),
  homeTabTitle: z.string().openapi({ example: '首页' }),
  wideLogoUrl: z.string().optional().openapi({
    example:
      '/api/system/img/avatar/686f319cbb6eea8840884338/2025_09_30/9f77bd74be89c71cd3b97bd2fb8b2c05_DeviconMysql.png'
  }),
  squareLogoUrl: z.string().optional().openapi({
    example:
      '/api/system/img/avatar/686f319cbb6eea8840884338/2025_09_30/9f77bd74be89c71cd3b97bd2fb8b2c05_DeviconMysql.png'
  }),
  selectedTools: z
    .array(ChatSelectedToolSchema.pick({ pluginId: true, inputs: true }))
    .openapi({ example: [{ pluginId: 'systemTool-getTime', inputs: {} }] }),
  quickAppIds: z
    .array(ObjectIdSchema)
    .openapi({ example: ['68ac3dc6a717b3bcacc749bb', '68ac2da6a717b3bcacc73032'] }),
  favouriteTags: z
    .array(ChatFavouriteTagSchema)
    .openapi({ example: [{ id: 'i7Ege2W2', name: '游戏' }] })
});
export type ChatSettingType = z.infer<typeof ChatSettingSchema>;

export const ChatSettingResponseSchema = z.object({
  ...ChatSettingSchema.omit({ quickAppIds: true, selectedTools: true }).shape,
  quickAppList: z.array(ChatQuickAppSchema),
  selectedTools: z.array(ChatSelectedToolSchema)
});
export type ChatSettingResponseType = z.infer<typeof ChatSettingResponseSchema>;

export type ChatSettingUpdateType = Partial<z.infer<typeof ChatSettingSchema>>;
