import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatSourceEnum } from '../../chat/constants';
import { AppLogKeysEnum } from './constants';
import { z } from 'zod';

export const AppLogKeysSchema = z.object({
  key: z.enum(AppLogKeysEnum),
  enable: z.boolean()
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
  createTime: z.date(),
  updateTime: z.date(),

  chatItemCount: z.number(),
  errorCount: z.number(),
  totalPoints: z.number(),
  goodFeedbackCount: z.number(),
  badFeedbackCount: z.number(),
  totalResponseTime: z.number(),

  isFirstChat: z.boolean() // whether this is the user's first session in the app
});
export type AppChatLogSchema = z.infer<typeof AppChatLogSchema>;
