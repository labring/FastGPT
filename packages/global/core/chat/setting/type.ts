import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';
import { ChatFavouriteTagSchema } from '../favouriteApp/type';

export const ChatSelectedToolSchema = z.object({
  pluginId: ObjectIdSchema,
  inputs: z.record(z.string(), z.any()).meta({ example: null, description: '工具输入参数' }),
  name: z.string().meta({ example: '测试应用', description: '工具名称' }),
  avatar: z.string().meta({ example: '测试应用', description: '工具头像' })
});
export type ChatSelectedToolType = z.infer<typeof ChatSelectedToolSchema>;

export const ChatQuickAppSchema = z.object({
  _id: ObjectIdSchema,
  name: z.string().meta({ example: '测试应用', description: '快捷应用名称' }),
  avatar: z.string().meta({ example: '测试应用', description: '快捷应用头像' })
});
export type ChatQuickAppType = z.infer<typeof ChatQuickAppSchema>;

export const ChatSettingModelSchema = z.object({
  _id: ObjectIdSchema,
  appId: ObjectIdSchema,
  teamId: ObjectIdSchema,
  slogan: z
    .string()
    .optional()
    .meta({ example: '你好👋，我是 FastGPT ! 请问有什么可以帮你？', description: 'Slogan' }),
  dialogTips: z
    .string()
    .optional()
    .meta({ example: '你可以问我任何问题', description: '对话提示' }),
  enableHome: z.boolean().optional().meta({ example: true, description: '是否启用首页' }),
  homeTabTitle: z.string().optional().meta({ example: 'FastGPT', description: '首页标签' }),
  wideLogoUrl: z.string().optional().meta({
    example: '/api/system/img/avatar/68ad85a7463006c963799a05/79183cf9face95d336816f492409ed29',
    description: '宽 LOGO'
  }),
  squareLogoUrl: z.string().optional().meta({
    example: '/api/system/img/avatar/68ad85a7463006c963799a05/79183cf9face95d336816f492409ed29',
    description: '方 LOGO'
  }),
  quickAppIds: z
    .array(ObjectIdSchema)
    .meta({ example: ['68ad85a7463006c963799a05'], description: '快捷应用 ID 列表' }),
  selectedTools: z.array(ChatSelectedToolSchema.pick({ pluginId: true, inputs: true })).meta({
    example: [{ pluginId: '68ad85a7463006c963799a05', inputs: {} }],
    description: '已选工具列表'
  }),
  favouriteTags: z.array(ChatFavouriteTagSchema).meta({
    example: [
      { id: 'ptqn6v4I', name: '效率' },
      { id: 'jHLWiqff', name: '学习' }
    ],
    description: '精选应用标签列表'
  })
});
export type ChatSettingModelType = z.infer<typeof ChatSettingModelSchema>;

export const ChatSettingSchema = z.object({
  ...ChatSettingModelSchema.omit({ quickAppIds: true }).shape,
  quickAppList: z.array(ChatQuickAppSchema).meta({
    example: [{ _id: '68ad85a7463006c963799a05', name: '测试应用', avatar: '测试应用' }],
    description: '快捷应用列表'
  }),
  selectedTools: z.array(ChatSelectedToolSchema).meta({
    example: [
      {
        pluginId: '68ad85a7463006c963799a05',
        inputs: {},
        name: '获取当前应用',
        avatar: '/icon/logo.svg'
      }
    ],
    description: '已选工具列表'
  })
});
export type ChatSettingType = z.infer<typeof ChatSettingSchema>;
