import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatSourceEnum } from '../../chat/constants';
import { AppLogKeysEnum } from './constants';
import z from 'zod';
import { BoolSchema, NumSchema } from '../../../common/zod';

export const AppLogKeysSchema = z.object({
  key: z.enum(AppLogKeysEnum).meta({
    example: AppLogKeysEnum.SOURCE,
    description: '日志列标识，对应导出和列表中可展示的日志字段'
  }),
  enable: BoolSchema.meta({
    example: true,
    description: '该日志列是否在当前应用中启用'
  })
});
export type AppLogKeysType = z.infer<typeof AppLogKeysSchema>;

export const AppLogKeysSchemaType = z.object({
  teamId: z.string(),
  appId: z.string(),
  logKeys: z.array(AppLogKeysSchema)
});
export type AppLogKeysSchemaType = z.infer<typeof AppLogKeysSchemaType>;

export const AppChatLogSchema = z.object({
  _id: ObjectIdSchema,
  appId: ObjectIdSchema,
  teamId: ObjectIdSchema,
  chatId: z.string(),
  userId: z.string(),
  source: z.enum(ChatSourceEnum),
  sourceName: z.string().optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date(),

  chatItemCount: NumSchema,
  errorCount: NumSchema,
  totalPoints: NumSchema,
  goodFeedbackCount: NumSchema,
  badFeedbackCount: NumSchema,
  totalResponseTime: NumSchema,

  isFirstChat: BoolSchema // whether this is the user's first session in the app
});
export type AppChatLogSchema = z.infer<typeof AppChatLogSchema>;
